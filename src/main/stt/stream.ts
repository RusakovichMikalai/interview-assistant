// Streaming STT segmentation (speech-recognition spec, task 5.1, design D5).
// Turns a stream of VAD-tagged PCM frames into `partial` events while the speaker
// talks and one `final` event once speech ends. This is the recognizer-agnostic
// half: the actual model (sherpa-onnx with the selected RU/EN net) implements the
// `Recognizer` interface and plugs in behind it. Silero VAD supplies the per-frame
// `speech` flag; endpointing (how much trailing silence closes a segment) lives
// here so it stays deterministic and testable without the native binding.
//
// Latency budget (spec: final within 500 ms after speech ends) = endpoint silence
// + the recognizer's finalize() cost. endpointSilenceMs is the tunable part; the
// recognizer cost is measured on reference hardware in the task-5.1 verify once a
// real model is wired. shortcut: fixed endpoint silence, no adaptive/ML endpointer;
// upgrade to sherpa's built-in endpoint model if fixed silence proves too eager.

/** Narrow boundary the native model implements. One instance per channel. */
export interface Recognizer {
  /** Feed one frame of 16 kHz mono s16le PCM; updates the running hypothesis. */
  accept(frame: Buffer): void;
  /** Best hypothesis for the segment in progress (may be empty early on). */
  partial(): string;
  /** Close the segment: return its final text and reset for the next one. */
  finalize(): string;
}

/** One VAD-tagged audio frame. `speech` is Silero's decision for this frame. */
export interface Frame {
  pcm: Buffer;
  speech: boolean;
  durationMs: number;
}

export type SttEvent =
  | { type: "partial"; text: string }
  | { type: "final"; text: string };

export class Segmenter {
  private inSegment = false;
  private trailingSilenceMs = 0;
  private lastPartial = "";

  /**
   * @param recognizer the model behind the stream.
   * @param endpointSilenceMs trailing silence that closes a segment (default 300 ms,
   *   matching the speculative-hint trigger in design D5).
   */
  constructor(
    private readonly recognizer: Recognizer,
    private readonly endpointSilenceMs = 300,
  ) {}

  /** Push one frame; returns the events it produced (usually 0 or 1). */
  push(frame: Frame): SttEvent[] {
    if (frame.speech) {
      this.recognizer.accept(frame.pcm);
      this.inSegment = true;
      this.trailingSilenceMs = 0;
      const text = this.recognizer.partial();
      if (text && text !== this.lastPartial) {
        this.lastPartial = text;
        return [{ type: "partial", text }];
      }
      return [];
    }
    if (!this.inSegment) return []; // leading / between-segment silence
    // Trailing silence: keep feeding so the decoder flushes, then endpoint.
    this.recognizer.accept(frame.pcm);
    this.trailingSilenceMs += frame.durationMs;
    if (this.trailingSilenceMs >= this.endpointSilenceMs) return [this.close()];
    return [];
  }

  /** End of stream: finalize an open segment, if any. */
  flush(): SttEvent[] {
    return this.inSegment ? [this.close()] : [];
  }

  private close(): SttEvent {
    const text = this.recognizer.finalize();
    this.inSegment = false;
    this.trailingSilenceMs = 0;
    this.lastPartial = "";
    return { type: "final", text };
  }
}
