#!/usr/bin/env node
// Spike 1.4 (tasks.md): a warm `claude -p` stream-json child, tools disabled, no
// ANTHROPIC_API_KEY in env. Sends N serial requests over one warm process, records
// TTFT (write -> first assistant text) for each, and writes the raw stream-json so
// the exact limit-error / reset-time payload can be read off a real run. The
// subscription adapter's wire shapes stay provisional until this is captured.
//
// Run on a machine with `claude` logged in and network:
//   node spike-1.4.mjs             # live: warm requests, writes raw.jsonl + prints TTFTs
//   node spike-1.4.mjs --selftest  # offline: assert the parser, no network
//
// To capture a real limit payload, run it while the subscription is at/near its
// cap; the raw.jsonl then holds the result event verbatim for the report.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUESTS = Number(process.env.REQUESTS) || 5;
const MODEL = process.env.MODEL || ""; // "" = CLI default; e.g. "sonnet" or "claude-haiku-5-5"
const RAW = fileURLToPath(new URL("./raw.jsonl", import.meta.url)); // decode %XX for non-ASCII paths

// ~2k-token cached prefix: a block the CLI caches, so repeat turns are warm.
const PREFIX = ("You are an interview assistant. Context block for cache warming. ").repeat(120);
const QUESTION = "Reply with exactly one short sentence.";

/** First assistant text event in a decoded stream-json sequence, or -1. */
export function firstTextIndex(events) {
  return events.findIndex(
    (e) => e?.type === "assistant" && (e.message?.content ?? []).some((c) => c?.type === "text" && c.text),
  );
}

/** Events that look like a usage/rate limit, so the raw payload can be inspected. */
export function limitEvents(events) {
  return events.filter((e) => /\b(limit|rate.?limit|reset|usage cap|quota)\b/i.test(JSON.stringify(e)));
}

function userLine(text) {
  return JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } });
}

function selftest() {
  const sample = [
    { type: "system", subtype: "init" },
    { type: "assistant", message: { content: [{ type: "text", text: "Hi." }] } },
    { type: "result", subtype: "error", error: "Usage limit reached, resets at 2026-01-01T00:00:00Z" },
  ];
  const assert = (c, m) => {
    if (!c) throw new Error("selftest failed: " + m);
  };
  assert(firstTextIndex(sample) === 1, "firstTextIndex should point at the assistant text");
  assert(firstTextIndex(sample.slice(0, 1)) === -1, "no assistant text -> -1");
  assert(limitEvents(sample).length === 1, "limit event should be detected");
  assert(limitEvents([{ type: "assistant", message: { content: [] } }]).length === 0, "no false positive");
  console.log("selftest ok");
}

async function live() {
  writeFileSync(RAW, "");
  const child = spawn(
    "claude",
    [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--allowedTools", "Noop", // only a non-existent tool is allowed = tools off
      "--append-system-prompt", PREFIX,
      ...(MODEL ? ["--model", MODEL] : []),
    ],
    { env: withoutApiKey(process.env), stdio: ["pipe", "pipe", "inherit"] },
  );

  const rl = createInterface({ input: child.stdout });
  let t0 = 0;
  let got = false;
  const ttfts = [];
  let pending = null; // resolve for the current request's first-text

  rl.on("line", (line) => {
    appendFileSync(RAW, line + "\n");
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    if (!got && firstTextIndex([ev]) === 0) {
      got = true;
      const ttft = Date.now() - t0;
      ttfts.push(ttft);
      console.log(`request ${ttfts.length}: TTFT ${ttft} ms`);
      pending?.();
    }
    if (limitEvents([ev]).length) console.log("LIMIT payload captured in raw.jsonl:", line.slice(0, 200));
  });

  for (let i = 0; i < REQUESTS; i++) {
    got = false;
    t0 = Date.now();
    child.stdin.write(userLine(QUESTION) + "\n");
    await new Promise((res) => {
      pending = res;
      setTimeout(res, 30000); // give up on a request after 30 s
    });
  }
  child.kill();
  const sorted = ttfts.filter((x) => x > 0).sort((a, b) => a - b);
  const p = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN;
  console.log(`\nTTFT p50=${p(0.5)} ms p90=${p(0.9)} ms over ${sorted.length} warm requests`);
  console.log(`raw stream-json written to ${RAW}`);
}

function withoutApiKey(base) {
  const env = { ...base };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

if (process.argv.includes("--selftest")) selftest();
else live();
