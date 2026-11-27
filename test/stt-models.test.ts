import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ModelManager,
  sha256File,
  verifyOnDisk,
  type ModelCatalog,
  type ModelStatus,
  type ModelSpec,
} from "../src/main/stt/models";
import { sessionCapabilities } from "../src/main/stt/offline";

// A stub verifier keyed by language status, so the matrix needs no real files.
function stubVerify(byLang: Partial<Record<"ru" | "en", ModelStatus>>) {
  return (spec: ModelSpec): ModelStatus => byLang[spec.language] ?? "missing";
}

const catalog: ModelCatalog = {
  ru: { language: "ru", path: "/models/ru.bin", sha256: "aa" },
  en: { language: "en", path: "/models/en.bin", sha256: "bb" },
};

describe("per-language model loading (5.2)", () => {
  it("loads only the selected language model", () => {
    const m = new ModelManager(catalog, stubVerify({ ru: "ok", en: "ok" }));
    const spec = m.load("en");
    expect(spec.language).toBe("en");
    expect(m.loadedLanguage).toBe("en");
  });

  it("blocks session start when the selected model is missing", () => {
    const m = new ModelManager(catalog, stubVerify({ en: "missing" }));
    expect(m.canStart("en")).toEqual({ ok: false, reason: "missing" });
    expect(() => m.load("en")).toThrow(/en is missing/);
    expect(m.loadedLanguage).toBeNull();
  });

  it("blocks start when the model file is corrupt (checksum mismatch)", () => {
    const m = new ModelManager(catalog, stubVerify({ ru: "corrupt" }));
    expect(m.canStart("ru")).toEqual({ ok: false, reason: "corrupt" });
  });
});

describe("model checksum on disk (5.2)", () => {
  const dir = mkdtempSync(join(tmpdir(), "stt-model-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("accepts a file whose SHA-256 matches and rejects a tampered one", () => {
    const path = join(dir, "model.bin");
    writeFileSync(path, "model-bytes");
    const good: ModelSpec = { language: "ru", path, sha256: sha256File(path) };
    expect(verifyOnDisk(good)).toBe("ok");

    writeFileSync(path, "tampered");
    expect(verifyOnDisk(good)).toBe("corrupt");

    expect(verifyOnDisk({ language: "en", path: join(dir, "nope.bin"), sha256: "x" })).toBe("missing");
  });
});

describe("offline capabilities (5.4)", () => {
  it("keeps transcribing with the network down; only hints degrade", () => {
    expect(sessionCapabilities({ online: false, modelReady: true })).toEqual({
      canTranscribe: true,
      canHint: false,
    });
  });

  it("enables hints when online and a model is ready", () => {
    expect(sessionCapabilities({ online: true, modelReady: true })).toEqual({
      canTranscribe: true,
      canHint: true,
    });
  });

  it("cannot transcribe without a ready model", () => {
    expect(sessionCapabilities({ online: false, modelReady: false }).canTranscribe).toBe(false);
  });
});
