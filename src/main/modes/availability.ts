import type { UsageMode } from "../../shared/settings";

// Usage-mode availability and the session lock (usage-modes spec, task 3.1).
// ALL-IN-ONE is not offered on Linux because the hint window cannot be excluded
// from screen capture there (see capture-invisibility). The mode is changeable
// only while no interview session is running.

export type Platform = "win32" | "darwin" | "linux";

const ALL_MODES: readonly UsageMode[] = ["all-in-one", "host", "viewer", "viewer-solo"];

export function isAvailable(mode: UsageMode, platform: Platform): boolean {
  if (mode === "all-in-one" && platform === "linux") return false;
  return true;
}

export function availableModes(platform: Platform): UsageMode[] {
  return ALL_MODES.filter((m) => isAvailable(m, platform));
}

/** Hint explaining why a mode is not selectable on this OS, or undefined if it is. */
export function unavailableReason(mode: UsageMode, platform: Platform): string | undefined {
  if (mode === "all-in-one" && platform === "linux") {
    return "ALL-IN-ONE is unavailable on Linux: the hint window cannot be hidden from screen capture. Use HOST + VIEWER instead.";
  }
  return undefined;
}

export type SelectResult =
  | { ok: true }
  | { ok: false; reason: "session-running" | "unavailable"; message: string };

export class ModeSelector {
  private sessionRunning = false;

  constructor(
    private mode: UsageMode,
    private readonly platform: Platform,
  ) {}

  get current(): UsageMode {
    return this.mode;
  }

  /** True while a session is running, when the mode cannot be changed. */
  get locked(): boolean {
    return this.sessionRunning;
  }

  /** Modes the selector may offer on this OS. */
  options(): UsageMode[] {
    return availableModes(this.platform);
  }

  setSessionRunning(running: boolean): void {
    this.sessionRunning = running;
  }

  select(mode: UsageMode): SelectResult {
    if (this.sessionRunning) {
      return { ok: false, reason: "session-running", message: "Stop the running session before changing the mode." };
    }
    if (!isAvailable(mode, this.platform)) {
      return { ok: false, reason: "unavailable", message: unavailableReason(mode, this.platform) ?? "Mode not available on this OS." };
    }
    this.mode = mode;
    return { ok: true };
  }
}

/** The current host platform, for wiring the selector in the main process. */
export function hostPlatform(): Platform {
  return process.platform as Platform;
}
