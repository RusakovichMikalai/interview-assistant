import { promises as fs } from "node:fs";
import * as path from "node:path";
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "../shared/settings";

// Plain-JSON settings persistence. No secrets: see settings.ts.
// filePath is injected so the store is testable without Electron's app paths.
export class SettingsStore {
  private cache: Settings;

  constructor(private readonly filePath: string) {
    this.cache = DEFAULT_SETTINGS;
  }

  async load(): Promise<Settings> {
    try {
      const text = await fs.readFile(this.filePath, "utf8");
      this.cache = normalizeSettings(JSON.parse(text));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.cache = DEFAULT_SETTINGS;
    }
    return this.cache;
  }

  get(): Settings {
    return this.cache;
  }

  async save(next: Settings): Promise<void> {
    this.cache = normalizeSettings(next);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.cache, null, 2), "utf8");
  }
}
