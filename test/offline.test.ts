import { describe, expect, it } from "vitest";
import { sessionCapabilities } from "../src/main/stt/offline";

describe("offline capability split (5.4)", () => {
  it("keeps transcribing with the network down; only hints degrade", () => {
    expect(sessionCapabilities({ online: false, modelReady: true })).toEqual({
      canTranscribe: true,
      canHint: false,
    });
  });

  it("enables hints only when online", () => {
    expect(sessionCapabilities({ online: true, modelReady: true })).toEqual({
      canTranscribe: true,
      canHint: true,
    });
  });

  it("cannot transcribe until the local model is ready", () => {
    expect(sessionCapabilities({ online: true, modelReady: false }).canTranscribe).toBe(false);
  });
});
