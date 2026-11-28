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

/** Convert an OS screen bitmap - BGRA byte order, as Electron's
 *  NativeImage.toBitmap() returns - into the RGBA Frame the detector reads. */
export function frameFromBgra(width: number, height: number, bgra: ArrayLike<number>): Frame {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = bgra[i + 2];
    rgba[i + 1] = bgra[i + 1];
    rgba[i + 2] = bgra[i];
    rgba[i + 3] = bgra[i + 3];
  }
  return { width, height, rgba };
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
