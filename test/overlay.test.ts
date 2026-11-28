// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { bindDelete, renderBullets, renderHistory, renderTranscript, ROLE_LABEL } from "../src/renderer/overlay";

describe("hint overlay (7.4)", () => {
  it("renders the current hint as bullets and reflects streaming updates", () => {
    const ul = document.createElement("ul");
    renderBullets(ul, ["first point", "second"]);
    expect([...ul.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["first point", "second"]);

    // A later token chunk grows the list and extends the last (partial) bullet.
    renderBullets(ul, ["first point", "second one", "third"]);
    expect([...ul.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "first point",
      "second one",
      "third",
    ]);
  });

  it("labels each transcript turn with its role", () => {
    const el = document.createElement("div");
    renderTranscript(el, [
      { role: "interviewer", text: "Tell me about X" },
      { role: "candidate", text: "Sure" },
    ]);
    const rows = [...el.querySelectorAll(".turn")];
    expect(rows.map((r) => (r as HTMLElement).dataset.role)).toEqual(["interviewer", "candidate"]);
    expect(rows.map((r) => r.querySelector(".role")?.textContent)).toEqual([
      ROLE_LABEL.interviewer,
      ROLE_LABEL.candidate,
    ]);
    expect(rows.map((r) => r.querySelector(".text")?.textContent)).toEqual(["Tell me about X", "Sure"]);
  });

  it("renders earlier hints with their source and bullets", () => {
    const el = document.createElement("ul");
    renderHistory(el, [
      { ts: 1, source: "p1", bullets: ["a", "b"] },
      { ts: 2, source: "p2", bullets: ["c"] },
    ]);
    const items = [...el.querySelectorAll("li.hint")];
    expect(items.map((i) => (i as HTMLElement).dataset.source)).toEqual(["p1", "p2"]);
    expect([...items[0].querySelectorAll("li")].map((li) => li.textContent)).toEqual(["a", "b"]);
    expect([...items[1].querySelectorAll("li")].map((li) => li.textContent)).toEqual(["c"]);
  });

  it("asks to delete the session when the delete control is clicked", () => {
    const button = document.createElement("button");
    const onDelete = vi.fn();
    bindDelete(button, "sess-42", onDelete);
    button.click();
    expect(onDelete).toHaveBeenCalledWith("sess-42");
  });
});
