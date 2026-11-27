// Hint trigger modes and the NONE result rule. See answer-hints spec and design
// D5. In every auto mode the model may still answer NONE for a non-question; the
// difference is whether a request is sent at all:
//   - hotkey:         only the hotkey sends a request
//   - every-turn:     every finished interviewer turn sends a request
//   - questions-only: only turns that look like a question send a request
// The hotkey always sends a request regardless of mode.

export type TriggerMode = "hotkey" | "every-turn" | "questions-only";

export type RequestReason = "hotkey" | "turn";

export class HintTrigger {
  constructor(
    private mode: TriggerMode,
    private readonly onRequest: (reason: RequestReason, question: string) => void,
  ) {}

  setMode(mode: TriggerMode): void {
    this.mode = mode;
  }

  /** A finished interviewer turn. May start a request depending on the mode. */
  interviewerTurnFinished(text: string): void {
    if (this.mode === "every-turn") this.onRequest("turn", text);
    else if (this.mode === "questions-only" && looksLikeQuestion(text)) this.onRequest("turn", text);
  }

  /** The hint hotkey: always starts a request for the latest interviewer turn. */
  hotkey(latestTurn: string): void {
    this.onRequest("hotkey", latestTurn);
  }
}

// shortcut: cheap pre-filter for questions-only; the model still returns NONE as
// the final filter. Upgrade with a classifier if it misses too many questions.
// \b is ASCII-only and never matches after a Cyrillic word, so use a Unicode
// letter lookahead instead.
const QUESTION_WORDS =
  /^(кто|что|где|когда|почему|зачем|как|какой|какая|какие|сколько|расскажи|опиши|who|what|where|when|why|how|which|can|could|do|does|did|are|is|tell|describe|explain)(?!\p{L})/iu;

export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return t.endsWith("?") || QUESTION_WORDS.test(t);
}

/** The visible hint. A NONE result keeps the previous hint instead of clearing it. */
export class HintState {
  private current: string[] | null = null;

  get bullets(): string[] | null {
    return this.current;
  }

  /** Apply a model result. "NONE" (or empty) keeps the previous hint. */
  apply(result: string[] | "NONE"): void {
    if (result === "NONE" || result.length === 0) return;
    this.current = result;
  }
}

/** True when a raw model reply means "not a question / no hint". */
export function isNone(reply: string): boolean {
  return reply.trim().toUpperCase() === "NONE" || reply.trim() === "";
}
