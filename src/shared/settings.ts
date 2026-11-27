// Settings schema shared across processes.
// IMPORTANT: this object is persisted to disk as plain JSON. It must never hold
// secret values (API keys). Secrets live only in the OS keychain via SecretStore
// and are referenced here by `keyRef`.

export type UsageMode = "all-in-one" | "host" | "viewer" | "viewer-solo";
export type Language = "ru" | "en";
export type AdapterKind = "anthropic" | "openai-compatible" | "claude-subscription";
export type ProfileRole = "fast" | "deep";

export interface LlmProfile {
  id: string;
  name: string;
  adapter: AdapterKind;
  baseUrl?: string;
  model?: string;
  role: ProfileRole;
  /** Reference to a secret stored in the OS keychain, never the key itself. */
  keyRef?: string;
}

export interface Hotkeys {
  toggleHide: string;
  triggerHint: string;
  switchChain: string;
}

export interface Settings {
  mode: UsageMode;
  language: Language;
  profiles: LlmProfile[];
  hotkeys: Hotkeys;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "all-in-one",
  language: "ru",
  profiles: [],
  hotkeys: {
    toggleHide: "CommandOrControl+Shift+H",
    triggerHint: "CommandOrControl+Shift+Space",
    switchChain: "CommandOrControl+Shift+C",
  },
};

const MODES: UsageMode[] = ["all-in-one", "host", "viewer", "viewer-solo"];
const LANGS: Language[] = ["ru", "en"];

/** Fill missing fields from defaults and drop unknown/invalid top-level values. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  return {
    mode: MODES.includes(r.mode as UsageMode) ? (r.mode as UsageMode) : DEFAULT_SETTINGS.mode,
    language: LANGS.includes(r.language as Language) ? (r.language as Language) : DEFAULT_SETTINGS.language,
    profiles: Array.isArray(r.profiles) ? r.profiles.map(normalizeProfile) : [],
    hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...(r.hotkeys ?? {}) },
  };
}

function normalizeProfile(p: LlmProfile): LlmProfile {
  // Strip any stray secret-looking fields so they can never be persisted.
  const { id, name, adapter, baseUrl, model, role, keyRef } = p;
  return { id, name, adapter, baseUrl, model, role, keyRef };
}
