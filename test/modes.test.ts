import { describe, expect, it } from "vitest";
import {
  ModeSelector,
  availableModes,
  isAvailable,
  unavailableReason,
  type Platform,
} from "../src/main/modes/availability";

describe("availability matrix (3.1)", () => {
  it("offers all four modes on Windows and macOS", () => {
    for (const p of ["win32", "darwin"] as Platform[]) {
      expect(availableModes(p)).toEqual(["all-in-one", "host", "viewer", "viewer-solo"]);
    }
  });

  it("hides ALL-IN-ONE on Linux but keeps the other three", () => {
    expect(availableModes("linux")).toEqual(["host", "viewer", "viewer-solo"]);
    expect(isAvailable("all-in-one", "linux")).toBe(false);
    expect(isAvailable("host", "linux")).toBe(true);
  });

  it("explains why ALL-IN-ONE is unavailable on Linux and suggests HOST + VIEWER", () => {
    const reason = unavailableReason("all-in-one", "linux");
    expect(reason).toMatch(/Linux/);
    expect(reason).toMatch(/HOST \+ VIEWER/);
    expect(unavailableReason("all-in-one", "win32")).toBeUndefined();
  });
});

describe("mode lock during a session (3.1)", () => {
  it("changes mode when no session is running", () => {
    const sel = new ModeSelector("host", "win32");
    expect(sel.select("viewer")).toEqual({ ok: true });
    expect(sel.current).toBe("viewer");
  });

  it("refuses to change mode while a session runs and keeps the current mode", () => {
    const sel = new ModeSelector("host", "win32");
    sel.setSessionRunning(true);
    const res = sel.select("viewer");
    expect(res).toEqual({
      ok: false,
      reason: "session-running",
      message: "Stop the running session before changing the mode.",
    });
    expect(sel.current).toBe("host");
    expect(sel.locked).toBe(true);
  });

  it("allows the change again after the session stops", () => {
    const sel = new ModeSelector("host", "win32");
    sel.setSessionRunning(true);
    sel.select("viewer");
    sel.setSessionRunning(false);
    expect(sel.select("viewer").ok).toBe(true);
    expect(sel.current).toBe("viewer");
  });

  it("refuses an unavailable mode on this OS", () => {
    const sel = new ModeSelector("host", "linux");
    const res = sel.select("all-in-one");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unavailable");
    expect(sel.current).toBe("host");
  });
});
