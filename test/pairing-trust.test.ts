import { describe, expect, it } from "vitest";
import { PinnedKeys } from "../src/main/pairing/pinning";
import { encodePairing, decodePairing } from "../src/main/pairing/payload";

describe("key pinning / trust on first use (9.1)", () => {
  it("pins an unknown peer on first use, matches the same key after", () => {
    const pins = new PinnedKeys();
    expect(pins.check("host-1", "KEY-A")).toBe("pinned");
    expect(pins.check("host-1", "KEY-A")).toBe("match");
    expect(pins.isTrusted("host-1", "KEY-A")).toBe(true);
  });

  it("rejects a different key for a pinned peer (impersonation)", () => {
    const pins = new PinnedKeys([["host-1", "KEY-A"]]);
    expect(pins.check("host-1", "KEY-B")).toBe("mismatch");
    expect(pins.isTrusted("host-1", "KEY-B")).toBe(false);
  });

  it("re-pins after the peer is forgotten", () => {
    const pins = new PinnedKeys([["host-1", "KEY-A"]]);
    pins.forget("host-1");
    expect(pins.check("host-1", "KEY-B")).toBe("pinned");
  });

  it("round-trips its pins for persistence", () => {
    const pins = new PinnedKeys();
    pins.check("a", "KA");
    pins.check("b", "KB");
    const restored = new PinnedKeys(pins.entries());
    expect(restored.isTrusted("a", "KA")).toBe(true);
    expect(restored.isTrusted("b", "KB")).toBe(true);
  });
});

describe("pairing payload (QR and manual code share one shape) (9.1)", () => {
  it("round-trips a full payload", () => {
    const p = { code: "123456", host: "192.168.1.5", port: 8443, fp: "ab:cd" };
    expect(decodePairing(encodePairing(p))).toEqual(p);
  });

  it("round-trips a code-only payload (manual entry, mDNS for address)", () => {
    expect(decodePairing(encodePairing({ code: "654321" }))).toEqual({ code: "654321" });
  });

  it("refuses to encode a non-6-digit code", () => {
    expect(() => encodePairing({ code: "12ab" })).toThrow(/6 digits/);
  });

  it("rejects a malformed or foreign string", () => {
    expect(decodePairing("not a url")).toBeNull();
    expect(decodePairing("https://pair?code=123456")).toBeNull();
    expect(decodePairing("iva://pair?code=12")).toBeNull();
    expect(decodePairing("iva://pair?code=123456&port=99999")).toBeNull();
  });
});
