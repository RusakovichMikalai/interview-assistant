import {
  AdapterError,
  LimitError,
  type Health,
  type LlmAdapter,
  type LlmRequest,
  type StreamSession,
} from "../../shared/llm";
import type { Timers } from "./timers";

// LLM router: health tracking, failover, hedged requests, slow demotion and
// fast/deep chains. See design D6 and the llm-routing spec. Pure logic; all I/O
// is behind the injected adapters and timers.

export type ChainName = "fast" | "deep";

export interface RouterOptions {
  fast: LlmAdapter[]; // [primary, backup, ...], length >= 1
  deep: LlmAdapter[];
  timers: Timers;
  limitedDefaultMs?: number; // LIMITED window when no reset time is given
  slowMs?: number; // SLOW demotion window
  downCooldownMs?: number; // DOWN deprioritization before background retry
  startThresholdMs?: number; // hedge threshold before any TTFT samples
  maxThresholdMs?: number; // hedge threshold cap
  ttftWindow?: number; // number of recent primary TTFTs kept
  lostRacesForSlow?: number; // consecutive lost hedges that trigger SLOW
}

export interface RunResult {
  /** Profile id that produced the shown hint. */
  source: string;
  /** Health of the chain's configured primary at dispatch time (for the overlay). */
  primaryHealth: Health;
  stream: AsyncIterable<string>;
}

interface HState {
  limitedUntil: number;
  slowUntil: number;
  downUntil: number;
  lostStreak: number;
  ttft: number[];
}

type First =
  | { kind: "token"; chunk: string }
  | { kind: "error"; err: Error };

const RANK: Record<Health, number> = { OK: 0, SLOW: 1, LIMITED: 2, DOWN: 3 };

export class Router {
  private readonly o: Required<RouterOptions>;
  private readonly state = new Map<string, HState>();
  private chain: ChainName = "fast";

  constructor(options: RouterOptions) {
    this.o = {
      limitedDefaultMs: 15 * 60_000,
      slowMs: 5 * 60_000,
      downCooldownMs: 30_000,
      startThresholdMs: 800,
      maxThresholdMs: 1500,
      ttftWindow: 20,
      lostRacesForSlow: 3,
      ...options,
    };
    if (this.o.fast.length < 1 || this.o.deep.length < 1) {
      throw new Error("each chain needs at least a primary profile");
    }
  }

  /** Switch the active chain; takes effect on the next run(). */
  setChain(name: ChainName): void {
    this.chain = name;
  }

  getChain(): ChainName {
    return this.chain;
  }

  health(profileId: string): Health {
    const s = this.st(profileId);
    const now = this.o.timers.now();
    if (s.downUntil > now) return "DOWN";
    if (s.limitedUntil > now) return "LIMITED";
    if (s.slowUntil > now) return "SLOW";
    return "OK";
  }

  /** Refuse to start when a subscription primary has no backup (spec 6.6). */
  assertStartable(name: ChainName = this.chain): void {
    const profiles = name === "fast" ? this.o.fast : this.o.deep;
    if (profiles[0].kind === "claude-subscription" && profiles.length < 2) {
      throw new Error("subscription primary requires a backup profile");
    }
  }

  async run(req: LlmRequest): Promise<RunResult> {
    this.assertStartable();
    const profiles = this.chain === "fast" ? this.o.fast : this.o.deep;
    const primaryHealth = this.health(profiles[0].profileId);
    const order = this.activeOrder(profiles);
    const winner = await this.execute(order, req);
    return { source: winner.source, primaryHealth, stream: winner.stream };
  }

  // --- internals ---

  private st(id: string): HState {
    let s = this.state.get(id);
    if (!s) {
      s = { limitedUntil: 0, slowUntil: 0, downUntil: 0, lostStreak: 0, ttft: [] };
      this.state.set(id, s);
    }
    return s;
  }

  /** Stable health sort: OK before SLOW before LIMITED/DOWN, chain order among equals. */
  private activeOrder(profiles: LlmAdapter[]): LlmAdapter[] {
    return profiles
      .map((a, i) => ({ a, i, rank: RANK[this.health(a.profileId)] }))
      .sort((x, y) => x.rank - y.rank || x.i - y.i)
      .map((e) => e.a);
  }

  private threshold(primaryId: string): number {
    const samples = this.st(primaryId).ttft;
    if (samples.length < this.o.ttftWindow) return this.o.startThresholdMs;
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.ceil(0.9 * sorted.length) - 1;
    return Math.min(sorted[idx], this.o.maxThresholdMs);
  }

  private markError(id: string, err: Error): void {
    const s = this.st(id);
    const now = this.o.timers.now();
    if (err instanceof LimitError) {
      s.limitedUntil = err.resetAt ?? now + this.o.limitedDefaultMs;
    } else {
      s.downUntil = now + this.o.downCooldownMs; // restored by background retry after cooldown
    }
  }

  private recordTtft(id: string, ms: number): void {
    const s = this.st(id);
    s.ttft.push(ms);
    if (s.ttft.length > this.o.ttftWindow) s.ttft.shift();
    s.lostStreak = 0; // primary produced a token -> race streak resets
  }

  private async execute(
    order: LlmAdapter[],
    req: LlmRequest,
  ): Promise<{ source: string; stream: AsyncIterable<string> }> {
    if (order.length === 0) throw new AdapterError("no available profile");
    const primary = order[0];
    const backup = order[1];
    const t0 = this.o.timers.now();

    const primarySession = primary.start(req);
    const primaryFirst = pullFirst(primarySession);
    const timer = this.o.timers.sleep(this.threshold(primary.profileId));

    const raced = await Promise.race([
      primaryFirst.then((f) => ({ t: "primary" as const, f })),
      timer.promise.then(() => ({ t: "timeout" as const })),
    ]);

    if (raced.t === "primary") {
      timer.cancel();
      if (raced.f.kind === "token") {
        this.recordTtft(primary.profileId, this.o.timers.now() - t0);
        return { source: primary.profileId, stream: chain(raced.f.chunk, primarySession.tokens) };
      }
      // Primary failed before the threshold: immediate failover.
      this.markError(primary.profileId, raced.f.err);
      return this.execute(order.slice(1), req);
    }

    // Threshold elapsed with no primary token: hedge on the backup.
    if (!backup) {
      const f = await primaryFirst; // no backup to hedge with; wait out the primary
      if (f.kind === "token") {
        this.recordTtft(primary.profileId, this.o.timers.now() - t0);
        return { source: primary.profileId, stream: chain(f.chunk, primarySession.tokens) };
      }
      this.markError(primary.profileId, f.err);
      throw f.err;
    }

    const backupSession = backup.start(req);
    const backupFirst = pullFirst(backupSession);
    const decided = await hedge(
      { id: primary.profileId, first: primaryFirst, session: primarySession },
      { id: backup.profileId, first: backupFirst, session: backupSession },
    );

    if (decided.kind === "win") {
      decided.loser.session.abort();
      if (decided.winner.id === primary.profileId) {
        this.recordTtft(primary.profileId, this.o.timers.now() - t0);
      } else {
        this.onPrimaryLostRace(primary.profileId);
      }
      return { source: decided.winner.id, stream: chain(decided.chunk, decided.winner.session.tokens) };
    }

    // Both sides errored during the hedge: mark them and try the rest of the chain.
    this.markError(primary.profileId, decided.errs[primary.profileId]);
    this.markError(backup.profileId, decided.errs[backup.profileId]);
    return this.execute(order.slice(2), req);
  }

  private onPrimaryLostRace(primaryId: string): void {
    const s = this.st(primaryId);
    s.lostStreak += 1;
    if (s.lostStreak >= this.o.lostRacesForSlow) {
      s.slowUntil = this.o.timers.now() + this.o.slowMs;
      s.lostStreak = 0;
    }
  }
}

async function pullFirst(s: StreamSession): Promise<First> {
  try {
    const r = await s.tokens.next();
    if (r.done) return { kind: "error", err: new AdapterError("empty stream") };
    return { kind: "token", chunk: r.value };
  } catch (e) {
    return { kind: "error", err: e as Error };
  }
}

interface Side {
  id: string;
  first: Promise<First>;
  session: StreamSession;
}

type HedgeResult =
  | { kind: "win"; winner: Side; loser: Side; chunk: string }
  | { kind: "both-error"; errs: Record<string, Error> };

/** First side to yield a token wins. If both error, report both. */
function hedge(a: Side, b: Side): Promise<HedgeResult> {
  return new Promise((resolve) => {
    let done = false;
    const errs: Record<string, Error> = {};
    let pending = 2;
    const watch = (self: Side, other: Side): void => {
      void self.first.then((f) => {
        if (done) return;
        if (f.kind === "token") {
          done = true;
          resolve({ kind: "win", winner: self, loser: other, chunk: f.chunk });
        } else {
          errs[self.id] = f.err;
          pending -= 1;
          if (pending === 0) {
            done = true;
            resolve({ kind: "both-error", errs });
          }
        }
      });
    };
    watch(a, b);
    watch(b, a);
  });
}

/** Prepend the already-pulled first chunk, then stream the rest. */
async function* chain(first: string, rest: AsyncIterableIterator<string>): AsyncIterable<string> {
  yield first;
  for await (const c of rest) yield c;
}
