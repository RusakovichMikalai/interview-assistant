// Clock + cancelable sleep. Injected into the router so health timeouts and the
// hedge threshold are deterministic under test (ManualTimers) and real in prod.

export interface Timers {
  now(): number;
  /** Resolves after ms. cancel() prevents the resolution (promise stays pending). */
  sleep(ms: number): { promise: Promise<void>; cancel(): void };
}

export const realTimers: Timers = {
  now: () => Date.now(),
  sleep(ms) {
    let handle: ReturnType<typeof setTimeout>;
    const promise = new Promise<void>((resolve) => {
      handle = setTimeout(resolve, ms);
    });
    return { promise, cancel: () => clearTimeout(handle) };
  },
};

interface Pending {
  at: number;
  resolve: () => void;
  cancelled: boolean;
}

/** Test clock: time only moves when advance() is called. */
export class ManualTimers implements Timers {
  private t = 0;
  private pending: Pending[] = [];

  now(): number {
    return this.t;
  }

  sleep(ms: number): { promise: Promise<void>; cancel(): void } {
    const entry: Pending = { at: this.t + ms, resolve: () => {}, cancelled: false };
    const promise = new Promise<void>((resolve) => {
      entry.resolve = resolve;
    });
    this.pending.push(entry);
    return {
      promise,
      cancel: () => {
        entry.cancelled = true;
      },
    };
  }

  /** Move time forward and fire any due, non-cancelled sleeps. */
  advance(ms: number): void {
    this.t += ms;
    const due = this.pending.filter((e) => !e.cancelled && e.at <= this.t);
    this.pending = this.pending.filter((e) => !e.cancelled && e.at > this.t);
    for (const e of due) e.resolve();
  }
}
