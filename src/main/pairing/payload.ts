// Pairing payload shared by the QR code and the manual 6-digit entry (device-
// pairing spec, task 9.1). The QR encodes this whole payload so the VIEWER can
// reach the HOST without typing an address; the manual path carries just the
// code and discovers the address via mDNS (task 9.2). Both decode to the same
// shape, so the rest of the pairing flow does not care which was used.
//
// shortcut: this builds and parses the payload string; turning it into a QR
// bitmap is a one-call render in the renderer (a qrcode lib) once the pairing
// UI exists. Add that with the overlay/pairing screen, not here.

export interface PairingPayload {
  /** 6-digit pairing code (see PairingCodes). */
  code: string;
  /** HOST address for a direct connect; omitted when discovery is used. */
  host?: string;
  port?: number;
  /** HOST key fingerprint to pin on first use (see PinnedKeys). */
  fp?: string;
}

const SCHEME = "iva:";
const PATH = "//pair";

export function encodePairing(p: PairingPayload): string {
  if (!/^\d{6}$/.test(p.code)) throw new Error("pairing code must be 6 digits");
  const u = new URL(SCHEME + PATH);
  u.searchParams.set("code", p.code);
  if (p.host) u.searchParams.set("host", p.host);
  if (p.port !== undefined) u.searchParams.set("port", String(p.port));
  if (p.fp) u.searchParams.set("fp", p.fp);
  return u.toString();
}

export function decodePairing(s: string): PairingPayload | null {
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== SCHEME || u.host !== "pair") return null;
  const code = u.searchParams.get("code") ?? "";
  if (!/^\d{6}$/.test(code)) return null;
  const payload: PairingPayload = { code };
  const host = u.searchParams.get("host");
  if (host) payload.host = host;
  const port = u.searchParams.get("port");
  if (port !== null) {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
    payload.port = n;
  }
  const fp = u.searchParams.get("fp");
  if (fp) payload.fp = fp;
  return payload;
}
