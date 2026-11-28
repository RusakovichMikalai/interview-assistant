// Renderer skeleton. UI features (overlay, transcript, settings) land in later
// task groups.
import { bindProtectionToggle, contentProtectionState, renderProtection } from "./protection-badge.js";

declare global {
  interface Window {
    app?: { version: string; platform?: string };
  }
}

const status = document.getElementById("status");
if (status) status.textContent = `Ready. v${window.app?.version ?? "?"}`;

const protection = document.getElementById("protection");
const toggle = document.getElementById("hideToggle") as HTMLButtonElement | null;
// Unknown platform -> treat as unsupported, so the UI never falsely claims hidden.
const platform = window.app?.platform ?? "";
if (protection) {
  renderProtection(protection, contentProtectionState(platform, false));
  if (toggle) {
    bindProtectionToggle(toggle, contentProtectionState(platform, false), (hidden) => {
      renderProtection(protection, contentProtectionState(platform, hidden));
      // shortcut: indicator only; the setContentProtection call reaches the main
      // process over IPC when session wiring lands (integration, task group 11).
    });
  }
}

export {};
