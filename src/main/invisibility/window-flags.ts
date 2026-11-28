// Applies low-visibility window flags to a BrowserWindow (capture-invisibility
// spec, task 8.2). The decision lives in windowFlags (shared, pure); this only
// drives the Electron setters, so only the methods it needs are required here and
// it can be unit-tested with a fake window.
import { windowFlags, type WindowFlags } from "../../shared/invisibility";

export interface FlaggableWindow {
  setSkipTaskbar(skip: boolean): void;
  setAlwaysOnTop(flag: boolean): void;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void;
  setOpacity(opacity: number): void;
}

/** Apply the low-visibility flags for the given hide state and return what was
 *  applied. forward:true keeps hover and scroll reaching the window underneath,
 *  not only clicks. */
export function applyWindowFlags(
  win: FlaggableWindow,
  hidden: boolean,
  opts?: { clickThrough?: boolean; opacity?: number },
): WindowFlags {
  const f = windowFlags(hidden, opts);
  win.setSkipTaskbar(f.skipTaskbar);
  win.setAlwaysOnTop(f.alwaysOnTop);
  win.setIgnoreMouseEvents(f.clickThrough, { forward: true });
  win.setOpacity(f.opacity);
  return f;
}
