// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  renderMeters,
  renderWarnings,
  silentWarnings,
  SILENCE_FLOOR,
  type ChannelState,
} from "../src/renderer/precheck-ui";

const live: ChannelState[] = [
  { kind: "system", device: "BlackHole 2ch", level: 0.3 },
  { kind: "mic", device: "MacBook Mic", level: 0.12 },
];
const silent: ChannelState[] = [
  { kind: "system", device: "BlackHole 2ch", level: 0 },
  { kind: "mic", device: "MacBook Mic", level: SILENCE_FLOOR / 2 },
];

describe("pre-interview audio check UI (4.5)", () => {
  it("warns for each channel below the floor, naming its device (mirrors main)", () => {
    expect(silentWarnings(live)).toEqual([]);
    expect(silentWarnings(silent)).toEqual([
      'System audio is not captured on "BlackHole 2ch"',
      'Microphone is not capturing on "MacBook Mic"',
    ]);
  });

  it("paints a meter per channel with the fill width tracking the level", () => {
    const el = document.createElement("div");
    renderMeters(el, live);
    const rows = [...el.querySelectorAll(".meter")];
    expect(rows.map((r) => (r as HTMLElement).dataset.kind)).toEqual(["system", "mic"]);
    expect(rows.map((r) => (r.querySelector(".fill") as HTMLElement).style.width)).toEqual(["30%", "12%"]);
  });

  it("flags a silent channel for styling", () => {
    const el = document.createElement("div");
    renderMeters(el, silent);
    expect([...el.querySelectorAll(".meter")].map((r) => (r as HTMLElement).dataset.silent)).toEqual([
      "true",
      "true",
    ]);
  });

  it("paints one warning line per silent channel and clears when none", () => {
    const el = document.createElement("ul");
    renderWarnings(el, silentWarnings(silent));
    expect([...el.querySelectorAll("li.warning")].map((li) => li.textContent)).toEqual([
      'System audio is not captured on "BlackHole 2ch"',
      'Microphone is not capturing on "MacBook Mic"',
    ]);
    renderWarnings(el, silentWarnings(live));
    expect(el.querySelectorAll("li.warning").length).toBe(0);
  });
});
