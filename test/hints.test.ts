import { describe, expect, it, vi } from "vitest";
import { assembleRequest, buildPrefix, systemPrompt } from "../src/main/hints/prompt";
import { HintState, HintTrigger, isNone, looksLikeQuestion, type TriggerMode } from "../src/main/hints/trigger";
import { SpeculativeStarter, type Cancelable } from "../src/main/hints/speculative";
import { LatencyLog } from "../src/main/hints/latency";
import { ManualTimers } from "../src/main/llm/timers";
import type { Turn } from "../src/shared/llm";

// --- 7.1 prompt assembly ---

describe("prompt assembly (7.1)", () => {
  it("includes the CV project in the cached prefix", () => {
    const prefix = buildPrefix({ cv: "Built a payments service called Orbit", vacancy: "Backend role" });
    expect(prefix).toContain("Orbit");
    expect(prefix).toContain("# Candidate CV");
    expect(prefix).toContain("# Vacancy");
  });

  it("omits the prefix when no context is loaded", () => {
    const req = assembleRequest({}, "en", [], "tell me about yourself");
    expect(req.prefix).toBeUndefined();
    expect(req.question).toBe("tell me about yourself");
  });

  it("keeps only the last N turns and sets language + NONE instruction", () => {
    const turns: Turn[] = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 ? "candidate" : "interviewer",
      text: `t${i}`,
    }));
    const req = assembleRequest({ cv: "x" }, "ru", turns, "q?", { lastN: 4 });
    expect(req.turns).toHaveLength(4);
    expect(req.turns[0].text).toBe("t11");
    expect(req.prefix).toContain("x");
    expect(systemPrompt("ru")).toMatch(/Russian/);
    expect(req.system).toMatch(/NONE/);
  });
});

// --- 7.2 trigger modes + NONE ---

describe("trigger modes (7.2)", () => {
  function setup(mode: TriggerMode) {
    const calls: { reason: string; q: string }[] = [];
    const t = new HintTrigger(mode, (reason, q) => calls.push({ reason, q }));
    return { t, calls };
  }

  it("hotkey mode: only the hotkey fires", () => {
    const { t, calls } = setup("hotkey");
    t.interviewerTurnFinished("What is a closure?");
    expect(calls).toHaveLength(0);
    t.hotkey("What is a closure?");
    expect(calls).toEqual([{ reason: "hotkey", q: "What is a closure?" }]);
  });

  it("every-turn mode: each finished turn fires", () => {
    const { t, calls } = setup("every-turn");
    t.interviewerTurnFinished("Let me introduce the team.");
    expect(calls).toHaveLength(1);
    expect(calls[0].reason).toBe("turn");
  });

  it("questions-only mode: only question-like turns fire", () => {
    const { t, calls } = setup("questions-only");
    t.interviewerTurnFinished("Let me introduce the team.");
    expect(calls).toHaveLength(0);
    t.interviewerTurnFinished("How would you scale this?");
    expect(calls).toHaveLength(1);
    t.hotkey("Let me introduce the team."); // hotkey still fires on a non-question
    expect(calls).toHaveLength(2);
  });

  it("detects questions in ru and en", () => {
    expect(looksLikeQuestion("Расскажи о себе")).toBe(true);
    expect(looksLikeQuestion("What is REST?")).toBe(true);
    expect(looksLikeQuestion("Договорились.")).toBe(false);
  });

  it("NONE result keeps the previous hint", () => {
    const s = new HintState();
    s.apply(["first hint"]);
    expect(isNone("NONE")).toBe(true);
    s.apply("NONE");
    expect(s.bullets).toEqual(["first hint"]);
    s.apply(["second hint"]);
    expect(s.bullets).toEqual(["second hint"]);
  });
});

// --- 7.3 speculative start ---

describe("speculative start (7.3)", () => {
  it("starts a request after 300 ms of silence", async () => {
    const timers = new ManualTimers();
    const onStart = vi.fn((): Cancelable => ({ cancel: vi.fn() }));
    const s = new SpeculativeStarter(timers, 300, onStart);
    s.onSilence();
    timers.advance(299);
    await Promise.resolve();
    expect(onStart).not.toHaveBeenCalled();
    timers.advance(1);
    await Promise.resolve();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending start when the interviewer resumes before 300 ms", async () => {
    const timers = new ManualTimers();
    const onStart = vi.fn((): Cancelable => ({ cancel: vi.fn() }));
    const s = new SpeculativeStarter(timers, 300, onStart);
    s.onSilence();
    timers.advance(200);
    s.onSpeech();
    timers.advance(200);
    await Promise.resolve();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("aborts the in-flight request and discards its partial when speech resumes", async () => {
    const timers = new ManualTimers();
    const cancel = vi.fn();
    const onStart = vi.fn((): Cancelable => ({ cancel }));
    const s = new SpeculativeStarter(timers, 300, onStart);
    s.onSilence();
    timers.advance(300);
    await Promise.resolve(); // let the timer .then run
    expect(onStart).toHaveBeenCalledTimes(1);
    s.onSpeech();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

// --- 7.5 latency metric ---

describe("latency metric (7.5)", () => {
  it("records end-of-speech to first-token per hint and computes p50", () => {
    const timers = new ManualTimers();
    const log = new LatencyLog(timers);

    log.speechEnded("h1");
    timers.advance(1200);
    expect(log.firstToken("h1")).toBe(1200);

    log.speechEnded("h2");
    timers.advance(1600);
    log.firstToken("h2");

    log.speechEnded("h3");
    timers.advance(800);
    log.firstToken("h3");

    expect(log.entries()).toHaveLength(3);
    expect(log.p50()).toBe(1200); // median of 800,1200,1600
  });

  it("returns undefined for an unknown id", () => {
    const log = new LatencyLog(new ManualTimers());
    expect(log.firstToken("nope")).toBeUndefined();
  });
});
