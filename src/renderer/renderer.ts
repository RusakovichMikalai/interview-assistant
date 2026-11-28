// Renderer skeleton. UI features (overlay, transcript, settings) land in later
// task groups.
import { bindProtectionToggle, contentProtectionState, renderProtection } from "./protection-badge.js";
import { renderAddRow, renderProfileList, type ProfileView } from "./profiles-ui.js";

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
