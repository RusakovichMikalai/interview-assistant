import { describe, expect, it } from "vitest";
import { markerFraction, windowVisibleInCapture, type Frame, type Rgb } from "../src/main/invisibility/self-check";

const MARKER: Rgb = { r: 255, g: 0, b: 255 }; // magenta the window paints

function fill(width: number, height: number, c: Rgb): Frame {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = c.r;
    rgba[i * 4 + 1] = c.g;
    rgba[i * 4 + 2] = c.b;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

describe("capture self-check (8.4)", () => {
  it("reports the window visible when protection is off (marker leaks into capture)", () => {
    const crop = fill(8, 8, MARKER);
    expect(windowVisibleInCapture(crop, MARKER)).toBe(true);
  });

  it("reports hidden when the crop shows the background, not the marker", () => {
    const crop = fill(8, 8, { r: 10, g: 10, b: 10 }); // desktop behind the excluded window
    expect(windowVisibleInCapture(crop, MARKER)).toBe(false);
  });

  it("matches within tolerance and measures the marker fraction", () => {
    const crop = fill(10, 10, { r: 250, g: 6, b: 250 }); // near-marker, within default tolerance 16
    expect(markerFraction(crop, MARKER)).toBe(1);
    expect(markerFraction(fill(10, 10, { r: 0, g: 0, b: 0 }), MARKER)).toBe(0);
  });

  it("ignores a handful of stray matching pixels below the floor", () => {
    const crop = fill(100, 100, { r: 0, g: 0, b: 0 });
    crop.rgba.set([255, 0, 255, 255], 0); // one magenta pixel out of 10000
    expect(windowVisibleInCapture(crop, MARKER)).toBe(false);
  });
});
