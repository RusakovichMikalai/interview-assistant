// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { bindProtectionToggle, contentProtectionState, renderProtection } from "../src/renderer/protection-badge";

describe("protection indicator (8.1)", () => {
  it("derives the view from the platform (mirrors shared/invisibility)", () => {
    expect(contentProtectionState("win32", true)).toMatchObject({ disabled: false, hidden: true });
    expect(contentProtectionState("linux", true)).toMatchObject({ disabled: true, hidden: false });
    expect(contentProtectionState("", false).disabled).toBe(true); // unknown -> unsupported
  });

  it("shows the hidden state and flags it for styling", () => {
    const el = document.createElement("p");
    renderProtection(el, { supported: true, hidden: true, disabled: false, label: "Hidden from capture" });
    expect(el.textContent).toBe("Hidden from capture");
    expect(el.dataset.hidden).toBe("true");
    expect(el.dataset.disabled).toBe("false");
  });

  it("shows the unsupported message and disables the control", () => {
    const el = document.createElement("p");
    renderProtection(el, {
      supported: false,
      hidden: false,
      disabled: true,
      label: "Hiding from capture is not supported on this OS - use HOST + VIEWER mode",
    });
    expect(el.textContent).toContain("not supported");
    expect(el.dataset.disabled).toBe("true");
  });

  it("disables the toggle button on an unsupported OS and never fires", () => {
    const button = document.createElement("button");
    const onToggle = vi.fn();
    bindProtectionToggle(button, contentProtectionState("linux", false), onToggle);
    expect(button.disabled).toBe(true);
    button.click();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("flips the hide state on each click on a supported OS", () => {
    const button = document.createElement("button");
    const onToggle = vi.fn();
    bindProtectionToggle(button, contentProtectionState("win32", false), onToggle);
    expect(button.disabled).toBe(false);
    button.click();
    expect(onToggle).toHaveBeenNthCalledWith(1, true);
    button.click();
    expect(onToggle).toHaveBeenNthCalledWith(2, false);
  });
});
