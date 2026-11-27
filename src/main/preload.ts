import { contextBridge } from "electron";

// Minimal, safe bridge. The API surface grows as renderer features land.
contextBridge.exposeInMainWorld("app", {
  version: process.env.npm_package_version ?? "0.1.0",
});
