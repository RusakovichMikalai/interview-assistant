// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  PRESET_CHOICES,
  renderAddRow,
  renderProfileList,
  renderTestResult,
  type ProfileView,
} from "../src/renderer/profiles-ui";

const profiles: ProfileView[] = [
  { id: "a", name: "Claude", type: "anthropic", model: "claude-haiku-5-5" },
  { id: "b", name: "Local", type: "openai-compatible", model: "llama3.1" },
];

describe("profile CRUD UI (6.1)", () => {
  it("offers the preset choices in the add dropdown and reports the chosen preset + model", () => {
    const el = document.createElement("div");
    const onAdd = vi.fn();
    renderAddRow(el, onAdd);
    expect([...el.querySelectorAll("option")].map((o) => (o as HTMLOptionElement).value)).toEqual(
      PRESET_CHOICES.map((c) => c.id),
    );
    (el.querySelector("select.preset") as HTMLSelectElement).value = "deepseek";
    (el.querySelector("input.model") as HTMLInputElement).value = "  deepseek-chat  ";
    (el.querySelector("button.add") as HTMLButtonElement).click();
    expect(onAdd).toHaveBeenCalledWith("deepseek", "deepseek-chat"); // trimmed
  });

  it("paints a row per profile with its name, type and model", () => {
    const el = document.createElement("div");
    renderProfileList(el, profiles, { onEdit() {}, onTest() {}, onDelete() {} });
    const rows = [...el.querySelectorAll(".profile")];
    expect(rows.map((r) => (r as HTMLElement).dataset.id)).toEqual(["a", "b"]);
    expect(rows.map((r) => (r.querySelector(".name") as HTMLInputElement).value)).toEqual(["Claude", "Local"]);
    expect(rows.map((r) => r.querySelector(".type")?.textContent)).toEqual(["anthropic", "openai-compatible"]);
    expect(rows.map((r) => (r.querySelector(".model") as HTMLInputElement).value)).toEqual([
      "claude-haiku-5-5",
      "llama3.1",
    ]);
  });

  it("reports an inline name or model edit for the right profile", () => {
    const el = document.createElement("div");
    const onEdit = vi.fn();
    renderProfileList(el, profiles, { onEdit, onTest() {}, onDelete() {} });
    const row = el.querySelector('.profile[data-id="b"]')!;
    const model = row.querySelector(".model") as HTMLInputElement;
    model.value = "qwen2.5";
    model.dispatchEvent(new Event("change"));
    expect(onEdit).toHaveBeenCalledWith("b", { model: "qwen2.5" });
    const name = row.querySelector(".name") as HTMLInputElement;
    name.value = "Ollama";
    name.dispatchEvent(new Event("change"));
    expect(onEdit).toHaveBeenCalledWith("b", { name: "Ollama" });
  });

  it("fires test and delete for the clicked profile", () => {
    const el = document.createElement("div");
    const onTest = vi.fn();
    const onDelete = vi.fn();
    renderProfileList(el, profiles, { onEdit() {}, onTest, onDelete });
    (el.querySelector('.profile[data-id="a"] .test') as HTMLButtonElement).click();
    expect(onTest).toHaveBeenCalledWith("a");
    (el.querySelector('.profile[data-id="a"] .delete') as HTMLButtonElement).click();
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("shows the TTFT in ms on success and the error text on failure", () => {
    const el = document.createElement("div");
    renderProfileList(el, profiles, { onEdit() {}, onTest() {}, onDelete() {} });
    const row = el.querySelector<HTMLElement>('.profile[data-id="a"]')!;
    renderTestResult(row, { ok: true, ttftMs: 420 });
    expect(row.querySelector(".result")?.textContent).toBe("420 ms");
    expect(row.querySelector<HTMLElement>(".result")!.dataset.ok).toBe("true");
    renderTestResult(row, { ok: false, error: "401 unauthorized" });
    expect(row.querySelector(".result")?.textContent).toBe("401 unauthorized");
    expect(row.querySelector<HTMLElement>(".result")!.dataset.ok).toBe("false");
  });
});
