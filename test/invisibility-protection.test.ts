import { describe, expect, it, vi } from "vitest";
import { contentProtectionState, contentProtectionSupported } from "../src/shared/invisibility";
import { applyContentProtection } from "../src/main/invisibility/protection";

describe("content protection (8.1)", () => {
  it("is available on Windows and macOS, not on Linux", () => {
    expect(contentProtectionSupported("win32")).toBe(true);
    expect(contentProtectionSupported("darwin")).toBe(true);
    expect(contentProtectionSupported("linux")).toBe(false);
  });

  it("labels the toggle state on a supported OS", () => {
    expect(contentProtectionState("win32", true)).toMatchObject({ hidden: true, disabled: false, label: "Hidden from capture" });
    expect(contentProtectionState("win32", false)).toMatchObject({ hidden: false, disabled: false, label: "Visible to capture" });
  });

  it("disables the toggle and recommends HOST + VIEWER on Linux", () => {
    const state = contentProtectionState("linux", true); // even if asked to hide
    expect(state).toMatchObject({ supported: false, hidden: false, disabled: true });
    expect(state.label).toContain("not supported");
    expect(state.label).toContain("HOST + VIEWER");
  });

  it("calls setContentProtection on a supported OS", () => {
    const win = { setContentProtection: vi.fn() };
    applyContentProtection(win, "win32", true);
    expect(win.setContentProtection).toHaveBeenCalledWith(true);
    applyContentProtection(win, "win32", false);
    expect(win.setContentProtection).toHaveBeenLastCalledWith(false);
  });

  it("never touches the window and never claims hidden on Linux", () => {
    const win = { setContentProtection: vi.fn() };
    const state = applyContentProtection(win, "linux", true);
    expect(win.setContentProtection).not.toHaveBeenCalled();
    expect(state.hidden).toBe(false);
  });
});
