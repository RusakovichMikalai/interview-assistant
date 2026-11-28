import { contextBridge } from "electron";

// Minimal, safe bridge. The API surface grows as renderer features land.
// Runs in a sandboxed context, so it exposes primitives only (no local requires);
// the renderer derives views such as capture-protection state from these.
contextBridge.exposeInMainWorld("app", {
  version: process.env.npm_package_version ?? "0.1.0",
  platform: process.platform,
});
