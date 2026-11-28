// Renderer skeleton. UI features (overlay, transcript, settings) land in later
// task groups.
import { bindProtectionToggle, contentProtectionState, renderProtection } from "./protection-badge.js";
import { renderAddRow, renderProfileList, type ProfileView } from "./profiles-ui.js";
import { renderMeters, renderWarnings, silentWarnings, type ChannelState } from "./precheck-ui.js";

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

// Pre-interview audio check (task 4.5). Before any capture both channels read
// silent, so the meters sit at zero and both warnings show until live levels
// arrive from the capture layer over IPC (integration, task group 11).
const meters = document.getElementById("precheck-meters");
const warnings = document.getElementById("precheck-warnings");
if (meters && warnings) {
  // shortcut: placeholder channels at level 0; replace with live RMS once capture
  // IPC is wired. Zero level is honest - nothing is being captured yet.
  const channels: ChannelState[] = [
    { kind: "system", device: "default", level: 0 },
    { kind: "mic", device: "default", level: 0 },
  ];
  renderMeters(meters, channels);
  renderWarnings(warnings, silentWarnings(channels));
}

// Provider-profile CRUD UI (task 6.1). The profile list and the add/edit/test/
// delete actions reach the main process over IPC when session wiring lands
// (integration, task group 11); here the controls paint and the callbacks are
// stubs, the same deferral as the protection toggle above.
const addRow = document.getElementById("profiles-add");
const list = document.getElementById("profiles-list");
if (addRow && list) {
  const profiles: ProfileView[] = [];
  const paint = () =>
    renderProfileList(list, profiles, { onEdit() {}, onTest() {}, onDelete() {} });
  renderAddRow(addRow, () => {
    // shortcut: no persistence yet; real add builds a profile via main's
    // profileFromPreset over IPC (task group 11). Keep the list in sync once wired.
  });
  paint();
}

export {};
