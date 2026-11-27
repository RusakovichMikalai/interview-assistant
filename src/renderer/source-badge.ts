// Source and health indicator for the hint overlay (llm-routing spec, task 6.7).
// Shows which backend answered the current hint and whether it is rate-limited:
//   claude-subscription          -> SUB
//   anthropic / openai-compatible -> API
//   an API source that is LIMITED -> API (limit)
// The badge reflects the source that actually served the hint and that source's
// health. A subscription that hit its limit has already failed over to an API
// backup, so the serving source is then API, not SUB.
//
// Kind and health arrive from the main process over IPC as plain strings; these
// unions mirror AdapterKind / Health in src/shared (the renderer tsconfig keeps
// src/shared out of its rootDir, so they are restated here, not imported).

export type SourceKind = "anthropic" | "openai-compatible" | "claude-subscription";
export type SourceHealth = "OK" | "SLOW" | "LIMITED" | "DOWN";

export type SourceBadge = "SUB" | "API" | "API (limit)";

export function sourceBadge(kind: SourceKind, health: SourceHealth): SourceBadge {
  if (kind === "claude-subscription") return "SUB";
  return health === "LIMITED" ? "API (limit)" : "API";
}

// Paint the badge onto an element; `limited` drives styling (e.g. a warning color).
export function renderSourceBadge(el: HTMLElement, kind: SourceKind, health: SourceHealth): void {
  const label = sourceBadge(kind, health);
  el.textContent = label;
  el.dataset.limited = String(label === "API (limit)");
}
