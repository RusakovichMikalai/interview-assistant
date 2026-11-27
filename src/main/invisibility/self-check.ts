// Capture self-check (capture-invisibility spec, task 8.4). The window paints a
// known marker colour; the self-check grabs the screen through the OS capture API
// (desktopCapturer, main process) and crops the window's screen rect. If the marker
// is present in that crop, the window leaked into the capture - hiding is off or
// unsupported. This module is the pure detector; the desktopCapturer grab is the
// thin runtime wrapper around it.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Frame {
  width: number;
  height: number;
  /** RGBA bytes, length = width * height * 4. */
  rgba: Uint8ClampedArray;
}

/** Fraction of pixels whose colour matches the marker within `tolerance` (0..1). */
export function markerFraction(frame: Frame, marker: Rgb, tolerance = 16): number {
  const n = frame.width * frame.height;
  if (n === 0) return 0;
  const px = frame.rgba;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (
      Math.abs(px[o] - marker.r) <= tolerance &&
      Math.abs(px[o + 1] - marker.g) <= tolerance &&
      Math.abs(px[o + 2] - marker.b) <= tolerance
    ) {
      hit++;
    }
  }
  return hit / n;
}

/**
 * True when the window's marker shows up in the captured crop, i.e. the window is
 * visible to screen capture. `minFraction` guards against stray matching pixels.
 */
export function windowVisibleInCapture(
  crop: Frame,
  marker: Rgb,
  minFraction = 0.005,
  tolerance = 16,
): boolean {
  return markerFraction(crop, marker, tolerance) >= minFraction;
}
