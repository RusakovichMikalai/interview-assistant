import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SecretStore, type Encryptor } from "../src/main/secret-store";

// Fake keychain: reversible, not real crypto. Enough to prove the store's
// contract and that plaintext never lands in the file or logs.
function fakeEncryptor(): Encryptor {
  return {
    isAvailable: () => true,
    encryptString: (p) => Buffer.from(`enc:${p}`, "utf8"),
    decryptString: (e) => e.toString("utf8").replace(/^enc:/, ""),
  };
}

let file: string;

beforeEach(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ia-secret-"));
  file = path.join(dir, "secrets.json");
});

describe("SecretStore", () => {
  it("round-trips a secret", async () => {
    const store = new SecretStore(file, fakeEncryptor());
    await store.set("ref-1", "sk-abc-123");
    expect(await store.get("ref-1")).toBe("sk-abc-123");
  });

  it("returns undefined for an unknown ref", async () => {
    const store = new SecretStore(file, fakeEncryptor());
    expect(await store.get("missing")).toBeUndefined();
  });

  it("deletes a secret", async () => {
    const store = new SecretStore(file, fakeEncryptor());
    await store.set("ref-1", "sk-abc-123");
    await store.delete("ref-1");
    expect(await store.get("ref-1")).toBeUndefined();
  });

  it("never writes the plaintext secret to disk", async () => {
    const store = new SecretStore(file, fakeEncryptor());
    await store.set("ref-1", "sk-PLAINTEXT-XYZ");
    const raw = await fs.readFile(file, "utf8");
    expect(raw).not.toContain("sk-PLAINTEXT-XYZ");
  });

  it("never logs the plaintext secret", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new SecretStore(file, fakeEncryptor());
    await store.set("ref-1", "sk-PLAINTEXT-XYZ");
    await store.get("ref-1");
    const logged = [...spy.mock.calls, ...errSpy.mock.calls].flat().join(" ");
    expect(logged).not.toContain("sk-PLAINTEXT-XYZ");
    spy.mockRestore();
    errSpy.mockRestore();
  });

  it("refuses to store when encryption is unavailable", async () => {
    const enc = { ...fakeEncryptor(), isAvailable: () => false };
    const store = new SecretStore(file, enc);
    await expect(store.set("ref-1", "x")).rejects.toThrow(/unavailable/);
  });
});
