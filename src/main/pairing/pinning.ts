// Key pinning for paired devices (device-pairing spec, task 9.1). Trust on first
// use: the first time a peer pairs, its public key is pinned; every later
// connection must present the same key or it is rejected. This stops a third
// device from impersonating a paired peer on the same code.
//
// State is in-memory and the caller persists it (entries() / the constructor's
// initial list) through the settings store, so pins survive restarts.

export type PinResult = "pinned" | "match" | "mismatch";

export class PinnedKeys {
  private readonly keys: Map<string, string>;

  constructor(initial?: Iterable<[string, string]>) {
    this.keys = new Map(initial);
  }

  /** Trust on first use: pin an unknown peer; otherwise require the pinned key. */
  check(peerId: string, publicKey: string): PinResult {
    const known = this.keys.get(peerId);
    if (known === undefined) {
      this.keys.set(peerId, publicKey);
      return "pinned";
    }
    return known === publicKey ? "match" : "mismatch";
  }

  /** True only for a peer whose presented key matches the pinned one (no mutation). */
  isTrusted(peerId: string, publicKey: string): boolean {
    return this.keys.get(peerId) === publicKey;
  }

  /** Drop a pin so the peer can be paired again from scratch. */
  forget(peerId: string): void {
    this.keys.delete(peerId);
  }

  /** Snapshot for persistence. */
  entries(): [string, string][] {
    return [...this.keys];
  }
}
