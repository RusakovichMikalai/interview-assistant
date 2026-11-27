import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/main/hints/sessions";

describe("session store and delete (7.4)", () => {
  const root = mkdtempSync(join(tmpdir(), "sessions-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("keeps a role-labelled transcript and a hint history, scrollable in order", () => {
    const store = new SessionStore(root);
    const id = store.create();

    store.appendTurn(id, { role: "interviewer", text: "Tell me about X" });
    store.appendTurn(id, { role: "candidate", text: "Sure" });
    store.appendHint(id, { ts: 1, source: "p1", bullets: ["a", "b"] });

    expect(store.transcript(id)).toEqual([
      { role: "interviewer", text: "Tell me about X" },
      { role: "candidate", text: "Sure" },
    ]);
    expect(store.hints(id)).toEqual([{ ts: 1, source: "p1", bullets: ["a", "b"] }]);
    expect(store.list()).toContain(id);
  });

  it("removes transcript, hints and audio buffers on delete", () => {
    const store = new SessionStore(root);
    const id = store.create();
    store.appendTurn(id, { role: "interviewer", text: "q" });
    store.appendHint(id, { ts: 2, source: "p", bullets: ["x"] });
    writeFileSync(join(store.audioDir(id), "buf.wav"), "pcm"); // capture layer writes audio here

    expect(existsSync(store.dir(id))).toBe(true);
    store.delete(id);

    expect(existsSync(store.dir(id))).toBe(false);
    expect(existsSync(store.audioDir(id))).toBe(false);
    expect(store.list()).not.toContain(id);
  });
});
