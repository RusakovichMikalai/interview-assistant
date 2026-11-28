import type { AdapterKind } from "./settings";

// Types shared between the LLM adapters, the router and the renderer.

export interface Turn {
  role: "interviewer" | "candidate";
  text: string;
}

export interface LlmRequest {
  system: string;
  /** Cached context prefix (CV, vacancy, notes). Assembled in the hints layer. */
  prefix?: string;
  turns: Turn[];
  question: string;
}

export type Health = "OK" | "SLOW" | "LIMITED" | "DOWN";

/** Usage-limit error. resetAt is an epoch-ms time when the limit clears. */
export class LimitError extends Error {
  constructor(
    message: string,
    readonly resetAt?: number,
  ) {
    super(message);
    this.name = "LimitError";
  }
}

/** Connection error, crash or error response - anything that is not a usage limit. */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}

export interface StreamSession {
  /** Token chunks. The first resolved next() marks the first token. Throws
   *  LimitError or AdapterError on failure. */
  tokens: AsyncIterableIterator<string>;
  /** Stop the request and free its resources. Idempotent. */
  abort(): void;
  /** Non-fatal throttle signal seen during the turn (e.g. the subscription's
   *  near-limit `allowed_warning`). The turn still succeeds; the router reads
   *  this after the stream ends to bench the primary. */
  readonly warned?: boolean;
}

export interface LlmAdapter {
  readonly profileId: string;
  readonly kind: AdapterKind;
  start(req: LlmRequest): StreamSession;
}
