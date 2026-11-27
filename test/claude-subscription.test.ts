import { describe, expect, it } from "vitest";
import {
  claudeSubscriptionAdapter,
  subscriptionEnv,
  type ChildProc,
} from "../src/main/llm/adapters/claude-subscription";
import { AdapterError, LimitError, type LlmRequest } from "../src/shared/llm";

const REQ: LlmRequest = { system: "s", turns: [], question: "q?" };

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
    sp.children[0].emit({ type: "text", text: "Hel" });
    sp.children[0].emit({ type: "text", text: "lo" });
    sp.children[0].emit({ type: "done" });
    expect(await collect(s.tokens)).toEqual(["Hel", "lo"]);
    expect(sp.count).toBe(1); // warm: one process
    expect(JSON.parse(sp.children[0].writes[0]).question).toBe("q?");
  });

  it("reuses the same warm process for a second turn", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });

    const s1 = a.start(REQ);
    await flush();
    sp.children[0].emit({ type: "text", text: "a" });
    sp.children[0].emit({ type: "done" });
    expect(await collect(s1.tokens)).toEqual(["a"]);

    const s2 = a.start(REQ);
    await flush();
    sp.children[0].emit({ type: "text", text: "b" });
    sp.children[0].emit({ type: "done" });
    expect(await collect(s2.tokens)).toEqual(["b"]);
    expect(sp.count).toBe(1);
  });

  it("maps a limit event to LimitError with resetAt", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });
    const s = a.start(REQ);
    await flush();
    sp.children[0].emit({ type: "limit", resetAt: 42 });
    await expect(collect(s.tokens)).rejects.toSatisfy(
      (e: unknown) => e instanceof LimitError && e.resetAt === 42,
    );
  });

  it("detects a logged-out CLI and refuses the next turn without respawning", async () => {
    const sp = spawner();
    const a = claudeSubscriptionAdapter({ profileId: "sub", spawn: sp.spawn });
    const s = a.start(REQ);
    await flush();
    sp.children[0].emit({ type: "login_required" });
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
    sp.children[1].emit({ type: "text", text: "back" });
    sp.children[1].emit({ type: "done" });
    expect(await collect(s2.tokens)).toEqual(["back"]);
  });
});
