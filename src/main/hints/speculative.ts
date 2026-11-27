import type { Timers } from "../llm/timers";

// Speculative hint start (design D5): after 300 ms of interviewer silence, start
// a request before the segment is finalized. If the interviewer resumes talking,
// cancel the pending start and abort any in-flight request, discarding its
// partial hint. VAD speech/silence events are injected so this is deterministic.

export interface Cancelable {
  cancel(): void;
}

export class SpeculativeStarter {
  private timer: { cancel(): void } | null = null;
  private running: Cancelable | null = null;

  constructor(
    private readonly timers: Timers,
    private readonly silenceMs: number,
    private readonly onStart: () => Cancelable,
  ) {}

  /** VAD reports the interviewer paused. Schedule a speculative start. */
  onSilence(): void {
    if (this.timer || this.running) return; // a start is already pending or running
    const t = this.timers.sleep(this.silenceMs);
    this.timer = t;
    void t.promise.then(() => {
      if (this.timer !== t) return; // cancelled during the wait
      this.timer = null;
      this.running = this.onStart();
    });
  }

  /** VAD reports the interviewer is speaking. Cancel the pending or in-flight start. */
  onSpeech(): void {
    if (this.timer) {
      this.timer.cancel();
      this.timer = null;
    }
    if (this.running) {
      this.running.cancel(); // discard the partial hint
      this.running = null;
    }
  }

  /** The request finished on its own; clear the in-flight marker. */
  settle(): void {
    this.running = null;
  }
}
