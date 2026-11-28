// Provider-profile CRUD UI and "Test" button (llm-routing spec, task 6.1). Pure
// DOM painters plus callback wiring, matching overlay.ts / protection-badge.ts.
// The preset list and profile shape mirror src/main/llm/presets.ts and
// src/shared/settings.ts; they are restated here because the renderer tsconfig
// keeps src/main and src/shared out of its rootDir. The actual add/edit/delete
// persistence and the real "Test" request run in the main process over IPC
// (wired in integration, task group 11); this layer only paints and reports.

export interface ProfileView {
  id: string;
  name: string;
  /** Provider type label, e.g. "anthropic" / "openai-compatible". */
  type: string;
  model: string;
}

/** User-facing preset choices for the "Add" dropdown (mirrors PRESETS ids/labels). */
export const PRESET_CHOICES: readonly { id: string; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "groq", label: "Groq" },
  { id: "cerebras", label: "Cerebras" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "ollama", label: "Ollama (local)" },
  { id: "custom", label: "Custom" },
];

export type TestResultView = { ok: true; ttftMs: number } | { ok: false; error: string };

export interface ProfileCallbacks {
  onEdit(id: string, patch: { name?: string; model?: string }): void;
  onTest(id: string): void;
  onDelete(id: string): void;
}

/** Paint the "Add from preset" row and wire it; onAdd gets the chosen preset id
 *  and the entered model (empty string when the user leaves it to the default). */
export function renderAddRow(
  el: HTMLElement,
  onAdd: (presetId: string, model: string) => void,
): void {
  const select = document.createElement("select");
  select.className = "preset";
  for (const c of PRESET_CHOICES) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    select.append(opt);
  }
  const model = document.createElement("input");
  model.className = "model";
  model.placeholder = "model (optional)";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "add";
  add.textContent = "Add";
  add.addEventListener("click", () => onAdd(select.value, model.value.trim()));
  el.replaceChildren(select, model, add);
}

/** Paint one row per profile, each with inline name/model edit, a Test button
 *  (with a result slot) and a Delete button. */
export function renderProfileList(el: HTMLElement, profiles: ProfileView[], cb: ProfileCallbacks): void {
  el.replaceChildren(
    ...profiles.map((p) => {
      const row = document.createElement("div");
      row.className = "profile";
      row.dataset.id = p.id;

      const name = document.createElement("input");
      name.className = "name";
      name.value = p.name;
      name.addEventListener("change", () => cb.onEdit(p.id, { name: name.value }));

      const type = document.createElement("span");
      type.className = "type";
      type.textContent = p.type;

      const model = document.createElement("input");
      model.className = "model";
      model.value = p.model;
      model.addEventListener("change", () => cb.onEdit(p.id, { model: model.value }));

      const test = document.createElement("button");
      test.type = "button";
      test.className = "test";
      test.textContent = "Test";
      test.addEventListener("click", () => cb.onTest(p.id));

      const result = document.createElement("span");
      result.className = "result";

      const del = document.createElement("button");
      del.type = "button";
      del.className = "delete";
      del.textContent = "Delete";
      del.addEventListener("click", () => cb.onDelete(p.id));

      row.append(name, type, model, test, result, del);
      return row;
    }),
  );
}

/** Show a profile's TTFT in ms, or the error text, in its row's result slot. */
export function renderTestResult(row: HTMLElement, result: TestResultView): void {
  const slot = row.querySelector<HTMLElement>(".result");
  if (!slot) return;
  slot.textContent = result.ok ? `${result.ttftMs} ms` : result.error;
  slot.dataset.ok = String(result.ok);
}
