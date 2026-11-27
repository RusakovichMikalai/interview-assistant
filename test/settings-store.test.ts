import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SettingsStore } from "../src/main/settings-store";
import { DEFAULT_SETTINGS, type Settings } from "../src/shared/settings";

let file: string;

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ia-settings-"));
  file = path.join(dir, "settings.json");
});

describe("SettingsStore", () => {
  it("returns defaults when no file exists", async () => {
    const store = new SettingsStore(file);
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips settings", async () => {
    const store = new SettingsStore(file);
    const next: Settings = {
      ...DEFAULT_SETTINGS,
      mode: "viewer",
      language: "en",
      profiles: [{ id: "p1", name: "Claude", adapter: "anthropic", role: "fast", keyRef: "ref-1" }],
    };
    await store.save(next);

    const reloaded = new SettingsStore(file);
    expect(await reloaded.load()).toEqual(next);
  });

  it("persists no secret key values, only a keyRef", async () => {
    const store = new SettingsStore(file);
    // A profile carrying a stray apiKey field must not reach disk.
    const dirty = {
      ...DEFAULT_SETTINGS,
      profiles: [
        { id: "p1", name: "DeepSeek", adapter: "openai-compatible", role: "deep", keyRef: "ref-2", apiKey: "sk-SECRET-123" },
      ],
    };
    await store.save(dirty as unknown as Settings);

    const raw = await fs.readFile(file, "utf8");
    expect(raw).not.toContain("sk-SECRET-123");
    expect(raw).not.toContain("apiKey");
    expect(raw).toContain("ref-2");
  });

  it("drops invalid top-level values to defaults", async () => {
    await fs.writeFile(file, JSON.stringify({ mode: "bogus", language: "fr", profiles: "nope" }), "utf8");
    const loaded = await new SettingsStore(file).load();
    expect(loaded.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(loaded.language).toBe(DEFAULT_SETTINGS.language);
    expect(loaded.profiles).toEqual([]);
  });
});
