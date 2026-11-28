import type { LlmProfile, ProfileRole, Settings } from "../../shared/settings";
import type { LlmAdapter, LlmRequest } from "../../shared/llm";
import { anthropicAdapter, openaiCompatibleAdapter } from "./adapters/http";
import { claudeSubscriptionAdapter, type SpawnFn } from "./adapters/claude-subscription";
import { Router } from "./router";
import type { Timers } from "./timers";

// Provider presets and profile CRUD (llm-routing spec, task 6.1). Presets seed a
// profile with an adapter kind, base URL and a default (editable) model id; the
// API key is never part of a preset or a profile - it is stored by SecretStore and
// referenced through `keyRef`. CRUD helpers are pure and return new arrays, so the
// settings store stays the single persistence point. `testProfile` measures a
// profile's time to first token for the "Test" button. UI lives in the renderer.

export interface Preset {
  id: string;
  label: string;
  adapter: LlmProfile["adapter"];
  /** Omitted for Anthropic (adapter has its own endpoint); empty for user-filled. */
  baseUrl?: string;
  /** Default model id, editable by the user after the preset is applied. */
  model: string;
}

// Model defaults follow design D6. Ollama uses the local OpenAI-compatible endpoint.
export const PRESETS: readonly Preset[] = [
  { id: "claude", label: "Claude", adapter: "anthropic", model: "claude-haiku-5-5" },
  { id: "deepseek", label: "DeepSeek", adapter: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "groq", label: "Groq", adapter: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { id: "cerebras", label: "Cerebras", adapter: "openai-compatible", baseUrl: "https://api.cerebras.ai/v1", model: "llama-3.3-70b" },
  { id: "openrouter", label: "OpenRouter", adapter: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "" },
  { id: "ollama", label: "Ollama (local)", adapter: "openai-compatible", baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
  { id: "custom", label: "Custom", adapter: "openai-compatible", baseUrl: "", model: "" },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

function newId(): string {
  const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
  return randomUUID();
}

export interface ProfileFromPreset {
  presetId: string;
  name?: string;
  role: ProfileRole;
  /** Overrides the preset default; required for presets that ship an empty model. */
  model?: string;
  keyRef?: string;
}

/** Build a new profile from a preset. Throws for an unknown preset id. */
export function profileFromPreset(input: ProfileFromPreset): LlmProfile {
  const preset = findPreset(input.presetId);
  if (!preset) throw new Error(`unknown preset ${input.presetId}`);
  return {
    id: newId(),
    name: input.name ?? preset.label,
    adapter: preset.adapter,
    baseUrl: preset.baseUrl || undefined,
    model: (input.model ?? preset.model) || undefined,
    role: input.role,
    keyRef: input.keyRef,
  };
}

// --- CRUD on a profile list (pure; caller persists via the settings store) ---

export function addProfile(profiles: LlmProfile[], profile: LlmProfile): LlmProfile[] {
  return [...profiles, profile];
}

export function updateProfile(
  profiles: LlmProfile[],
  id: string,
  patch: Partial<Omit<LlmProfile, "id">>,
): LlmProfile[] {
  return profiles.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p));
}

export function removeProfile(profiles: LlmProfile[], id: string): LlmProfile[] {
  return profiles.filter((p) => p.id !== id);
}

// --- Profile -> adapter (the single provider extension point) ---
// This switch is the one place adapter kinds are dispatched. Adding a provider on
// an existing protocol needs no code here - just a new `PRESETS` row (e.g. any
// OpenAI-compatible API, like the `custom` preset). Adding a NEW protocol is one
// new `AdapterKind`, one adapter module, and one `case`; the exhaustive switch
// makes the compiler flag the missing case, so a new kind cannot be half-wired.
export interface AdapterDeps {
  /** API key resolved from the profile's `keyRef`; the main process reads it from
   *  SecretStore and passes it here, so secrets never live in a profile or preset. */
  apiKey?: string;
  /** Spawns the `claude` CLI; required only for the `claude-subscription` kind. */
  spawn?: SpawnFn;
  /** Injectable fetch for the HTTP adapters (tests). */
  fetchImpl?: typeof fetch;
}
/** Build a running adapter from a saved profile. Throws for an unknown kind. */
export function adapterFromProfile(p: LlmProfile, deps: AdapterDeps = {}): LlmAdapter {
  switch (p.adapter) {
    case "anthropic":
      return anthropicAdapter({ profileId: p.id, model: p.model ?? "", apiKey: deps.apiKey ?? "", baseUrl: p.baseUrl, fetchImpl: deps.fetchImpl });
    case "openai-compatible":
      return openaiCompatibleAdapter({ profileId: p.id, model: p.model ?? "", apiKey: deps.apiKey ?? "", baseUrl: p.baseUrl, fetchImpl: deps.fetchImpl });
    case "claude-subscription": {
      if (!deps.spawn) throw new Error("claude-subscription profile needs a spawn fn");
      return claudeSubscriptionAdapter({ profileId: p.id, spawn: deps.spawn });
    }
    default: {
      const exhaustive: never = p.adapter;
      throw new Error(`unknown adapter kind ${String(exhaustive)}`);
    }
  }
}

// --- Session wiring: build the router from saved settings (spec 6.13) ---
// Each role's profiles become that chain's primaries in list order; the
// designated fallback profile is appended as the shared backup and turns on
// sticky fallback. shortcut: one cross-chain fallback and role order as chain
// order; upgrade to a per-chain fallback picker when the settings UI grows one.
export function buildRouter(settings: Settings, timers: Timers, deps: AdapterDeps = {}): Router {
  const adapters = new Map<string, LlmAdapter>();
  const adapterFor = (p: LlmProfile): LlmAdapter => {
    let a = adapters.get(p.id);
    if (!a) {
      a = adapterFromProfile(p, deps);
      adapters.set(p.id, a);
    }
    return a;
  };
  const fallbackProfile = settings.profiles.find((p) => p.id === settings.fallbackProfileId);
  const fallback = fallbackProfile ? adapterFor(fallbackProfile) : undefined;
  const chainFor = (role: ProfileRole): LlmAdapter[] => {
    const list = settings.profiles
      .filter((p) => p.role === role && p.id !== settings.fallbackProfileId)
      .map(adapterFor);
    if (fallback) list.push(fallback);
    return list;
  };
  return new Router({ fast: chainFor("fast"), deep: chainFor("deep"), timers, stickyFallback: !!fallback });
}

// --- "Test" button: time to first token, or the error text ---

export type TestResult = { ok: true; ttftMs: number } | { ok: false; error: string };

/**
 * Sends one short request through the adapter and returns the time to first token
 * in ms, or the error text. `now` is injected so the measurement is deterministic
 * under test; it defaults to the wall clock.
 */
export async function testProfile(
  adapter: LlmAdapter,
  req: LlmRequest,
  now: () => number = Date.now,
): Promise<TestResult> {
  const t0 = now();
  const session = adapter.start(req);
  try {
    const first = await session.tokens.next();
    if (first.done) return { ok: false, error: "empty response" };
    return { ok: true, ttftMs: now() - t0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    session.abort();
  }
}
