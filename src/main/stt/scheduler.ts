// Interviewer-channel priority scheduling (speech-recognition spec, task 5.3).
// Recognition runs on one CPU-bound worker. When both channels have pending audio,
// interviewer chunks are always dequeued before candidate chunks, so interviewer
// segments finalize first and candidate recognition may lag under load. Scheduling
// is non-preemptive: a running candidate chunk finishes before an arriving
// interviewer chunk starts.
// shortcut: non-preemptive, so an interviewer chunk can wait at most one candidate
// chunk. Chunks are short (VAD-sized), so the lag is bounded; add preemption only
// if a single chunk ever grows long enough to delay an interviewer final.

export type Channel = "interviewer" | "candidate";

export interface SttJob {
  channel: Channel;
  /** Opaque id of the audio chunk to recognize; FIFO within a channel. */
  id: string;
}

export class SttScheduler {
  private readonly interviewer: SttJob[] = [];
  private readonly candidate: SttJob[] = [];

  enqueue(job: SttJob): void {
    (job.channel === "interviewer" ? this.interviewer : this.candidate).push(job);
  }

  /** Next chunk to recognize: the interviewer lane drains before the candidate lane. */
  next(): SttJob | undefined {
    return this.interviewer.shift() ?? this.candidate.shift();
  }

  get pending(): number {
    return this.interviewer.length + this.candidate.length;
  }
}
