import type { Turn } from "../../shared/llm";

// On-device session store (answer-hints spec, task 7.4). Each session owns a
// directory holding the role-labelled transcript, the hint history and the audio
// buffers. Everything stays on disk on this machine; deleting a session removes its
// whole directory, so transcript, hints and audio go together. The scrollable
// transcript/hints overlay that reads this store is renderer UI, deferred.

export interface HintRecord {
  /** epoch-ms when the hint was produced. */
  ts: number;
  /** Profile id that served it (for the source badge in history). */
  source: string;
  /** The bullet lines shown. */
  bullets: string[];
}

export class SessionStore {
  private readonly fs = require("node:fs") as typeof import("node:fs");
  private readonly path = require("node:path") as typeof import("node:path");

  constructor(private readonly root: string) {}

  /** Create a new session directory (with its audio subdir) and return its id. */
  create(): string {
    const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
    const id = randomUUID();
    this.fs.mkdirSync(this.audioDir(id), { recursive: true });
    return id;
  }

  dir(id: string): string {
    return this.path.join(this.root, id);
  }

  audioDir(id: string): string {
    return this.path.join(this.dir(id), "audio");
  }

  /** Append one transcript turn with its role label. */
  appendTurn(id: string, turn: Turn): void {
    this.fs.appendFileSync(this.path.join(this.dir(id), "transcript.jsonl"), JSON.stringify(turn) + "\n");
  }

  /** Append one hint to the session history. */
  appendHint(id: string, hint: HintRecord): void {
    this.fs.appendFileSync(this.path.join(this.dir(id), "hints.jsonl"), JSON.stringify(hint) + "\n");
  }

  transcript(id: string): Turn[] {
    return this.readJsonl(this.path.join(this.dir(id), "transcript.jsonl"));
  }

  hints(id: string): HintRecord[] {
    return this.readJsonl(this.path.join(this.dir(id), "hints.jsonl"));
  }

  list(): string[] {
    if (!this.fs.existsSync(this.root)) return [];
    return this.fs
      .readdirSync(this.root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  }

  /** Remove the session's transcript, hints and audio buffers from disk. */
  delete(id: string): void {
    this.fs.rmSync(this.dir(id), { recursive: true, force: true });
  }

  private readJsonl<T>(file: string): T[] {
    if (!this.fs.existsSync(file)) return [];
    return this.fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as T);
  }
}
