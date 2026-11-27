import { promises as fs } from "node:fs";
import * as path from "node:path";

// OS-keychain-backed secret storage for API keys. Config (settings.json) holds
// only a keyRef; the encrypted value lives in a separate file. The Encryptor is
// injected so this is testable without Electron's safeStorage.
export interface Encryptor {
  isAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(enc: Buffer): string;
}

type Blob = Record<string, string>; // keyRef -> base64 ciphertext

export class SecretStore {
  private cache: Blob | null = null;

  constructor(
    private readonly filePath: string,
    private readonly enc: Encryptor,
  ) {}

  private async read(): Promise<Blob> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.filePath, "utf8")) as Blob;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.cache = {};
    }
    return this.cache;
  }

  private async write(blob: Blob): Promise<void> {
    this.cache = blob;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(blob), "utf8");
  }

  async set(keyRef: string, secret: string): Promise<void> {
    if (!this.enc.isAvailable()) throw new Error("secret encryption unavailable on this OS");
    const blob = { ...(await this.read()) };
    blob[keyRef] = this.enc.encryptString(secret).toString("base64");
    await this.write(blob);
  }

  async get(keyRef: string): Promise<string | undefined> {
    const blob = await this.read();
    const b64 = blob[keyRef];
    if (b64 === undefined) return undefined;
    return this.enc.decryptString(Buffer.from(b64, "base64"));
  }

  async delete(keyRef: string): Promise<void> {
    const blob = { ...(await this.read()) };
    delete blob[keyRef];
    await this.write(blob);
  }
}

// Electron safeStorage adapter. Imported lazily so non-Electron tests never pull
// in the electron module.
export function electronEncryptor(): Encryptor {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { safeStorage } = require("electron") as typeof import("electron");
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (p) => safeStorage.encryptString(p),
    decryptString: (e) => safeStorage.decryptString(e),
  };
}
