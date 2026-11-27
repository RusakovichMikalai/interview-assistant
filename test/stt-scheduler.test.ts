import { describe, expect, it } from "vitest";
import { SttScheduler, type SttJob } from "../src/main/stt/scheduler";

function drain(s: SttScheduler): SttJob[] {
  const out: SttJob[] = [];
  for (let j = s.next(); j; j = s.next()) out.push(j);
  return out;
}

describe("interviewer-channel priority (5.3)", () => {
  it("serves the interviewer chunk before a candidate chunk queued earlier", () => {
    const s = new SttScheduler();
    s.enqueue({ channel: "candidate", id: "c1" });
    s.enqueue({ channel: "interviewer", id: "i1" });
    expect(s.next()?.id).toBe("i1");
    expect(s.next()?.id).toBe("c1");
  });

  it("keeps FIFO order within each channel", () => {
    const s = new SttScheduler();
    s.enqueue({ channel: "interviewer", id: "i1" });
    s.enqueue({ channel: "interviewer", id: "i2" });
    expect(drain(s).map((j) => j.id)).toEqual(["i1", "i2"]);
  });

  it("under load, no candidate chunk is served while interviewer work is pending", () => {
    const s = new SttScheduler();
    // Interleave 100 chunks per channel, as if both people speak on a saturated CPU.
    for (let k = 0; k < 100; k++) {
      s.enqueue({ channel: "candidate", id: `c${k}` });
      s.enqueue({ channel: "interviewer", id: `i${k}` });
    }
    const order = drain(s);
    const firstCandidate = order.findIndex((j) => j.channel === "candidate");
    const lastInterviewer = order.map((j) => j.channel).lastIndexOf("interviewer");
    expect(firstCandidate).toBe(100); // all 100 interviewer finals come out first
    expect(lastInterviewer).toBe(99); // no interviewer chunk ever waits behind a candidate one
  });

  it("falls back to the candidate lane when the interviewer lane is empty", () => {
    const s = new SttScheduler();
    s.enqueue({ channel: "candidate", id: "c1" });
    expect(s.next()?.id).toBe("c1");
    expect(s.next()).toBeUndefined();
    expect(s.pending).toBe(0);
  });
});
