import { describe, it, expect } from "vitest";
import { Router } from "../src/main/llm/router";
import { ManualTimers } from "../src/main/llm/timers";
import {
  AdapterError,
  LimitError,
  type LlmAdapter,
  type LlmRequest,
  type StreamSession,
} from "../src/shared/llm";
import type { AdapterKind } from "../src/shared/settings";

const REQ: LlmRequest = { system: "s", turns: [], question: "q?" };
const flush = () => new Promise<void>((r) => setImmediate(r));

// A stream whose tokens/errors are pushed by the test.
function controllable() {
  let resolveNext: ((v: IteratorResult<string>) => void) | null = null;
  let rejectNext: ((e: unknown) => void) | null = null;
  const buf: IteratorResult<string>[] = [];
  const errs: unknown[] = [];
  let aborted = false;
  let warned = false;
  const tokens: AsyncIterableIterator<string> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (errs.length) return Promise.reject(errs.shift());
      if (buf.length) return Promise.resolve(buf.shift()!);
      return new Promise<IteratorResult<string>>((res, rej) => {
        resolveNext = res;
        rejectNext = rej;
      });
    },
    return() {
      return Promise.resolve({ done: true, value: undefined });
    },
  };
  return {
    session: {
      tokens,
      abort: () => void (aborted = true),
      get warned() {
        return warned;
      },
    } as StreamSession,
    emit(chunk: string) {
      const r: IteratorResult<string> = { done: false, value: chunk };
      if (resolveNext) {
        const f = resolveNext;
        resolveNext = rejectNext = null;
        f(r);
      } else buf.push(r);
    },
    end() {
      const r: IteratorResult<string> = { done: true, value: undefined };
      if (resolveNext) {
        const f = resolveNext;
        resolveNext = rejectNext = null;
        f(r);
      } else buf.push(r);
    },
    setWarned() {
      warned = true;
    },
    fail(err: Error) {
      if (rejectNext) {
        const f = rejectNext;
        resolveNext = rejectNext = null;
        f(err);
      } else errs.push(err);
    },
    get aborted() {
      return aborted;
    },
  };
}

function fakeAdapter(profileId: string, kind: AdapterKind = "openai-compatible") {
  let last: ReturnType<typeof controllable> | null = null;
  let starts = 0;
  const adapter: LlmAdapter = {
    profileId,
    kind,
    start() {
      starts += 1;
      last = controllable();
      return last.session;
    },
  };
  return {
    adapter,
    get last() {
      return last!;
    },
    get starts() {
      return starts;
    },
  };
}

async function firstChunk(stream: AsyncIterable<string>): Promise<string> {
  for await (const c of stream) return c;
  throw new Error("empty stream");
}

describe("Router mandatory backup (6.6)", () => {
  it("refuses a subscription primary with no backup", async () => {
    const sub = fakeAdapter("sub", "claude-subscription").adapter;
    const r = new Router({ fast: [sub], deep: [sub], timers: new ManualTimers() });
    expect(() => r.assertStartable()).toThrow(/backup/);
    await expect(r.run(REQ)).rejects.toThrow(/backup/);
  });

  it("allows a subscription primary with a backup", () => {
    const sub = fakeAdapter("sub", "claude-subscription").adapter;
    const api = fakeAdapter("api").adapter;
    const r = new Router({ fast: [sub, api], deep: [sub, api], timers: new ManualTimers() });
    expect(() => r.assertStartable()).not.toThrow();
  });
});

describe("Router primary path (6.5 primary wins)", () => {
  it("returns the primary answer when it is fast", async () => {
    const p = fakeAdapter("p");
    const b = fakeAdapter("b");
    const r = new Router({ fast: [p.adapter, b.adapter], deep: [p.adapter], timers: new ManualTimers() });
    const run = r.run(REQ);
    await flush();
    p.last.emit("hello");
    const res = await run;
    expect(res.source).toBe("p");
    expect(b.starts).toBe(0); // no hedge
    expect(await firstChunk(res.stream)).toBe("hello");
  });
});

describe("Router failover on error (6.4)", () => {
  it("routes to the backup immediately on a connection error", async () => {
    const p = fakeAdapter("p");
    const b = fakeAdapter("b");
    const timers = new ManualTimers();
    const r = new Router({ fast: [p.adapter, b.adapter], deep: [p.adapter], timers });
    const run = r.run(REQ);
    await flush();
    p.last.fail(new AdapterError("conn")); // no timer advance -> immediate
    await flush();
    b.last.emit("from-backup");
    const res = await run;
    expect(res.source).toBe("b");
    expect(r.health("p")).toBe("DOWN");
  });
});

describe("Router failover on limit (6.4)", () => {
  it("marks LIMITED until reset and routes to backup", async () => {
    const p = fakeAdapter("p");
    const b = fakeAdapter("b");
    const timers = new ManualTimers();
    const r = new Router({ fast: [p.adapter, b.adapter], deep: [p.adapter], timers });

    const run1 = r.run(REQ);
    await flush();
    p.last.fail(new LimitError("limit", 1000)); // resetAt = 1000
    await flush();
    b.last.emit("b1");
    expect((await run1).source).toBe("b");
    expect(r.health("p")).toBe("LIMITED");

    // Second request while LIMITED: backup is primary even though p could answer.
    const run2 = r.run(REQ);
    await flush();
    b.last.emit("b2");
    expect((await run2).source).toBe("b");

    timers.advance(1000);
    expect(r.health("p")).toBe("OK");
  });
});

describe("Router hedging (6.5)", () => {
  it("backup wins the race and the primary is cancelled", async () => {
    const p = fakeAdapter("p");
    const b = fakeAdapter("b");
    const timers = new ManualTimers();
    const r = new Router({ fast: [p.adapter, b.adapter], deep: [p.adapter], timers });
    const run = r.run(REQ);
    await flush();
    timers.advance(800); // threshold elapsed -> hedge
    await flush();
    expect(b.starts).toBe(1);
    b.last.emit("fast-backup");
    const res = await run;
    expect(res.source).toBe("b");
    expect(p.last.aborted).toBe(true);
    expect(await firstChunk(res.stream)).toBe("fast-backup");
  });

  it("primary wins after hedge starts; backup cancelled, no mixing", async () => {
    const p = fakeAdapter("p");
    const b = fakeAdapter("b");
    const timers = new ManualTimers();
    const r = new Router({ fast: [p.adapter, b.adapter], deep: [p.adapter], timers });
    const run = r.run(REQ);
    await flush();
    timers.advance(800);
    await flush();
    p.last.emit("p1"); // primary first
    const res = await run;
    expect(res.source).toBe("p");
    expect(b.last.aborted).toBe(true);
    p.last.emit("p2");
    (p.last as unknown as { session: StreamSession }); // keep ref
    const chunks: string[] = [];
    const it = res.stream[Symbol.asyncIterator]();
    chunks.push((await it.next()).value as string); // p1
    chunks.push((await it.next()).value as string); // p2
    expect(chunks).toEqual(["p1", "p2"]);
  });
});

describe("Router slow demotion (6.4/6.5)", () => {
  it("marks SLOW after 3 lost races and prefers backup for 5 min", async () => {
    const p = fakeAdapter("p");
    const b = fakeAdapter("b");
    const timers = new ManualTimers();
    const r = new Router({ fast: [p.adapter, b.adapter], deep: [p.adapter], timers });

    for (let i = 0; i < 3; i++) {
      const run = r.run(REQ);
      await flush();
      timers.advance(800);
      await flush();
      b.last.emit(`b${i}`);
      await run; // backup wins -> primary loses the race
    }
    expect(r.health("p")).toBe("SLOW");

    // Next request: backup is primary (p demoted below OK backup).
    const run = r.run(REQ);
    await flush();
    b.last.emit("b-primary");
    expect((await run).source).toBe("b");
    expect(p.starts).toBe(3); // p not started as primary on the 4th request

    timers.advance(5 * 60_000);
    expect(r.health("p")).toBe("OK");
  });
});

describe("Router chain switch (6.8)", () => {
  it("uses the deep chain after switching", async () => {
    const pf = fakeAdapter("fast-p");
    const pd = fakeAdapter("deep-p");
    const r = new Router({ fast: [pf.adapter], deep: [pd.adapter], timers: new ManualTimers() });

    const r1 = r.run(REQ);
    await flush();
    pf.last.emit("x");
    expect((await r1).source).toBe("fast-p");

    r.setChain("deep");
    const r2 = r.run(REQ);
    await flush();
    pd.last.emit("y");
    expect((await r2).source).toBe("deep-p");
  });
});

describe("Router adaptive threshold (6.5)", () => {
  it("replaces the 800 ms default with the primary p90 once there are enough samples", async () => {
    const p = fakeAdapter("p");
    const b = fakeAdapter("b");
    const timers = new ManualTimers();
    const r = new Router({ fast: [p.adapter, b.adapter], deep: [p.adapter], timers, ttftWindow: 2 });

    // Two fast primary wins at t=0 -> recorded TTFT = 0 -> p90 = 0.
    for (let i = 0; i < 2; i++) {
      const run = r.run(REQ);
      await flush();
      p.last.emit(`p${i}`);
      await firstChunk((await run).stream);
    }

    // Now threshold is 0: a 1 ms wait already triggers the hedge, which the
    // default 800 ms would not have.
    const run = r.run(REQ);
    await flush();
    timers.advance(1);
    await flush();
    expect(b.starts).toBe(1);
    b.last.emit("hedged");
    expect((await run).source).toBe("b");
  });
});

async function collectAll(s: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of s) out.push(c);
  return out;
}

describe("Router sticky fallback (6.10, 6.11)", () => {
  const stickyRouter = (head: LlmAdapter, fb: LlmAdapter, timers: ManualTimers) =>
    new Router({ fast: [head, fb], deep: [head, fb], timers, stickyFallback: true });

  it("warning benches the primary for the next turn; this turn still shows it", async () => {
    const head = fakeAdapter("sub", "claude-subscription");
    const fb = fakeAdapter("fb");
    const timers = new ManualTimers();
    const r = stickyRouter(head.adapter, fb.adapter, timers);

    const run1 = r.run(REQ);
    await flush();
    timers.advance(4000); // TTFT 4 s: under the 5 s slow and 10 s abort thresholds
    head.last.setWarned();
    head.last.emit("ans");
    const res1 = await run1;
    expect(res1.source).toBe("sub");
    head.last.end();
    expect(await collectAll(res1.stream)).toEqual(["ans"]); // served despite the warning

    const run2 = r.run(REQ);
    await flush();
    expect(head.starts).toBe(1); // benched -> not retried
    fb.last.emit("fb-ans");
    expect((await run2).source).toBe("fb");
  });

  it("benches the primary for the next turn when its first token is slower than 5 s", async () => {
    const head = fakeAdapter("sub", "claude-subscription");
    const fb = fakeAdapter("fb");
    const timers = new ManualTimers();
    const r = stickyRouter(head.adapter, fb.adapter, timers);

    const run1 = r.run(REQ);
    await flush();
    timers.advance(6000); // TTFT 6 s > 5 s slow threshold, still under 10 s abort
    head.last.emit("slow");
    const res1 = await run1;
    expect(res1.source).toBe("sub");
    head.last.end();
    await collectAll(res1.stream);

    const run2 = r.run(REQ);
    await flush();
    fb.last.emit("fb-ans");
    expect((await run2).source).toBe("fb");
  });

  it("fails over on the same turn and benches when no token arrives by the abort threshold", async () => {
    const head = fakeAdapter("sub", "claude-subscription");
    const fb = fakeAdapter("fb");
    const timers = new ManualTimers();
    const r = stickyRouter(head.adapter, fb.adapter, timers);

    const run1 = r.run(REQ);
    await flush();
    timers.advance(10000); // abort threshold with no primary token
    await flush();
    fb.last.emit("fb-ans");
    const res1 = await run1;
    expect(res1.source).toBe("fb");
    expect(head.last.aborted).toBe(true);
    expect(await firstChunk(res1.stream)).toBe("fb-ans");

    const run2 = r.run(REQ); // benched: stays on the fallback next turn too
    await flush();
    expect(head.starts).toBe(1);
    fb.last.emit("again");
    expect((await run2).source).toBe("fb");
  });

  it("fails over on the same turn and benches on an error before the abort threshold", async () => {
    const head = fakeAdapter("sub", "claude-subscription");
    const fb = fakeAdapter("fb");
    const timers = new ManualTimers();
    const r = stickyRouter(head.adapter, fb.adapter, timers);

    const run1 = r.run(REQ);
    await flush();
    head.last.fail(new AdapterError("boom")); // no timer advance -> before the threshold
    await flush();
    fb.last.emit("fb-ans");
    expect((await run1).source).toBe("fb");

    const run2 = r.run(REQ);
    await flush();
    expect(head.starts).toBe(1); // benched until restart
    fb.last.emit("again");
    expect((await run2).source).toBe("fb");
  });

  it("does not bench a fast, un-warned primary (hedging stays disabled on the chain)", async () => {
    const head = fakeAdapter("sub", "claude-subscription");
    const fb = fakeAdapter("fb");
    const timers = new ManualTimers();
    const r = stickyRouter(head.adapter, fb.adapter, timers);

    const run1 = r.run(REQ);
    await flush();
    timers.advance(1000); // fast TTFT, no warning
    head.last.emit("ok");
    const res1 = await run1;
    head.last.end();
    await collectAll(res1.stream);
    expect(fb.starts).toBe(0); // no hedge: backup never started

    const run2 = r.run(REQ);
    await flush();
    head.last.emit("ok2");
    expect((await run2).source).toBe("sub"); // primary kept
  });
});
