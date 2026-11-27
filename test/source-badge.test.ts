import { describe, expect, it } from "vitest";
import { sourceBadge } from "../src/renderer/source-badge";

describe("overlay source/health badge (6.7)", () => {
  it("shows SUB when the subscription serves the hint", () => {
    expect(sourceBadge("claude-subscription", "OK")).toBe("SUB");
    // Health never downgrades SUB; a limited subscription has already failed over.
    expect(sourceBadge("claude-subscription", "SLOW")).toBe("SUB");
  });

  it("shows API for a healthy API source", () => {
    expect(sourceBadge("anthropic", "OK")).toBe("API");
    expect(sourceBadge("openai-compatible", "SLOW")).toBe("API");
  });

  it("shows API (limit) when an API source is rate-limited", () => {
    expect(sourceBadge("anthropic", "LIMITED")).toBe("API (limit)");
    expect(sourceBadge("openai-compatible", "LIMITED")).toBe("API (limit)");
  });
});
