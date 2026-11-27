import { AdapterError, LimitError, type LlmAdapter, type LlmRequest, type StreamSession } from "../../../shared/llm";

// `claude-subscription` adapter: a warm `claude -p` stream-json child process that
// bills the user's Claude subscription, never the API. The spawn env drops
// ANTHROPIC_API_KEY so the CLI cannot silently fall back to paid API billing
// (spec 6.3 "no silent API billing"). Turns are serial (one hint at a time), so
// a single process is reused warm and restarted if it crashes.
//
// Wire shapes captured in spike 1.4 (openspec .../spikes/1.4.md): input is one
// stream-json `user` message line; output is `assistant` messages (text in
// content items), a terminal `result` event, and proactive `rate_limit_event`s
// carrying `resetsAt` (epoch SECONDS) per window.
//
// shortcut: the per-request system/prefix is folded into the user text. A static
// session prefix could instead be passed once via `--append-system-prompt` for
// prompt caching (seen warming to ~31k cached tokens in the spike); upgrade when
// the hints layer separates the static CV/vacancy prefix from the live turn.

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
  const history = req.turns.map((t) => `${t.role}: ${t.text}`).join("\n");
  const text = [context, history, req.question].filter(Boolean).join("\n\n");
  return JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } });
}

function decodeEvent(line: string): Event {
  let ev: {
    type?: string;
    message?: { content?: Array<{ type?: string; text?: string }> };
    rate_limit_info?: { status?: string; resetsAt?: number };
    is_error?: boolean;
    result?: unknown;
    api_error_status?: unknown;
  };
  try {
    ev = JSON.parse(line);
  } catch {
    return { type: "other" };
  }
  switch (ev.type) {
    case "assistant": {
      const text = (ev.message?.content ?? [])
        .filter((c) => c?.type === "text" && c.text)
        .map((c) => c.text)
        .join("");
      return text ? { type: "text", text } : { type: "other" };
    }
    case "rate_limit_event": {
      const info = ev.rate_limit_info;
      if (info?.status && info.status !== "allowed") {
        // resetsAt is epoch seconds; LimitError.resetAt is epoch ms.
        const resetAt = typeof info.resetsAt === "number" ? info.resetsAt * 1000 : undefined;
        return { type: "limit", resetAt };
      }
      return { type: "other" };
    }
    case "result": {
      if (ev.is_error) {
        const msg = String(ev.result ?? ev.api_error_status ?? "subscription error");
        if (/login|logged in|authenticat|unauthor|credential/i.test(msg)) return { type: "login_required" };
        return { type: "error", message: msg };
      }
      return { type: "done" };
    }
    default:
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

// Force a fast, non-thinking model for the subscription path. `claude -p` defaults
// to opus-5-5 with extended thinking (spike 1.4: TTFT p50 ~3160 ms, ~$0.25/req) -
// far too slow and costly for live hints. Haiku is the fast tier (no extended
// thinking, cheapest) and matches the HTTP claude preset's model, so the fallback
// behaves like the primary. Override via realClaudeSpawn's `model` (e.g. "sonnet"
// for deeper hints, or "" to let the CLI pick its default).
export const SUBSCRIPTION_FAST_MODEL = "claude-haiku-5-5";

/** CLI args for a `-p` stream-json subscription turn, with the model forced. */
export function subscriptionArgs(model: string = SUBSCRIPTION_FAST_MODEL, extraArgs: string[] = []): string[] {
  // --verbose is required by the CLI for `-p` with stream-json output.
  const args = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"];
  if (model) args.push("--model", model);
  return [...args, ...extraArgs];
}

/** Real spawn: a warm `claude -p` stream-json process, API key dropped from env. */
export function realClaudeSpawn(command = "claude", model = SUBSCRIPTION_FAST_MODEL, extraArgs: string[] = []): SpawnFn {
  return () => {
    // Lazy require keeps node:child_process out of the renderer/test import graph.
    const { spawn } = require("node:child_process") as typeof import("node:child_process");
    const { createInterface } = require("node:readline") as typeof import("node:readline");
    const child = spawn(command, subscriptionArgs(model, extraArgs), { env: subscriptionEnv(), stdio: ["pipe", "pipe", "inherit"] });
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
