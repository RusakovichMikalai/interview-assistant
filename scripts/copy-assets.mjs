import { cpSync, mkdirSync } from "node:fs";

// Copy renderer HTML next to the compiled renderer.js. Cross-platform (no `cp`).
mkdirSync("dist/renderer", { recursive: true });
cpSync("src/renderer/index.html", "dist/renderer/index.html");
console.log("copied renderer assets");
