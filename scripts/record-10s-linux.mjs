// Task 4.3 verify: record 10 s of both channels (system monitor + mic) to WAV
// using the real capture module, on a live desktop session (the sandbox has no
// audio). Build first, then run:
//
//   npm run build:main
//   node scripts/record-10s-linux.mjs
//
// Writes system.wav and mic.wav next to this script's output dir and prints the
// chosen devices, byte counts and a rough RMS level per channel so a silent
// channel is obvious without opening the files.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseSources, pickSource, recordPcm, wavHeader, STT_FORMAT } = require("../dist/main/capture/linux.js");

const SECONDS = 10;

function rmsS16(buf) {
  const n = Math.floor(buf.length / 2);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = buf.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

function record(source, seconds) {
  return new Promise((resolve, reject) => {
    const rec = recordPcm(source, STT_FORMAT);
    const chunks = [];
    rec.pcm.on("data", (c) => chunks.push(c));
    rec.proc.on("error", reject); // e.g. parecord not found
    rec.proc.stderr.on("data", (d) => process.stderr.write(d));
    const timer = setTimeout(() => rec.stop(), seconds * 1000);
    rec.proc.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
  });
}

const sources = parseSources(execFileSync("pactl", ["list", "sources", "short"], { encoding: "utf8" }));
const sys = pickSource(sources, "system");
const mic = pickSource(sources, "mic");
if (!sys || !mic) {
  console.error("Missing source - system:", sys?.name ?? "none", "mic:", mic?.name ?? "none");
  process.exit(1);
}
console.log(`system <- ${sys.name}`);
console.log(`mic    <- ${mic.name}`);
console.log(`recording ${SECONDS}s of each (play some audio now)...`);

for (const [label, src, file] of [
  ["system", sys.name, "system.wav"],
  ["mic", mic.name, "mic.wav"],
]) {
  const pcm = await record(src, SECONDS);
  writeFileSync(file, Buffer.concat([wavHeader(pcm.length, STT_FORMAT), pcm]));
  console.log(`${label}: ${pcm.length} bytes -> ${file}  RMS=${rmsS16(pcm).toFixed(4)}`);
}
console.log("done. RMS ~0 means that channel was silent.");
