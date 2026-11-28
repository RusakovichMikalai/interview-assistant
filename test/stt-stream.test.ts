import { describe, expect, it } from "vitest";
import { Segmenter, type Recognizer, type Frame } from "../src/main/stt/stream";

// Fake recognizer: reveals one scripted word per accepted speech frame, so the
// running hypothesis grows word by word and finalize() returns the full line.
class FakeRecognizer implements Recognizer {
  private words: string[] = [];
  private i = 0;
  constructor(private readonly script: string[]) {}
  accept(): void {
    if (this.i < this.script.length) this.words.push(this.script[this.i++]);
  }
  partial(): string {
    return this.words.join(" ");
  }
  finalize(): string {
    const text = this.words.join(" ");
    this.words = [];
    this.i = 0;
    return text;
  }
}

const speech = (): Frame => ({ pcm: Buffer.alloc(2), speech: true, durationMs: 20 });
const silence = (ms = 20): Frame => ({ pcm: Buffer.alloc(2), speech: false, durationMs: ms });

describe("Segmenter (5.1)", () => {
  it("emits growing partials while speaking, deduped", () => {
    const seg = new Segmenter(new FakeRecognizer(["one", "two"]));
    expect(seg.push(speech())).toEqual([{ type: "partial", text: "one" }]);
    expect(seg.push(speech())).toEqual([{ type: "partial", text: "one two" }]);
    // No new word -> hypothesis unchanged -> no duplicate partial.
    expect(seg.push(speech())).toEqual([]);
  });

  it("finalizes after trailing silence crosses the endpoint", () => {
    const seg = new Segmenter(new FakeRecognizer(["hi", "there"]), 300);
    seg.push(speech());
    seg.push(speech());
    // 280 ms of silence: still inside the segment, no final yet.
    for (let ms = 0; ms < 280; ms += 20) expect(seg.push(silence())).toEqual([]);
    // Crossing 300 ms endpoints the segment.
    expect(seg.push(silence())).toEqual([{ type: "final", text: "hi there" }]);
  });

  it("ignores leading and between-segment silence", () => {
    // Single-word script: trailing-silence frames are fed to the recognizer but
    // add no words, so the final is just the spoken word.
    const seg = new Segmenter(new FakeRecognizer(["a"]), 40);
    expect(seg.push(silence())).toEqual([]); // leading silence
    seg.push(speech()); // "a"
    seg.push(silence());
    const closed = seg.push(silence()); // endpoint at 40 ms
    expect(closed).toEqual([{ type: "final", text: "a" }]);
    // Further silence after close produces nothing.
    expect(seg.push(silence())).toEqual([]);
    // Next speech starts a fresh segment (finalize reset the fake).
    expect(seg.push(speech())).toEqual([{ type: "partial", text: "a" }]);
  });

  it("flush finalizes an open segment at end of stream", () => {
    const seg = new Segmenter(new FakeRecognizer(["word"]));
    seg.push(speech());
    expect(seg.flush()).toEqual([{ type: "final", text: "word" }]);
    expect(seg.flush()).toEqual([]); // nothing open now
  });
});
