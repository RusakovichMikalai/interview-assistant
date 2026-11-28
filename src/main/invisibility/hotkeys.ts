// Focus-free global hotkeys for in-session actions (capture-invisibility spec,
// task 8.3). globalShortcut registers an OS-level accelerator, so a press never
// moves focus away from the call window - the whole point of this layer. The
// action set, default accelerators and validation are pure data; registration is
// a thin wrapper over electron globalShortcut, injected so the mapping can be
// unit-tested without Electron.

export type HotkeyAction =
  | "hint"
  | "chain-fast"
  | "chain-deep"
  | "scroll-up"
  | "scroll-down"
  | "toggle-hide"
  | "toggle-click-through";

export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  "hint",
  "chain-fast",
  "chain-deep",
  "scroll-up",
  "scroll-down",
  "toggle-hide",
  "toggle-click-through",
];

export type HotkeyBindings = Record<HotkeyAction, string>;

export const DEFAULT_BINDINGS: HotkeyBindings = {
  hint: "CommandOrControl+Shift+Space",
  "chain-fast": "CommandOrControl+Shift+1",
  "chain-deep": "CommandOrControl+Shift+2",
  "scroll-up": "CommandOrControl+Shift+Up",
  "scroll-down": "CommandOrControl+Shift+Down",
  "toggle-hide": "CommandOrControl+Shift+H",
  "toggle-click-through": "CommandOrControl+Shift+T",
};

/** Reasons a binding map is unusable: an action with no accelerator, or two
 *  actions sharing one (the OS silently fails the second register). */
export function validateBindings(bindings: HotkeyBindings): string[] {
  const errors: string[] = [];
  const seen = new Map<string, HotkeyAction>();
  for (const action of HOTKEY_ACTIONS) {
    const accel = bindings[action];
    if (!accel) {
      errors.push(`missing binding for ${action}`);
      continue;
    }
    const other = seen.get(accel);
    if (other) errors.push(`duplicate accelerator ${accel} for ${action} and ${other}`);
    else seen.set(accel, action);
  }
  return errors;
}

export interface GlobalShortcut {
  register(accelerator: string, callback: () => void): boolean;
  unregisterAll(): void;
}

/** Register every action's accelerator. Throws on invalid bindings rather than
 *  register a broken subset. Returns the accelerators the OS refused (usually a
 *  conflict with another app), so the caller can warn the user. */
export function registerHotkeys(
  gs: GlobalShortcut,
  bindings: HotkeyBindings,
  handlers: Record<HotkeyAction, () => void>,
): string[] {
  const errors = validateBindings(bindings);
  if (errors.length) throw new Error(`invalid hotkey bindings: ${errors.join("; ")}`);
  const failed: string[] = [];
  for (const action of HOTKEY_ACTIONS) {
    const accel = bindings[action];
    if (!gs.register(accel, handlers[action])) failed.push(accel);
  }
  return failed;
}
