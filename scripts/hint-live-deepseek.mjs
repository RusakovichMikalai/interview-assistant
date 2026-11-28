// Live LLM hint test against DeepSeek, through the SAME path the app uses:
// profileFromPreset("deepseek") -> adapterFromProfile (openai-compatible). So this
// also verifies the preset -> adapter wiring, not just the HTTP call. Key comes
// from the environment, never code or logs.
//
//   npm run build:main
//   DEEPSEEK_API_KEY=sk-... node scripts/hint-live-deepseek.mjs
//   DEEPSEEK_API_KEY=sk-... node scripts/hint-live-deepseek.mjs "your question"

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { assembleRequest } = require("../dist/main/hints/prompt.js");
const { profileFromPreset, adapterFromProfile } = require("../dist/main/llm/presets.js");

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("Set DEEPSEEK_API_KEY in the environment first.");
  process.exit(2);
}

const LANGUAGE = "ru";
const CONTEXT = {
  cv: "Backend developer, 5 years. Node.js, PostgreSQL, Redis, Docker. Led a payments service at 2k RPS.",
  vacancy: "Senior Backend Engineer. High-load services, databases, system design. Node.js or Go.",
  notes: "Candidate is strong on data stores, weaker on distributed consensus.",
};
const QUESTION = process.argv[2] ?? "Как бы вы спроектировали идемпотентность для платёжного API?";

const profile = profileFromPreset({ presetId: "deepseek", role: "fast" });
console.log(`profile: adapter=${profile.adapter} model=${profile.model} baseUrl=${profile.baseUrl}`);
console.log(`Q: ${QUESTION}\n`);

const adapter = adapterFromProfile(profile, { apiKey });
const req = assembleRequest(CONTEXT, LANGUAGE, [], QUESTION);
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
  console.log(`\n\n[done in ${Date.now() - t0} ms, ${out.length} chars]`);
  if (ttft === null) console.error("WARNING: no tokens received.");
} catch (err) {
  console.error(`\nFAILED (${err?.name ?? "Error"}): ${err?.message ?? err}`);
  process.exitCode = 1;
} finally {
  session.abort();
}
