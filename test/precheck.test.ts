import { describe, expect, it } from "vitest";
import { channelLevel, silentChannelWarnings, SILENCE_FLOOR } from "../src/main/capture/precheck";

describe("pre-interview silence detection (4.5)", () => {
  it("reports zero level for a silent frame and a positive level for a tone", () => {
    expect(channelLevel(new Float32Array(1000))).toBe(0);

    const tone = new Float32Array(1000);
    for (let i = 0; i < tone.length; i++) tone[i] = Math.sin((i / 1000) * 2 * Math.PI);
    expect(channelLevel(tone)).toBeGreaterThan(SILENCE_FLOOR);
  });

  it("warns about a silent channel and names its device", () => {
    const warnings = silentChannelWarnings([
      { kind: "system", device: "Stereo Mix", level: 0 },
      { kind: "mic", device: "USB Mic", level: 0.2 },
    ]);
    expect(warnings).toEqual(['System audio is not captured on "Stereo Mix"']);
  });

  it("stays quiet when both channels have signal", () => {
    expect(
      silentChannelWarnings([
        { kind: "system", device: "Stereo Mix", level: 0.1 },
        { kind: "mic", device: "USB Mic", level: 0.2 },
      ]),
    ).toEqual([]);
  });
});
