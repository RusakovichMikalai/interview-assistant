// Live end-to-end test of the sticky fallback (spec 6.9-6.13) with REAL adapters:
// primary = your Claude subscription (warm `claude -p`, no API key), fallback =
// DeepSeek (openai-compatible). Builds the Router directly so the demo can force
// the bench deterministically.
//
// Flow it proves:
//   turn 1 -> Claude answers (real), then the Router BENCHES Claude for the session
//   turn 2 -> Router auto-switches to DeepSeek (benched Claude sinks to the back)
//
// Prereqs: `claude` CLI logged in (Pro/Max) + a DeepSeek key in the environment.
//
//   npm run build:main
//   DEEPSEEK_API_KEY="$(node -e 'process.stdout.write(require(require("os").homedir()+"/.local/share/opencode/auth.json").deepseek.key)')" node scripts/sticky-fallback-live.mjs
//
// STICKY_SLOW_MS controls the slow threshold. Default 0: ANY Claude answer benches
// it, so the switch is deterministic in one run. Set it to 5000 to watch the REAL
// rule (bench only on a >5 s first token or a near-limit warning) - then turn 2
// stays on Claude when it is healthy, which is the correct behavior, not a bug.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { assembleRequest } = require("../dist/main/hints/prompt.js");
const { profileFromPreset, adapterFromProfile } = require("../dist/main/llm/presets.js");
const { realClaudeSpawn } = require("../dist/main/llm/adapters/claude-subscription.js");
const { Router } = require("../dist/main/llm/router.js");
const { realTimers } = require("../dist/main/llm/timers.js");

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("Set DEEPSEEK_API_KEY in the environment first (see the header).");
  process.exit(2);
}
const slowMs = Number(process.env.STICKY_SLOW_MS ?? "0");

const LANGUAGE = "ru";
const CONTEXT = {
  cv: "Backend developer, 5 years. Node.js, PostgreSQL, Redis, Docker. Led a payments service at 2k RPS.",
  vacancy: "Senior Backend Engineer. High-load services, databases, system design. Node.js or Go.",
  notes: "Candidate is strong on data stores, weaker on distributed consensus.",
};
const Q1 = process.argv[2] ?? "Как бы вы спроектировали идемпотентность для платёжного API?";
const Q2 = process.argv[3] ?? "Как бы вы выбрали между оптимистичной и пессимистичной блокировкой?";

// Primary: Claude subscription. Fallback: DeepSeek. Same chain for fast + deep.
const subAdapter = adapterFromProfile(
  { id: "claude-sub", name: "Claude", adapter: "claude-subscription", role: "fast" },
  { spawn: realClaudeSpawn() },
);
const fbAdapter = adapterFromProfile(profileFromPreset({ presetId: "deepseek", role: "fast" }), { apiKey });

const router = new Router({
  fast: [subAdapter, fbAdapter],
  deep: [subAdapter, fbAdapter],
  timers: realTimers,
  stickyFallback: true,
  slowThresholdMs: slowMs,
  abortThresholdMs: 10_000,
});

console.log(`sticky fallback: primary=claude-sub fallback=${fbAdapter.profileId} slowThresholdMs=${slowMs}`);
console.log(`chain order: ${router.chainProfileIds("fast").join(" -> ")}\n`);

async function turn(n, question) {
  console.log(`\n=== turn ${n} ===\nQ: ${question}\n`);
  const t0 = Date.now();
  let ttft = null;
  const res = await router.run(assembleRequest(CONTEXT, LANGUAGE, [], question));
  console.log(`[source: ${res.source}]`);
  try {
    for await (const chunk of res.stream) {
      if (ttft === null) { ttft = Date.now() - t0; console.log(`[TTFT ${ttft} ms]\n`); }
      process.stdout.write(chunk);
    }
    console.log(`\n\n[turn ${n}: source=${res.source}, done in ${Date.now() - t0} ms]`);
    console.log(`[chain order now: ${router.chainProfileIds("fast").join(" -> ")}]`);
    return res.source;
  } catch (err) {
    console.error(`\nturn ${n} FAILED (${err?.name ?? "Error"}): ${err?.message ?? err}`);
    process.exitCode = 1;
    return null;
  }
}

try {
  const s1 = await turn(1, Q1);
  const s2 = await turn(2, Q2);
  console.log(`\n=== summary ===\nturn1 source ${s1} | turn2 source ${s2}`);
  if (slowMs === 0) {
    console.log(s1 === "claude-sub" && s2 === fbAdapter.profileId
      ? "sticky OK: turn 1 used Claude, then benched it; turn 2 switched to the fallback"
      : "unexpected: with STICKY_SLOW_MS=0 turn 1 should be Claude and turn 2 the fallback");
  }
} finally {
  if (typeof subAdapter.dispose === "function") subAdapter.dispose();
}
