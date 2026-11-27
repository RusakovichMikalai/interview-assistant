import type { Timers } from "../llm/timers";

// End-to-end hint latency: from the end of interviewer speech to the first token
// on screen (design D5, target p50 <= 1.8 s on the reference setup). The metric
// is logged per hint so the reference-hardware check in task 7.5 can read it.

export interface LatencyEntry {
  id: string;
  ms: number;
}

export class LatencyLog {
  private readonly starts = new Map<string, number>();
  private readonly log: LatencyEntry[] = [];

  constructor(private readonly timers: Timers) {}

  /** Mark the end of interviewer speech for a hint. */
  speechEnded(id: string): void {
    this.starts.set(id, this.timers.now());
  }

  /** Mark the first token shown; record and return the latency, or undefined if unstarted. */
  firstToken(id: string): number | undefined {
    const t0 = this.starts.get(id);
    if (t0 === undefined) return undefined;
    this.starts.delete(id);
    const ms = this.timers.now() - t0;
    this.log.push({ id, ms });
    return ms;
  }

  entries(): readonly LatencyEntry[] {
    return this.log;
  }

  /** 50th percentile latency in ms, or undefined when nothing is logged. */
  p50(): number | undefined {
    if (this.log.length === 0) return undefined;
    const sorted = this.log.map((e) => e.ms).sort((a, b) => a - b);
    return sorted[Math.ceil(0.5 * sorted.length) - 1];
  }
}
