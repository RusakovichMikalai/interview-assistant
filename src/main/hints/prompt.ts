import type { LlmRequest, Turn } from "../../shared/llm";
import type { Language } from "../../shared/settings";

// Assembles a hint LlmRequest: short system prompt + cached prefix (CV, vacancy,
// notes) + last N turns + the question. See design D5. The prefix is stable
// across a session so the router's backup profile can cache it.

export interface InterviewContext {
  cv?: string;
  vacancy?: string;
  notes?: string;
}

const LANG_NAME: Record<Language, string> = { ru: "Russian", en: "English" };

/** Cached context block. Empty string when nothing was loaded. */
export function buildPrefix(ctx: InterviewContext): string {
  const parts: string[] = [];
  if (ctx.cv?.trim()) parts.push(`# Candidate CV\n${ctx.cv.trim()}`);
  if (ctx.vacancy?.trim()) parts.push(`# Vacancy\n${ctx.vacancy.trim()}`);
  if (ctx.notes?.trim()) parts.push(`# Notes\n${ctx.notes.trim()}`);
  return parts.join("\n\n");
}

export function systemPrompt(language: Language): string {
  const name = LANG_NAME[language];
  return [
    `You help a job candidate answer interview questions.`,
    `Reply in ${name} as 3 to 5 short bullet points the candidate can speak from.`,
    `Ground the answer in the candidate CV, vacancy and notes above when relevant.`,
    `If the latest interviewer turn is not a question, reply with exactly NONE.`,
  ].join(" ");
}

export interface AssembleOptions {
  /** How many recent turns to include as conversation context. */
  lastN?: number;
}

export function assembleRequest(
  ctx: InterviewContext,
  language: Language,
  turns: Turn[],
  question: string,
  opts: AssembleOptions = {},
): LlmRequest {
  const lastN = opts.lastN ?? 10;
  const prefix = buildPrefix(ctx);
  return {
    system: systemPrompt(language),
    prefix: prefix || undefined,
    turns: turns.slice(-lastN),
    question,
  };
}
