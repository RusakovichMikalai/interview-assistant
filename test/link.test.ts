import { describe, expect, it, vi } from "vitest";
import { LinkMonitor, type Gap, type LinkState } from "../src/main/pairing/link";
import { ManualTimers } from "../src/main/llm/timers";

// Let queued microtasks (awaited attempt() / sleep().promise) run to completion.
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("link monitor (9.4)", () => {
  it("starts connected and reports the measured delay", () => {
    const m = new LinkMonitor(new ManualTimers(), { attempt: async () => true });
    expect(m.currentState).toBe("connected");
    m.reportDelay(120);
    expect(m.measuredDelayMs).toBe(120);
  });

  it("reconnects after a 10 s drop and marks the gap, no user action", async () => {
    const timers = new ManualTimers();
    const results = [false, true]; // first attempt fails, second succeeds
    let i = 0;
    const states: LinkState[] = [];
    const gaps: Gap[] = [];
    const m = new LinkMonitor(timers, {
      attempt: async () => results[i++] ?? true,
      onState: (s) => states.push(s),
      onGap: (g) => gaps.push(g),
      baseDelayMs: 1000,
    });

    m.drop(); // droppedAt = 0
    await flush(); // first attempt fails -> "down", waiting on backoff
    expect(m.currentState).toBe("down");

    timers.advance(10_000); // network returns after 10 s; backoff sleep fires
    await flush(); // second attempt succeeds

    expect(m.currentState).toBe("connected");
    expect(gaps).toEqual([{ from: 0, to: 10_000 }]);
    expect(states).toEqual(["reconnecting", "down", "reconnecting", "connected"]);
  });

  it("ignores a second drop while already reconnecting", async () => {
    const timers = new ManualTimers();
    const attempt = vi.fn(async () => false);
    const m = new LinkMonitor(timers, { attempt, baseDelayMs: 1000 });

    m.drop();
    await flush();
    m.drop(); // state is "down", not "connected" -> no new loop
    await flush();

    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("does nothing on drop while connected stays if attempt immediately succeeds", async () => {
    const timers = new ManualTimers();
    const gaps: Gap[] = [];
    const m = new LinkMonitor(timers, { attempt: async () => true, onGap: (g) => gaps.push(g) });
    m.drop();
    await flush();
    expect(m.currentState).toBe("connected");
    expect(gaps).toEqual([{ from: 0, to: 0 }]);
  });
});
