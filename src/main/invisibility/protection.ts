import { contentProtectionState, type ContentProtection } from "../../shared/invisibility";

// Applies the hide-from-capture state to a window (capture-invisibility spec,
// task 8.1). BrowserWindow.setContentProtection is the Electron call; only the
// method it needs is required here so the logic is testable without Electron.
export interface ProtectableWindow {
  setContentProtection(enabled: boolean): void;
}

/** Apply the requested hide state and return what the UI should show. On an
 *  unsupported OS the window is left capturable and the state says hiding is off. */
export function applyContentProtection(
  win: ProtectableWindow,
  platform: NodeJS.Platform,
  hidden: boolean,
): ContentProtection {
  const state = contentProtectionState(platform, hidden);
  if (state.supported) win.setContentProtection(state.hidden);
  return state;
}
