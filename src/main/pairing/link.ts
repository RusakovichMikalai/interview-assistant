import type { Timers } from "../llm/timers";

// Link status and recovery (device-pairing spec, task 9.4): tracks the VIEWER<->HOST
// link state, the measured audio delay shown on the VIEWER, and auto-reconnect after
// a drop without a new pairing. On recovery the silent interval is reported as a gap
// so the transcript can mark it. The transport (WebRTC, task 9.3) supplies attempt():
// a single reconnect try that resolves true on success. Time is injected for tests.

export type LinkState = "connected" | "reconnecting" | "down";

export interface Gap {
  /** When the link dropped and when it came back (Timers.now() values). */
  from: number;
  to: number;
}

export interface LinkMonitorOptions {
  /** One reconnect attempt; true means the link is up again. */
  attempt: () => Promise<boolean>;
  onState?: (state: LinkState) => void;
  /** Called once per recovery with the silent interval to mark in the transcript. */
  onGap?: (gap: Gap) => void;
  /** Backoff between failed attempts: first delay, then doubled up to maxDelayMs. */
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export class LinkMonitor {
  private state: LinkState = "connected";
  private delayMs = 0;
  private droppedAt = 0;
  private reconnecting = false; // guards against overlapping reconnect loops
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(
    private readonly timers: Timers,
    private readonly opts: LinkMonitorOptions,
  ) {
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.maxDelayMs = opts.maxDelayMs ?? 5000;
  }

  get currentState(): LinkState {
    return this.state;
  }

  /** Last measured one-way audio delay, shown on the VIEWER. */
  get measuredDelayMs(): number {
    return this.delayMs;
  }

  reportDelay(ms: number): void {
    this.delayMs = ms;
  }

  /** The link went down; start reconnecting automatically. */
  drop(): void {
    if (this.state !== "connected") return; // already down or reconnecting
    this.droppedAt = this.timers.now();
    this.setState("reconnecting");
    void this.reconnectLoop();
  }

  private async reconnectLoop(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    let delay = this.baseDelayMs;
    try {
      // The loop ends only on success; the outer app stops the session to abort.
      for (;;) {
        const ok = await this.opts.attempt();
        if (ok) {
          this.opts.onGap?.({ from: this.droppedAt, to: this.timers.now() });
          this.setState("connected");
          return;
        }
        this.setState("down");
        await this.timers.sleep(delay).promise;
        this.setState("reconnecting");
        delay = Math.min(delay * 2, this.maxDelayMs);
      }
    } finally {
      this.reconnecting = false;
    }
  }

  private setState(s: LinkState): void {
    if (this.state === s) return;
    this.state = s;
    this.opts.onState?.(s);
  }
}
