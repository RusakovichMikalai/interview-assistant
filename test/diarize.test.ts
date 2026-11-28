import { describe, expect, it } from "vitest";
import { Diarizer, SpeakerMap } from "../src/main/stt/diarize";

// Two well-separated voices on orthogonal embedding axes, with small jitter so
// segments of one speaker are close but not identical.
const voiceA = (j = 0): number[] => [1, 0.05 + j, 0.02];
const voiceB = (j = 0): number[] => [0.02, 0.05 + j, 1];

describe("Diarizer (10.1)", () => {
  it("groups segments of the same voice and separates the two voices", () => {
    const d = new Diarizer();
    const a1 = d.assign(voiceA(0));
    const b1 = d.assign(voiceB(0));
    const a2 = d.assign(voiceA(0.1));
    const b2 = d.assign(voiceB(0.1));
    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
    expect(a1).not.toBe(b1);
    expect(d.speakerCount).toBe(2);
  });

  it("caps speakers: a third distinct voice joins its nearest existing speaker", () => {
    const d = new Diarizer(0.5, 2);
    d.assign(voiceA());
    d.assign(voiceB());
    // Closer to A than to B -> folds into A, no third speaker opened.
    const third = d.assign([0.9, 0.2, 0.1]);
    expect(d.speakerCount).toBe(2);
    expect(third).toBe(0);
  });

  it("maps the clicked speaker to candidate and the other to interviewer", () => {
    const d = new Diarizer();
    const map = new SpeakerMap();
    const s1 = d.assign(voiceA());
    const s2 = d.assign(voiceB());
    // Scenario: user marks speaker 1 as "Me".
    map.setMe(s1);
    expect(map.roleOf(s1)).toBe("candidate");
    expect(map.roleOf(s2)).toBe("interviewer");
  });

  it("roleOf is null until a speaker is marked", () => {
    const map = new SpeakerMap();
    expect(map.roleOf(0)).toBeNull();
  });

  it("rejects an empty embedding and a dimension change", () => {
    const d = new Diarizer();
    expect(() => d.assign([])).toThrow();
    d.assign([1, 0, 0]);
    expect(() => d.assign([1, 0])).toThrow(/dim/);
  });
});
