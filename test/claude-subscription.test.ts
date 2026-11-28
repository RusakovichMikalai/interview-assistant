import { describe, expect, it } from "vitest";
import {
  claudeSubscriptionAdapter,
  subscriptionArgs,
  subscriptionEnv,
  SUBSCRIPTION_MODEL,
  type ChildProc,
} from "../src/main/llm/adapters/claude-subscription";
import { AdapterError, LimitError, type LlmRequest } from "../src/shared/llm";

const REQ: LlmRequest = { system: "s", turns: [], question: "q?" };

// Real `claude -p` stream-json event shapes (captured in spike 1.4).
const assistantText = (text: string) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
const resultDone = () => ({ type: "result", subtype: "success", is_error: false, result: "ok" });

// A fake `claude` CLI child whose output lines the test feeds by hand.
function fakeChild() {
  const q: string[] = [];
  let waiter: ((r: IteratorResult<string>) => void) | null = null;
  let closed = false;
  const writes: string[] = [];
  const lines: AsyncIterableIterator<string> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (q.length) return Promise.resolve({ done: false, value: q.shift()! });
      if (closed) return Promise.resolve({ done: true, value: undefined } as IteratorResult<string>);
      return new Promise<IteratorResult<string>>((res) => (waiter = res));
    },
    return() {
      closed = true;
      return Promise.resolve({ done: true, value: undefined } as IteratorResult<string>);
    },
  };
  const child: ChildProc = {
    writeLine: (l) => void writes.push(l),
    lines,
    kill: () => void (closed = true),
  };
  return {
    child,
    writes,
    emit(obj: unknown) {
      const v = JSON.stringify(obj);
      if (waiter) {
        const w = waiter;
        waiter = null;
        w({ done: false, value: v });
      } else q.push(v);
    },
    exit() {
      closed = true;
      if (waiter) {
        const w = waiter;
        waiter = null;
        w({ done: true, value: undefined } as IteratorResult<string>);
      }
    },
  };
}

function spawner() {
  const children: ReturnType<typeof fakeChild>[] = [];
  const spawn = () => {
    const c = fakeChild();
    children.push(c);
    return c.child;
  };
  return { spawn, children, get count() { return children.length; } };
}

async function collect(tokens: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const t of tokens) out.push(t);
  return out;
}
const flush = () => new Promise<void>((r) => setImmediate(r));

describe("subscriptionArgs (6.3)", () => {
  it("forces the default non-thinking model by default", () => {
    const args = subscriptionArgs();
    expect(SUBSCRIPTION_MODEL).toBe("claude-sonnet-5-5");
    expect(args).toContain("--verbose"); // required for -p stream-json output
    const i = args.indexOf("--model");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe(SUBSCRIPTION_MODEL);
  });
  it("overrides the model and appends extra args", () => {
    expect(subscriptionArgs("claude-haiku-5-5", ["--foo"])).toEqual(
      expect.arrayContaining(["--model", "claude-haiku-5-5", "--foo"]),
    );
  });
  it("omits --model when the model is empty (CLI default)", () => {
    expect(subscriptionArgs("")).not.toContain("--model");
  });
});

describe("subscriptionEnv (6.3)", () => {
  it("drops ANTHROPIC_API_KEY and keeps the rest", () => {
    const env = subscriptionEnv({ ANTHROPIC_API_KEY: "secret", PATH: "/usr/bin", HOME: "/home/x" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/x");
  });
});

describe("claude-subscription adapter (6.3)", () => {
  it("streams text events of a warm turn and forwards the request", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });
    const s = a.start(REQ);
    await flush();
    sp.children[0].emit(assistantText("Hel"));
    sp.children[0].emit(assistantText("lo"));
    sp.children[0].emit(resultDone());
    expect(await collect(s.tokens)).toEqual(["Hel", "lo"]);
    expect(sp.count).toBe(1); // warm: one process
    const sent = JSON.parse(sp.children[0].writes[0]);
    expect(sent.message.content[0].text).toContain("q?");
  });

  it("reuses the same warm process for a second turn", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });

    const s1 = a.start(REQ);
    await flush();
    sp.children[0].emit(assistantText("a"));
    sp.children[0].emit(resultDone());
    expect(await collect(s1.tokens)).toEqual(["a"]);

    const s2 = a.start(REQ);
    await flush();
    sp.children[0].emit(assistantText("b"));
    sp.children[0].emit(resultDone());
    expect(await collect(s2.tokens)).toEqual(["b"]);
    expect(sp.count).toBe(1);
  });

  it("ignores thinking-only and allowed rate-limit events, streams only text", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });
    const s = a.start(REQ);
    await flush();
    sp.children[0].emit({ type: "assistant", message: { content: [{ type: "thinking", thinking: "..." }] } });
    sp.children[0].emit({ type: "rate_limit_event", rate_limit_info: { status: "allowed", resetsAt: 1795796400 } });
    sp.children[0].emit(assistantText("hi"));
    sp.children[0].emit(resultDone());
    expect(await collect(s.tokens)).toEqual(["hi"]);
  });

  it("treats an allowed_warning rate-limit event as served, not a hard limit", async () => {
    // Regression: the real CLI emits status "allowed_warning" when a window
    // fills up but the turn still completes. It must not fail the turn.
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });
    const s = a.start(REQ);
    await flush();
    sp.children[0].emit({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", resetsAt: 1796032800 } });
    sp.children[0].emit(assistantText("hi"));
    sp.children[0].emit(resultDone());
    expect(await collect(s.tokens)).toEqual(["hi"]);
  });

  it("maps a rate_limit_event (status != allowed) to LimitError with ms resetAt", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });
    const s = a.start(REQ);
    await flush();
    sp.children[0].emit({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 42 } });
    await expect(collect(s.tokens)).rejects.toSatisfy(
      (e: unknown) => e instanceof LimitError && e.resetAt === 42000,
    );
  });

  it("surfaces allowed_warning as a non-fatal warned flag without ending the turn (6.12)", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });
    const s = a.start(REQ);
    await flush();
    expect(s.warned).toBe(false);
    sp.children[0].emit({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", resetsAt: 99 } });
    sp.children[0].emit(assistantText("still here"));
    sp.children[0].emit(resultDone());
    expect(await collect(s.tokens)).toEqual(["still here"]); // turn served, not aborted
    expect(s.warned).toBe(true);
  });

  it("detects a logged-out CLI and refuses the next turn without respawning", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });
    const s = a.start(REQ);
    await flush();
    sp.children[0].emit({ type: "result", is_error: true, result: "Please run /login to authenticate" });
    await expect(collect(s.tokens)).rejects.toBeInstanceOf(AdapterError);

    // Second turn short-circuits; no new process is spawned.
    const s2 = a.start(REQ);
    await expect(collect(s2.tokens)).rejects.toThrow(/not logged in/);
    expect(sp.count).toBe(1);
  });

  it("restarts the process after an unexpected exit", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });
    const s1 = a.start(REQ);
    await flush();
    sp.children[0].exit(); // crash mid-turn
    await expect(collect(s1.tokens)).rejects.toThrow(/exited/);
    await flush();
    expect(sp.count).toBe(2); // respawned warm

    const s2 = a.start(REQ);
    await flush();
    sp.children[1].emit(assistantText("back"));
    sp.children[1].emit(resultDone());
    expect(await collect(s2.tokens)).toEqual(["back"]);
  });
});
