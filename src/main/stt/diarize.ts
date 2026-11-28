// VIEWER-SOLO diarization (audio-capture spec, task 10.1). When only one mixed
// input is available (cable splitter or room mic) the two channels cannot be
// separated by source, so speakers are told apart by diarization instead: each
// finished segment carries a speaker embedding, and this layer clusters those
// embeddings online into speakers. The user then marks one detected speaker as
// "Me" with a single click; from then on that speaker maps to the candidate role
// and every other speaker to the interviewer role, for the rest of the session.
//
// This is the embedding-agnostic half (mirrors stream.ts): the actual speaker
// embedding (an x-vector / ECAPA net run on each segment's PCM) is produced
// upstream and passed in as a `number[]`. Clustering and the Me-mapping live here
// so they stay deterministic and testable without the native model.
//
// shortcut: online nearest-centroid clustering with a fixed similarity threshold
// and a speaker cap (2 for an interview); no offline re-clustering or re-scoring
// of past segments. Upgrade to spectral/agglomerative diarization if two voices
// of similar timbre get merged in practice.

import type { Turn } from "../../shared/llm";

export type SpeakerId = number;
/** Transcript role, as used by Turn ("candidate" = Me). */
export type Role = Turn["role"];

/** Cosine similarity; 0 when either vector has no magnitude. */
function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class Diarizer {
  // Running centroid per speaker, kept as sum + count so the mean updates in O(d).
  private readonly sums: number[][] = [];
  private readonly counts: number[] = [];
  private dim = 0;

  /**
   * @param threshold minimum cosine similarity to join an existing speaker; below
   *   it a new speaker is opened (until maxSpeakers is reached). Default 0.5,
   *   typical for length-normalized speaker embeddings.
   * @param maxSpeakers hard cap; past it every segment joins its nearest speaker.
   *   Default 2 (interview = candidate + interviewer).
   */
  constructor(
    private readonly threshold = 0.5,
    private readonly maxSpeakers = 2,
  ) {}

  /** Cluster one segment's embedding; returns the speaker it belongs to. */
  assign(embedding: readonly number[]): SpeakerId {
    if (embedding.length === 0) throw new Error("empty embedding");
    if (this.dim === 0) this.dim = embedding.length;
    else if (embedding.length !== this.dim)
      throw new Error(`embedding dim ${embedding.length} != ${this.dim}`);

    let best = -1;
    let bestSim = -Infinity;
    for (let s = 0; s < this.sums.length; s++) {
      const sim = cosine(embedding, this.centroid(s));
      if (sim > bestSim) {
        bestSim = sim;
        best = s;
      }
    }
    if (best === -1 || (bestSim < this.threshold && this.sums.length < this.maxSpeakers)) {
      best = this.open();
    }
    this.update(best, embedding);
    return best;
  }

  /** Speakers discovered so far. */
  get speakerCount(): number {
    return this.sums.length;
  }

  private centroid(s: SpeakerId): number[] {
    const c = this.counts[s];
    return this.sums[s].map((x) => x / c);
  }

  private open(): SpeakerId {
    this.sums.push(new Array(this.dim).fill(0));
    this.counts.push(0);
    return this.sums.length - 1;
  }

  private update(s: SpeakerId, embedding: readonly number[]): void {
    const sum = this.sums[s];
    for (let i = 0; i < this.dim; i++) sum[i] += embedding[i];
    this.counts[s] += 1;
  }
}

/**
 * Maps the one detected speaker the user clicked as "Me" to the candidate role and
 * every other speaker to the interviewer role. Before a speaker is marked, roleOf
 * returns null (unknown), so the transcript can hold the label until the click.
 */
export class SpeakerMap {
  private me: SpeakerId | null = null;

  /** One-click "Me" mapping; applies to the rest of the session. */
  setMe(id: SpeakerId): void {
    this.me = id;
  }

  roleOf(id: SpeakerId): Role | null {
    if (this.me === null) return null;
    return id === this.me ? "candidate" : "interviewer";
  }
}
