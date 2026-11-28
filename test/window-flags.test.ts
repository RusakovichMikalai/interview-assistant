import { describe, expect, it, vi } from "vitest";
import { windowFlags } from "../src/shared/invisibility";
import { applyWindowFlags } from "../src/main/invisibility/window-flags";

describe("low-visibility window flags (8.2)", () => {
  it("leaves taskbar and switcher and stays on top only when hidden", () => {
    expect(windowFlags(true)).toMatchObject({ skipTaskbar: true, alwaysOnTop: true });
    expect(windowFlags(false)).toMatchObject({ skipTaskbar: false, alwaysOnTop: false });
  });

  it("carries independent click-through and clamps opacity to [0.1, 1]", () => {
    expect(windowFlags(false, { clickThrough: true }).clickThrough).toBe(true);
    expect(windowFlags(false, { opacity: 2 }).opacity).toBe(1);
    expect(windowFlags(false, { opacity: 0 }).opacity).toBe(0.1);
    expect(windowFlags(false, { opacity: 0.5 }).opacity).toBe(0.5);
  });

  it("drives the Electron setters, forwarding mouse events for click-through", () => {
    const win = {
      setSkipTaskbar: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      setOpacity: vi.fn(),
    };
    applyWindowFlags(win, true, { clickThrough: true, opacity: 0.8 });
    expect(win.setSkipTaskbar).toHaveBeenCalledWith(true);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(win.setOpacity).toHaveBeenCalledWith(0.8);
  });
});
