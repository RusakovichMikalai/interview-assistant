// Hint overlay rendering (answer-hints spec, task 7.4). Pure DOM painters for the
// three live panes - the streaming bullets of the current hint, the role-labelled
// transcript, and the scrollable hint history - plus the session-delete control.
// Session data lives on disk in SessionStore (main); delete here only asks the
// main process to erase it. Types mirror shared/llm.ts and hints/sessions.ts
// (the renderer tsconfig keeps src/main and src/shared out of its rootDir, so they
// are restated here, not imported).

export type Role = "interviewer" | "candidate";
export interface Turn {
  role: Role;
  text: string;
}
export interface HintRecord {
  ts: number;
  source: string;
  bullets: string[];
}

/** User-facing role labels in the transcript. Swap upstream for a localized set. */
export const ROLE_LABEL: Record<Role, string> = {
  interviewer: "Interviewer",
  candidate: "You",
};

/** Paint the current hint as bullets. Called on every token chunk, so the bullets
 *  accumulated so far - including a partial last one - appear as they stream in. */
export function renderBullets(el: HTMLElement, bullets: string[]): void {
  el.replaceChildren(
    ...bullets.map((b) => {
      const li = document.createElement("li");
      li.textContent = b;
      return li;
    }),
  );
}

/** Paint the live transcript, each turn tagged with its speaker's role label. */
export function renderTranscript(el: HTMLElement, turns: Turn[]): void {
  el.replaceChildren(
    ...turns.map((t) => {
      const row = document.createElement("div");
      row.className = "turn";
      row.dataset.role = t.role;
      const label = document.createElement("span");
      label.className = "role";
      label.textContent = ROLE_LABEL[t.role];
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = t.text;
      row.append(label, text);
      return row;
    }),
  );
}

/** Paint the session's earlier hints, oldest first, each tagged with the source
 *  that served it. The container scrolls (overflow handled in CSS). */
export function renderHistory(el: HTMLElement, hints: HintRecord[]): void {
  el.replaceChildren(
    ...hints.map((h) => {
      const item = document.createElement("li");
      item.className = "hint";
      item.dataset.source = h.source;
      const ul = document.createElement("ul");
      renderBullets(ul, h.bullets);
      item.append(ul);
      return item;
    }),
  );
}

/** Wire a delete control to erase the session. onDelete asks the main process to
 *  remove the session's transcript, hints and audio from disk (SessionStore.delete). */
export function bindDelete(button: HTMLElement, sessionId: string, onDelete: (id: string) => void): void {
  button.addEventListener("click", () => onDelete(sessionId));
}
