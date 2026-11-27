// Renderer skeleton. UI features (overlay, transcript, settings) land in later
// task groups.
declare global {
  interface Window {
    app?: { version: string };
  }
}

const status = document.getElementById("status");
if (status) status.textContent = `Ready. v${window.app?.version ?? "?"}`;

export {};
