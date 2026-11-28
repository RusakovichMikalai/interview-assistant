import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BINDINGS,
  HOTKEY_ACTIONS,
  registerHotkeys,
  validateBindings,
  type HotkeyAction,
  type HotkeyBindings,
} from "../src/main/invisibility/hotkeys";

const noopHandlers = (): Record<HotkeyAction, () => void> => {
  const h = {} as Record<HotkeyAction, () => void>;
  for (const a of HOTKEY_ACTIONS) h[a] = vi.fn();
  return h;
};

describe("focus-free global hotkeys (8.3)", () => {
  it("defaults bind every action with no duplicate accelerator", () => {
    expect(validateBindings(DEFAULT_BINDINGS)).toEqual([]);
  });

  it("flags a missing binding and a duplicate accelerator", () => {
    const bad = { ...DEFAULT_BINDINGS, hint: "", "chain-fast": DEFAULT_BINDINGS["chain-deep"] } as HotkeyBindings;
    const errors = validateBindings(bad);
    expect(errors.some((e) => e.includes("missing binding for hint"))).toBe(true);
    expect(errors.some((e) => e.includes("duplicate accelerator"))).toBe(true);
  });

  it("registers every accelerator and reports the ones the OS refuses", () => {
    const refused = DEFAULT_BINDINGS.hint;
    const gs = {
      register: vi.fn((accel: string) => accel !== refused),
      unregisterAll: vi.fn(),
    };
    const failed = registerHotkeys(gs, DEFAULT_BINDINGS, noopHandlers());
    expect(gs.register).toHaveBeenCalledTimes(HOTKEY_ACTIONS.length);
    expect(failed).toEqual([refused]);
  });

  it("refuses to register any accelerator when bindings are invalid", () => {
    const gs = { register: vi.fn(() => true), unregisterAll: vi.fn() };
    const bad = { ...DEFAULT_BINDINGS, "scroll-up": "" } as HotkeyBindings;
    expect(() => registerHotkeys(gs, bad, noopHandlers())).toThrow(/invalid hotkey bindings/);
    expect(gs.register).not.toHaveBeenCalled();
  });

  it("invokes the action handler the accelerator was registered with", () => {
    const registry = new Map<string, () => void>();
    const gs = {
      register: vi.fn((accel: string, cb: () => void) => {
        registry.set(accel, cb);
        return true;
      }),
      unregisterAll: vi.fn(),
    };
    const handlers = noopHandlers();
    registerHotkeys(gs, DEFAULT_BINDINGS, handlers);
    registry.get(DEFAULT_BINDINGS["toggle-hide"])!();
    expect(handlers["toggle-hide"]).toHaveBeenCalledOnce();
    expect(handlers.hint).not.toHaveBeenCalled();
  });
});
