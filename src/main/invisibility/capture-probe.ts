// Runtime half of the capture self-check (capture-invisibility spec, task 8.4).
// Grabs the primary display through the OS capture API (desktopCapturer) and asks
// the pure detector in self-check.ts whether the window's marker colour leaked into
// that grab. If it did, the window is visible to screen capture - hiding is off or
// unsupported. Kept apart from self-check.ts so that file stays electron-free and
// unit-testable in a plain node environment.
import { desktopCapturer, screen } from "electron";

import { frameFromBgra, windowVisibleInCapture, type Rgb } from "./self-check";

/** Marker colour the hint window paints for the self-check: vivid magenta, a shade
 *  unlikely to occur on a real desktop, so a match means the window itself. */
export const CAPTURE_MARKER: Rgb = { r: 255, g: 0, b: 170 };

/** True when the window's marker shows up in a screen grab, i.e. the window is
 *  visible to capture. False also when no screen source is available. */
export async function captureShowsWindow(marker: Rgb = CAPTURE_MARKER): Promise<boolean> {
  const { width, height } = screen.getPrimaryDisplay().size;
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height } });
  if (sources.length === 0) return false;
  const img = sources[0].thumbnail;
  const size = img.getSize();
  // shortcut: scans the whole screen, not just the window rect; fine while the marker
  // colour is unique. Crop to the window's screen bounds if real desktops ever match it.
  return windowVisibleInCapture(frameFromBgra(size.width, size.height, img.toBitmap()), marker);
}
