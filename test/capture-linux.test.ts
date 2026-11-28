import { describe, expect, it } from "vitest";
import { parseSources, pickSource, wavHeader, STT_FORMAT } from "../src/main/capture/linux";

// Real `pactl list sources short` shape (index NAME driver sample-spec state).
const PACTL = `
47\tvirtual-call-mix.monitor\tPipeWire\tfloat32le 2ch 48000Hz\tRUNNING
57\talsa_output.pci-0000_06_00.1.hdmi-stereo.monitor\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED
62\talsa_output.pci-0000_06_00.6.analog-stereo.monitor\tPipeWire\ts16le 2ch 48000Hz\tRUNNING
63\talsa_input.pci-0000_06_00.6.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tRUNNING
`;

describe("linux capture source selection (4.3)", () => {
  it("parses sources and flags sink monitors", () => {
    const s = parseSources(PACTL);
    expect(s.map((x) => x.name)).toEqual([
      "virtual-call-mix.monitor",
      "alsa_output.pci-0000_06_00.1.hdmi-stereo.monitor",
      "alsa_output.pci-0000_06_00.6.analog-stereo.monitor",
      "alsa_input.pci-0000_06_00.6.analog-stereo",
    ]);
    expect(s.map((x) => x.monitor)).toEqual([true, true, true, false]);
  });

  it("ignores blank lines and placeholder names", () => {
    expect(parseSources("\n  \n")).toEqual([]);
  });

  it("picks a monitor for system and a real input for mic", () => {
    const s = parseSources(PACTL);
    expect(pickSource(s, "system")?.name).toBe("virtual-call-mix.monitor");
    expect(pickSource(s, "mic")?.name).toBe("alsa_input.pci-0000_06_00.6.analog-stereo");
  });

  it("returns undefined when no matching source exists", () => {
    expect(pickSource([{ name: "x.monitor", monitor: true }], "mic")).toBeUndefined();
  });
});

describe("wav header (4.3 verify)", () => {
  it("writes a canonical 44-byte PCM header for the STT format", () => {
    const h = wavHeader(32000, STT_FORMAT); // 1 s of 16 kHz mono s16 = 32000 bytes
    expect(h.length).toBe(44);
    expect(h.toString("latin1", 0, 4)).toBe("RIFF");
    expect(h.toString("latin1", 8, 12)).toBe("WAVE");
    expect(h.toString("latin1", 36, 40)).toBe("data");
    expect(h.readUInt32LE(4)).toBe(36 + 32000); // RIFF size = 36 + data
    expect(h.readUInt16LE(20)).toBe(1); // PCM
    expect(h.readUInt16LE(22)).toBe(1); // mono
    expect(h.readUInt32LE(24)).toBe(16000); // rate
    expect(h.readUInt32LE(28)).toBe(16000 * 2); // byte rate = rate * blockAlign
    expect(h.readUInt16LE(32)).toBe(2); // block align = channels * bits/8
    expect(h.readUInt16LE(34)).toBe(16); // bits
    expect(h.readUInt32LE(40)).toBe(32000); // data length
  });
});
