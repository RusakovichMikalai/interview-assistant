// Live LLM hint test: assemble a real answer-hint request (CV + vacancy + system
// prompt, like the app does) and stream the answer from YOUR Claude subscription
// via the warm `claude -p` process. Exercises hints prompt assembly (7.1) + the
// claude-subscription adapter (6.3) end to end, with no API key and no STT.
//
// Prereqs: `claude` CLI installed and logged in (Pro/Max). Build first:
//
//   npm run build:main
//   node scripts/hint-live-llm.mjs
//   node scripts/hint-live-llm.mjs "your own interview question here"
//
// Prints TTFT (time to first token) and the streamed hint. This bills your
// subscription, not the API (the adapter drops ANTHROPIC_API_KEY).
//
// Runs TWO turns on the SAME adapter to separate cold-start cost from the warm
// per-turn cost. `spawns` counts child processes: 1 means the warm process was
// reused for turn 2 (so only turn 1 pays init); 2 means the CLI exits after each
// `result` and every turn respawns (slow every time).

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { assembleRequest } = require("../dist/main/hints/prompt.js");
const { claudeSubscriptionAdapter, realClaudeSpawn } = require("../dist/main/llm/adapters/claude-subscription.js");

const LANGUAGE = "ru";
const CONTEXT = {
  cv: "Backend developer, 5 years. Node.js, PostgreSQL, Redis, Docker. Led a payments service at 2k RPS.",
  vacancy: "Senior Backend Engineer. High-load services, databases, system design. Node.js or Go.",
  notes: "Candidate is strong on data stores, weaker on distributed consensus.",
};
const Q1 = process.argv[2] ?? "Как бы вы спроектировали идемпотентность для платёжного API?";
const Q2 = process.argv[3] ?? "Как бы вы выбрали между оптимистичной и пессимистичной блокировкой?";

// Wrap the real spawn to count how many child processes get created.
const baseSpawn = realClaudeSpawn();
let spawns = 0;
const countingSpawn = () => { spawns += 1; return baseSpawn(); };
const adapter = claudeSubscriptionAdapter({ profileId: "live-test", spawn: countingSpawn });

async function turn(n, question) {
  console.log(`\n=== turn ${n} ===\nQ: ${question}\n`);
  const t0 = Date.now();
  let ttft = null;
  let out = "";
  const session = adapter.start(assembleRequest(CONTEXT, LANGUAGE, [], question));
  try {
    for await (const chunk of session.tokens) {
      if (ttft === null) { ttft = Date.now() - t0; console.log(`[TTFT ${ttft} ms]\n`); }
      out += chunk;
      process.stdout.write(chunk);
    }
    console.log(`\n\n[turn ${n}: done in ${Date.now() - t0} ms, ${out.length} chars, spawns so far ${spawns}]`);
    if (ttft === null) console.error("WARNING: no tokens received - is `claude` logged in?");
    return ttft;
  } catch (err) {
    console.error(`\nturn ${n} FAILED (${err?.name ?? "Error"}): ${err?.message ?? err}`);
    process.exitCode = 1;
    return null;
  }
}

try {
  const a = await turn(1, Q1);
  const b = await turn(2, Q2);
  console.log(`\n=== summary ===\nturn1 TTFT ${a} ms | turn2 TTFT ${b} ms | total spawns ${spawns}`);
  console.log(spawns === 1 ? "warm reuse OK: only turn 1 pays init" : "RESPAWN: CLI exits per turn, every turn pays init");
} finally {
  adapter.dispose();
}
