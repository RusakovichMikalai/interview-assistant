import { describe, expect, it } from "vitest";
import {
  PRESETS,
  addProfile,
  adapterFromProfile,
  findPreset,
  profileFromPreset,
  removeProfile,
  testProfile,
  updateProfile,
} from "../src/main/llm/presets";
import type { LlmProfile } from "../src/shared/settings";
import type { LlmAdapter, StreamSession } from "../src/shared/llm";

const req = { system: "s", turns: [], question: "q" };

function okAdapter(chunks: string[]): LlmAdapter {
  return {
    profileId: "p",
    kind: "openai-compatible",
    start(): StreamSession {
      async function* gen() {
        for (const c of chunks) yield c;
      }
      return { tokens: gen(), abort() {} };
    },
  };
}

function errAdapter(msg: string): LlmAdapter {
  return {
    profileId: "p",
    kind: "anthropic",
    start(): StreamSession {
      async function* gen(): AsyncIterableIterator<string> {
        throw new Error(msg);
      }
      return { tokens: gen(), abort() {} };
    },
  };
}

describe("presets (6.1)", () => {
  it("offers the required providers", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(ids).toEqual(["claude", "deepseek", "groq", "cerebras", "openrouter", "ollama", "custom"]);
  });

  it("seeds a DeepSeek profile with its base URL and an editable model", () => {
    const p = profileFromPreset({ presetId: "deepseek", role: "fast", keyRef: "k1" });
    expect(p.adapter).toBe("openai-compatible");
    expect(p.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(p.model).toBe("deepseek-chat");
    expect(p.keyRef).toBe("k1");
    expect(p.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("uses an explicit model over the preset default", () => {
    const p = profileFromPreset({ presetId: "ollama", role: "deep", model: "qwen2.5" });
    expect(p.model).toBe("qwen2.5");
    expect(p.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("gives the Anthropic preset no base URL", () => {
    expect(findPreset("claude")!.baseUrl).toBeUndefined();
    expect(profileFromPreset({ presetId: "claude", role: "fast" }).baseUrl).toBeUndefined();
  });

  it("rejects an unknown preset", () => {
    expect(() => profileFromPreset({ presetId: "nope", role: "fast" })).toThrow(/unknown preset/);
  });
});

describe("profile CRUD (6.1)", () => {
  const a: LlmProfile = { id: "a", name: "A", adapter: "anthropic", role: "fast" };
  const b: LlmProfile = { id: "b", name: "B", adapter: "openai-compatible", role: "deep" };

  it("adds, updates and removes without mutating the input", () => {
    const list = addProfile([a], b);
    expect(list).toEqual([a, b]);

    const renamed = updateProfile(list, "a", { name: "A2", id: "hack" } as never);
    expect(renamed.find((p) => p.id === "a")!.name).toBe("A2");
    expect(renamed.find((p) => p.id === "a")!.id).toBe("a"); // id is not patchable

    expect(removeProfile(list, "a")).toEqual([b]);
    expect(list).toEqual([a, b]); // original untouched
  });
});

describe("test profile TTFT (6.1)", () => {
  it("returns the time to first token in ms", async () => {
    let i = 0;
    const now = () => [0, 450][i++];
    expect(await testProfile(okAdapter(["hi", "there"]), req, now)).toEqual({ ok: true, ttftMs: 450 });
  });

  it("returns the error text on failure", async () => {
    expect(await testProfile(errAdapter("boom"), req)).toEqual({ ok: false, error: "boom" });
  });

  it("reports an empty response", async () => {
    expect(await testProfile(okAdapter([]), req)).toEqual({ ok: false, error: "empty response" });
  });
});

describe("adapterFromProfile (6.1 extension point)", () => {
  const base = { id: "p", name: "n", role: "fast" as const };
  it("builds an adapter for each kind, carrying the profile id", () => {
    const anth = adapterFromProfile({ ...base, adapter: "anthropic", model: "claude-haiku-5-5" }, { apiKey: "k" });
    expect(anth.kind).toBe("anthropic");
    expect(anth.profileId).toBe("p");
    const oai = adapterFromProfile({ ...base, adapter: "openai-compatible", baseUrl: "http://x/v1", model: "m" }, { apiKey: "k" });
    expect(oai.kind).toBe("openai-compatible");
    const sub = adapterFromProfile({ ...base, adapter: "claude-subscription" }, { spawn: () => { throw new Error("no spawn in test"); } });
    expect(sub.kind).toBe("claude-subscription");
  });
  it("rejects a subscription profile without a spawn fn", () => {
    expect(() => adapterFromProfile({ ...base, adapter: "claude-subscription" })).toThrow(/spawn/);
  });
  it("every preset's adapter kind is dispatchable", () => {
    for (const p of PRESETS) {
      const profile = profileFromPreset({ presetId: p.id, role: "fast", model: p.model || "m" });
      expect(() => adapterFromProfile(profile, { apiKey: "k", spawn: () => { throw new Error("x"); } })).not.toThrow();
    }
  });
});
