import { describe, expect, it } from "vitest";
import { PairingCodes } from "../src/main/pairing/codes";
import { ManualTimers } from "../src/main/llm/timers";

const TTL = 5 * 60 * 1000;

// Deterministic 6-digit generator cycling through a fixed list.
function seqGen(codes: string[]): () => string {
  let i = 0;
  return () => codes[i++ % codes.length];
}

describe("pairing codes (9.1)", () => {
  it("issues a 6-digit code with a 5-minute expiry", () => {
    const timers = new ManualTimers();
    const codes = new PairingCodes(timers, TTL, seqGen(["123456"]));
    const issued = codes.issue("peer-secret");
    expect(issued.code).toBe("123456");
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.expiresAt).toBe(timers.now() + TTL);
  });

  it("redeems a valid code once and returns the secret", () => {
    const timers = new ManualTimers();
    const codes = new PairingCodes(timers, TTL, seqGen(["111111"]));
    codes.issue("secret-A");
    expect(codes.redeem("111111")).toEqual({ ok: true, secret: "secret-A" });
  });

  it("fails an unknown code", () => {
    const codes = new PairingCodes(new ManualTimers(), TTL, seqGen(["222222"]));
    expect(codes.redeem("000000")).toEqual({ ok: false, reason: "unknown" });
  });

  it("stays valid just before 5 minutes", () => {
    const timers = new ManualTimers();
    const codes = new PairingCodes(timers, TTL, seqGen(["333333"]));
    codes.issue("secret");
    timers.advance(TTL - 1);
    expect(codes.redeem("333333").ok).toBe(true);
  });

  it("expires a code after 5 minutes", () => {
    const timers = new ManualTimers();
    const codes = new PairingCodes(timers, TTL, seqGen(["888888"]));
    codes.issue("secret");
    timers.advance(TTL);
    expect(codes.redeem("888888")).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects reuse of a code after one successful pairing", () => {
    const timers = new ManualTimers();
    const codes = new PairingCodes(timers, TTL, seqGen(["444444"]));
    codes.issue("secret");
    expect(codes.redeem("444444").ok).toBe(true);
    expect(codes.redeem("444444")).toEqual({ ok: false, reason: "used" });
  });

  it("avoids issuing a code that collides with a live one", () => {
    const timers = new ManualTimers();
    // gen offers 555555 twice, then 666666; issue must skip the duplicate.
    const codes = new PairingCodes(timers, TTL, seqGen(["555555", "555555", "666666"]));
    expect(codes.issue("a").code).toBe("555555");
    expect(codes.issue("b").code).toBe("666666");
  });

  it("prunes expired codes", () => {
    const timers = new ManualTimers();
    const codes = new PairingCodes(timers, TTL, seqGen(["777777"]));
    codes.issue("secret");
    timers.advance(TTL);
    codes.prune();
    expect(codes.redeem("777777")).toEqual({ ok: false, reason: "unknown" });
  });
});
