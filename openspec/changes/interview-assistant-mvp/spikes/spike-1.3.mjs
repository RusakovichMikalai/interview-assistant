#!/usr/bin/env node
// Spike 1.3 (tasks.md): time-to-first-token of each LLM preset with a ~2k-token
// cached prefix, p50/p90 over N serial requests. Mirrors the request shapes in
// src/main/llm/adapters/http.ts exactly (anthropic + openai-compatible) so the
// numbers reflect what the app will actually send. Keys come from env; a provider
// with no key is skipped. One short request, aborted at the first token.
//
//   ANTHROPIC_API_KEY=... DEEPSEEK_API_KEY=... GROQ_API_KEY=... CEREBRAS_API_KEY=... \
//     node spike-1.3.mjs            # live: measures each provider that has a key
//   node spike-1.3.mjs --selftest   # offline: assert the SSE token parsers
//
// Optional per-provider model override: CLAUDE_MODEL, DEEPSEEK_MODEL, GROQ_MODEL,
// CEREBRAS_MODEL, OPENROUTER_MODEL (+ OPENROUTER_API_KEY). REQUESTS overrides N.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUESTS = Number(process.env.REQUESTS) || 20;
const OUT = fileURLToPath(new URL("./results-1.3.json", import.meta.url));

// ~2k-token prefix (~8k chars): identical across requests so providers that cache
// implicitly (DeepSeek) or explicitly (Anthropic, see cache_control below) warm up.
const PREFIX = "You are an interview assistant. Reference context for cache warming. ".repeat(120);
const QUESTION = "Reply with exactly one short sentence.";

// Preset endpoints/models from src/main/llm/presets.ts (openai baseUrl + /chat/completions).
const PROVIDERS = [
  { id: "claude", kind: "anthropic", url: "https://api.anthropic.com/v1/messages", model: envModel("CLAUDE_MODEL", "claude-haiku-5-5"), keyEnv: "ANTHROPIC_API_KEY" },
  { id: "deepseek", kind: "openai", url: "https://api.deepseek.com/v1/chat/completions", model: envModel("DEEPSEEK_MODEL", "deepseek-chat"), keyEnv: "DEEPSEEK_API_KEY" },
  { id: "groq", kind: "openai", url: "https://api.groq.com/openai/v1/chat/completions", model: envModel("GROQ_MODEL", "llama-3.3-70b-versatile"), keyEnv: "GROQ_API_KEY" },
  { id: "cerebras", kind: "openai", url: "https://api.cerebras.ai/v1/chat/completions", model: envModel("CEREBRAS_MODEL", "llama-3.3-70b"), keyEnv: "CEREBRAS_API_KEY" },
  { id: "openrouter", kind: "openai", url: "https://openrouter.ai/api/v1/chat/completions", model: envModel("OPENROUTER_MODEL", ""), keyEnv: "OPENROUTER_API_KEY" },
];

function envModel(name, fallback) {
  return process.env[name] || fallback;
}

/** First token from one SSE `data:` payload, mirroring http.ts mapData. null = skip. */
export function firstToken(kind, payload) {
  const ev = JSON.parse(payload);
  if (kind === "anthropic") return ev.type === "content_block_delta" ? (ev.delta?.text ?? null) : null;
  return ev.choices?.[0]?.delta?.content ?? null;
}

function requestInit(p, key) {
  if (p.kind === "anthropic") {
    return {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: p.model,
        max_tokens: 1024,
        stream: true,
        // cache_control exercises Anthropic prompt caching for the prefix (spec 1.3).
        system: [{ type: "text", text: PREFIX, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: QUESTION }],
      }),
    };
  }
  return {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: p.model,
      stream: true,
      messages: [{ role: "system", content: PREFIX }, { role: "user", content: QUESTION }],
    }),
  };
}

/** One request: ms from send to first token, then abort. Throws on HTTP/parse error. */
async function measure(p, key) {
  const controller = new AbortController();
  const t0 = Date.now();
  const res = await fetch(p.url, { ...requestInit(p, key), signal: controller.signal });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    controller.abort();
    throw new Error(`HTTP ${res.status} ${detail.slice(0, 160)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error("stream ended before any token");
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trimEnd();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") throw new Error("stream ended before any token");
        const tok = firstToken(p.kind, payload);
        if (tok) return Date.now() - t0;
      }
    }
  } finally {
    controller.abort();
  }
}

const pct = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN);

async function live() {
  const active = PROVIDERS.filter((p) => process.env[p.keyEnv] && p.model);
  if (active.length === 0) {
    console.log("No provider keys found. Set e.g. ANTHROPIC_API_KEY / GROQ_API_KEY and retry.");
    console.log("(openrouter needs OPENROUTER_MODEL too.)");
    return;
  }
  const report = [];
  for (const p of active) {
    const key = process.env[p.keyEnv];
    const ttfts = [];
    const errors = [];
    process.stdout.write(`\n${p.id} (${p.model}): `);
    for (let i = 0; i < REQUESTS; i++) {
      try {
        const ms = await measure(p, key);
        ttfts.push(ms);
        process.stdout.write(`${ms} `);
      } catch (e) {
        errors.push(String(e.message));
        process.stdout.write("x ");
      }
    }
    const sorted = [...ttfts].sort((a, b) => a - b);
    const row = {
      id: p.id, model: p.model, n: REQUESTS, ok: ttfts.length,
      cold_ms: ttfts[0] ?? null,
      warm_p50_ms: pct(sorted.slice(1).sort((a, b) => a - b), 0.5),
      p50_ms: pct(sorted, 0.5), p90_ms: pct(sorted, 0.9),
      errors: [...new Set(errors)].slice(0, 3),
    };
    report.push(row);
    console.log(`\n  -> cold ${row.cold_ms}ms  p50 ${row.p50_ms}ms  p90 ${row.p90_ms}ms  (${row.ok}/${REQUESTS} ok)`);
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nSummary written to ${OUT}`);
  console.log("\nid         model                        cold   p50    p90   ok");
  for (const r of report) {
    console.log(`${r.id.padEnd(10)} ${String(r.model).padEnd(28)} ${pad(r.cold_ms)} ${pad(r.p50_ms)} ${pad(r.p90_ms)}  ${r.ok}/${r.n}`);
  }
}

const pad = (v) => String(v ?? "-").padStart(5);

function selftest() {
  const assert = (c, m) => { if (!c) throw new Error("selftest failed: " + m); };
  assert(firstToken("anthropic", JSON.stringify({ type: "content_block_delta", delta: { text: "Hi" } })) === "Hi", "anthropic delta");
  assert(firstToken("anthropic", JSON.stringify({ type: "message_start" })) === null, "anthropic non-delta -> null");
  assert(firstToken("openai", JSON.stringify({ choices: [{ delta: { content: "Hi" } }] })) === "Hi", "openai delta");
  assert(firstToken("openai", JSON.stringify({ choices: [{ delta: {} }] })) == null, "openai empty delta -> null");
  console.log("selftest ok");
}

if (process.argv.includes("--selftest")) selftest();
else live();
