import { AdapterError, LimitError, type LlmAdapter, type LlmRequest, type StreamSession } from "../../../shared/llm";

// `claude-subscription` adapter: a warm `claude -p` stream-json child process that
// bills the user's Claude subscription, never the API. The spawn env drops
// ANTHROPIC_API_KEY so the CLI cannot silently fall back to paid API billing
// (spec 6.3 "no silent API billing"). Turns are serial (one hint at a time), so
// a single process is reused warm and restarted if it crashes.
//
// shortcut: the stream-json wire shapes below (request + event JSON) are our
// provisional contract. The exact `claude -p` payloads and the limit/reset-time
// format are pending spike 1.4; swap `encodeRequest`/`decodeEvent` once captured.

/** Minimal child-process surface, injectable so tests use a fake CLI. */
export interface ChildProc {
  writeLine(line: string): void;
  /** One decoded output line (without the trailing newline) at a time. */
  lines: AsyncIterableIterator<string>;
  kill(): void;
}

export type SpawnFn = () => ChildProc;

export interface SubscriptionConfig {
  profileId: string;
  spawn: SpawnFn;
  /** Max automatic respawns after an unexpected exit before giving up. */
  restartLimit?: number;
}

type Event =
  | { type: "text"; text: string }
  | { type: "limit"; resetAt?: number }
  | { type: "error"; message: string }
  | { type: "login_required" }
  | { type: "done" }
  | { type: "other" };

function encodeRequest(req: LlmRequest): string {
  const context = [req.prefix, req.system].filter(Boolean).join("\n\n");
  return JSON.stringify({ type: "user", system: context, turns: req.turns, question: req.question });
}

function decodeEvent(line: string): Event {
  try {
    const ev = JSON.parse(line) as Partial<Event> & { text?: string; message?: string; resetAt?: number };
    switch (ev.type) {
      case "text":
        return { type: "text", text: ev.text ?? "" };
      case "limit":
        return { type: "limit", resetAt: ev.resetAt };
      case "error":
        return { type: "error", message: ev.message ?? "subscription error" };
      case "login_required":
        return { type: "login_required" };
      case "done":
        return { type: "done" };
      default:
        return { type: "other" };
    }
  } catch {
    return { type: "other" };
  }
}

/** Single-producer / single-consumer queue feeding one turn's token stream. */
class TurnSink {
  private q: Array<{ v: string } | { err: Error } | { done: true }> = [];
  private waiter: (() => void) | null = null;

  push(v: string): void {
    this.q.push({ v });
    this.wake();
  }
  fail(err: Error): void {
    this.q.push({ err });
    this.wake();
  }
  end(): void {
    this.q.push({ done: true });
    this.wake();
  }
  private wake(): void {
    const w = this.waiter;
    this.waiter = null;
    w?.();
  }
  async *stream(): AsyncGenerator<string> {
    for (;;) {
      while (this.q.length) {
        const it = this.q.shift()!;
        if ("done" in it) return;
        if ("err" in it) throw it.err;
        yield it.v;
      }
      await new Promise<void>((res) => (this.waiter = res));
    }
  }
}

class ClaudeSubscription implements LlmAdapter {
  readonly kind = "claude-subscription" as const;
  readonly profileId: string;
  private readonly spawn: SpawnFn;
  private readonly restartLimit: number;
  private child: ChildProc | null = null;
  private active: TurnSink | null = null;
  private restarts = 0;
  private loggedOut = false;

  constructor(cfg: SubscriptionConfig) {
    this.profileId = cfg.profileId;
    this.spawn = cfg.spawn;
    this.restartLimit = cfg.restartLimit ?? 3;
  }

  start(req: LlmRequest): StreamSession {
    if (this.loggedOut) return failSession(new AdapterError("claude CLI not logged in"));
    const sink = new TurnSink();
    try {
      this.ensureChild();
    } catch (e) {
      return failSession(new AdapterError(`cannot start subscription process: ${(e as Error).message}`));
    }
    this.active = sink;
    this.child!.writeLine(encodeRequest(req));
    return {
      tokens: sink.stream(),
      abort: () => {
        if (this.active === sink) this.active = null;
      },
    };
  }

  /** Stop the warm process (e.g. on app quit). */
  dispose(): void {
    this.child?.kill();
    this.child = null;
  }

  private ensureChild(): void {
    if (this.child) return;
    this.child = this.spawn();
    void this.pump(this.child);
  }

  private async pump(child: ChildProc): Promise<void> {
    try {
      for await (const line of child.lines) {
        const ev = decodeEvent(line);
        if (ev.type === "login_required") {
          this.loggedOut = true;
          this.active?.fail(new AdapterError("claude CLI not logged in"));
          this.active = null;
          continue;
        }
        if (!this.active) continue;
        switch (ev.type) {
          case "text":
            this.active.push(ev.text);
            break;
          case "limit": {
            const s = this.active;
            this.active = null;
            s.fail(new LimitError("subscription limit reached", ev.resetAt));
            break;
          }
          case "error": {
            const s = this.active;
            this.active = null;
            s.fail(new AdapterError(ev.message));
            break;
          }
          case "done": {
            const s = this.active;
            this.active = null;
            s.end();
            break;
          }
          default:
            break;
        }
      }
    } catch (e) {
      this.active?.fail(new AdapterError(`subscription stream error: ${(e as Error).message}`));
      this.active = null;
    }
    // Stream ended: the process exited.
    if (this.child === child) this.child = null;
    if (this.active) {
      const s = this.active;
      this.active = null;
      s.fail(new AdapterError("subscription process exited mid-turn"));
      if (this.restarts < this.restartLimit) {
        this.restarts += 1;
        this.ensureChild(); // warm again for the next turn
      }
    }
  }
}

export function claudeSubscriptionAdapter(cfg: SubscriptionConfig): LlmAdapter & { dispose(): void } {
  return new ClaudeSubscription(cfg);
}

/** Spawn env with ANTHROPIC_API_KEY removed, so the CLI cannot bill the API. */
export function subscriptionEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

/** Real spawn: a warm `claude -p` stream-json process, API key dropped from env. */
export function realClaudeSpawn(command = "claude", extraArgs: string[] = []): SpawnFn {
  return () => {
    // Lazy require keeps node:child_process out of the renderer/test import graph.
    const { spawn } = require("node:child_process") as typeof import("node:child_process");
    const { createInterface } = require("node:readline") as typeof import("node:readline");
    const child = spawn(
      command,
      ["-p", "--input-format", "stream-json", "--output-format", "stream-json", ...extraArgs],
      { env: subscriptionEnv(), stdio: ["pipe", "pipe", "inherit"] },
    );
    const rl = createInterface({ input: child.stdout });
    return {
      writeLine: (line) => void child.stdin.write(line + "\n"),
      lines: rl[Symbol.asyncIterator]() as AsyncIterableIterator<string>,
      kill: () => void child.kill(),
    };
  };
}

function failSession(err: Error): StreamSession {
  return {
    tokens: (async function* () {
      throw err;
    })(),
    abort: () => {},
  };
}
