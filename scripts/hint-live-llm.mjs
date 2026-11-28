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
const QUESTION = process.argv[2] ?? "Как бы вы спроектировали идемпотентность для платёжного API?";

const req = assembleRequest(CONTEXT, LANGUAGE, [], QUESTION);
console.log(`Q: ${QUESTION}\n`);

const adapter = claudeSubscriptionAdapter({ profileId: "live-test", spawn: realClaudeSpawn() });
const t0 = Date.now();
let ttft = null;
let out = "";

const session = adapter.start(req);
try {
  for await (const chunk of session.tokens) {
    if (ttft === null) {
      ttft = Date.now() - t0;
      console.log(`[TTFT ${ttft} ms]\n`);
    }
    out += chunk;
    process.stdout.write(chunk);
  }
  const total = Date.now() - t0;
  console.log(`\n\n[done in ${total} ms, ${out.length} chars]`);
  if (ttft === null) console.error("WARNING: no tokens received - is `claude` logged in?");
} catch (err) {
  console.error(`\nFAILED (${err?.name ?? "Error"}): ${err?.message ?? err}`);
  process.exitCode = 1;
} finally {
  adapter.dispose();
}
