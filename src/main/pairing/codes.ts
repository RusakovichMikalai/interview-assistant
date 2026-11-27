import type { Timers } from "../llm/timers";

// Pairing code lifecycle (device-pairing spec, task 9.1): the HOST issues a
// 6-digit code bound to a pairing secret. The code expires after 5 minutes or
// after one successful use. On success the VIEWER learns the secret and pins it;
// the QR path carries the same code, and the transport/key-pinning wiring lives
// in the WebRTC task (9.3). Time comes from injected Timers so expiry is testable.

const TTL_MS = 5 * 60 * 1000;

export interface IssuedCode {
  code: string;
  expiresAt: number;
}

export type RedeemResult =
  | { ok: true; secret: string }
  | { ok: false; reason: "unknown" | "expired" | "used" };

interface Entry {
  expiresAt: number;
  secret: string;
  used: boolean;
}

export class PairingCodes {
  private readonly pending = new Map<string, Entry>();

  constructor(
    private readonly timers: Timers,
    private readonly ttlMs: number = TTL_MS,
    private readonly gen: () => string = randomCode,
  ) {}

  /** Issue a fresh, unused 6-digit code bound to the pairing secret. */
  issue(secret: string): IssuedCode {
    this.prune(); // drop expired entries so the code space does not fill up
    let code = this.gen();
    for (let tries = 0; this.pending.has(code); tries++) {
      if (tries >= 100) throw new Error("no free pairing code available");
      code = this.gen();
    }
    const expiresAt = this.timers.now() + this.ttlMs;
    this.pending.set(code, { expiresAt, secret, used: false });
    return { code, expiresAt };
  }

  /** Redeem a code. Expired or already-used codes fail with a distinct reason. */
  redeem(code: string): RedeemResult {
    const entry = this.pending.get(code);
    if (!entry) return { ok: false, reason: "unknown" };
    if (this.timers.now() >= entry.expiresAt) {
      this.pending.delete(code);
      return { ok: false, reason: "expired" };
    }
    if (entry.used) return { ok: false, reason: "used" };
    entry.used = true; // one-time use; kept so a reuse reports "used", not "unknown"
    return { ok: true, secret: entry.secret };
  }

  /** Drop codes past their expiry. */
  prune(): void {
    const now = this.timers.now();
    for (const [code, e] of this.pending) {
      if (now >= e.expiresAt) this.pending.delete(code);
    }
  }
}

function randomCode(): string {
  const { randomInt } = require("node:crypto") as typeof import("node:crypto");
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
