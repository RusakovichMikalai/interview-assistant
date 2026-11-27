import type { Language } from "../../shared/settings";

// Model download verification and per-language loading (speech-recognition spec,
// tasks 5.2 and 5.4). A downloaded model is trusted only when its SHA-256 matches
// the catalog, and a session loads the model for the selected language only. The
// files live on disk, so recognition keeps working with no network (5.4): the check
// here is purely local. The actual sherpa-onnx load happens in the STT utility
// process (task 5.1); this layer decides whether start is allowed and which file.

export type ModelStatus = "ok" | "missing" | "corrupt";

export interface ModelSpec {
  language: Language;
  path: string;
  /** Expected lowercase hex SHA-256 of the model file. */
  sha256: string;
}

export type ModelCatalog = Record<Language, ModelSpec>;

/** Reads the file and returns "ok" / "missing" / "corrupt" for the spec. */
export type VerifyFn = (spec: ModelSpec) => ModelStatus;

/** Default verifier: file must exist and its SHA-256 must match the catalog. */
export function verifyOnDisk(spec: ModelSpec): ModelStatus {
  const fs = require("node:fs") as typeof import("node:fs");
  if (!fs.existsSync(spec.path)) return "missing";
  return sha256File(spec.path) === spec.sha256.toLowerCase() ? "ok" : "corrupt";
}

export function sha256File(path: string): string {
  const fs = require("node:fs") as typeof import("node:fs");
  return sha256Bytes(fs.readFileSync(path));
}

export function sha256Bytes(bytes: Uint8Array): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

/** Fetches the model bytes for a spec (e.g. an HTTPS download of the catalog URL). */
export type FetchFn = (spec: ModelSpec) => Promise<Uint8Array>;

/**
 * Downloads the model and writes it to disk only when its SHA-256 matches the
 * catalog, so a corrupt or tampered download never lands as a usable file.
 * shortcut: holds the whole model in memory before writing; upgrade to a
 * streaming hash+write if model files outgrow available RAM.
 */
export async function downloadModel(spec: ModelSpec, fetchBytes: FetchFn): Promise<ModelStatus> {
  const bytes = await fetchBytes(spec);
  if (sha256Bytes(bytes) !== spec.sha256.toLowerCase()) return "corrupt";
  const fs = require("node:fs") as typeof import("node:fs");
  const { dirname } = require("node:path") as typeof import("node:path");
  fs.mkdirSync(dirname(spec.path), { recursive: true });
  fs.writeFileSync(spec.path, bytes);
  return "ok";
}

export type StartCheck = { ok: true; spec: ModelSpec } | { ok: false; reason: ModelStatus };

export class ModelManager {
  private loaded: Language | null = null;

  constructor(
    private readonly catalog: ModelCatalog,
    private readonly verify: VerifyFn = verifyOnDisk,
  ) {}

  status(language: Language): ModelStatus {
    return this.verify(this.catalog[language]);
  }

  /** Downloads the model for this language; returns "ok" only when the checksum matches. */
  download(language: Language, fetchBytes: FetchFn): Promise<ModelStatus> {
    return downloadModel(this.catalog[language], fetchBytes);
  }

  /** Whether a session may start for this language; blocks on a missing/corrupt model. */
  canStart(language: Language): StartCheck {
    const status = this.status(language);
    if (status !== "ok") return { ok: false, reason: status };
    return { ok: true, spec: this.catalog[language] };
  }

  /** Load the model for this language only. Refuses if it is not verified on disk. */
  load(language: Language): ModelSpec {
    const check = this.canStart(language);
    if (!check.ok) throw new Error(`model for ${language} is ${check.reason}`);
    this.loaded = language;
    return check.spec;
  }

  /** The language currently loaded into memory, or null before any load. */
  get loadedLanguage(): Language | null {
    return this.loaded;
  }
}
