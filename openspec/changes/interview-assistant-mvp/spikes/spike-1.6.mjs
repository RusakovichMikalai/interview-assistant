// Spike 1.6 - does Electron/Chromium list PipeWire monitor sources as audio
// inputs? Decides whether Linux needs a native capture addon (task 4.3) or the
// built-in getUserMedia path is enough. Run with Electron on a real desktop
// session (needs a display and the audio server); the sandbox has neither.
//
//   npx electron openspec/changes/interview-assistant-mvp/spikes/spike-1.6.mjs
//
// It opens an offscreen window, grants media permission, calls getUserMedia so
// device labels are revealed, enumerates audioinput devices and prints them.
// A "Monitor of <sink>" input is the system-output channel the interviewer
// speech comes from. Exit code 0 = at least one monitor input found.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { app, BrowserWindow } from "electron";

app.disableHardwareAcceleration(); // headless-friendly on a plain desktop

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  // Auto-grant mic so enumerateDevices returns real labels (blank without it).
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));

  // Load a real file:// page: it is a secure context, so navigator.mediaDevices
  // is defined (an opaque origin like about:blank leaves it undefined).
  await win.loadFile(join(dirname(fileURLToPath(import.meta.url)), "spike-1.6.html"));

  const devices = await win.webContents.executeJavaScript(`(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
    const list = await navigator.mediaDevices.enumerateDevices();
    return list
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({ label: d.label, deviceId: d.deviceId.slice(0, 12), groupId: d.groupId.slice(0, 8) }));
  })()`);

  if (devices && devices.error) {
    console.error("getUserMedia failed:", devices.error);
    console.error("No mic permission / no audio server reachable. Cannot decide.");
    app.exit(2);
    return;
  }

  const inputs = devices ?? [];
  // A PipeWire/Pulse monitor source surfaces as an input whose label contains
  // "Monitor of ..." (locale "Monitor"/"Monitor von" etc. - match case-insensitively).
  const monitors = inputs.filter((d) => /monitor/i.test(d.label));

  console.log(`audioinput devices: ${inputs.length}`);
  for (const d of inputs) console.log(`  ${d.label || "(no label)"}  [${d.deviceId}..]`);
  console.log(`\nmonitor (system-output) inputs: ${monitors.length}`);
  for (const d of monitors) console.log(`  ${d.label}`);

  console.log(
    monitors.length > 0
      ? "\nVERDICT: monitor source visible -> Linux can use getUserMedia, NO native addon needed for 4.3."
      : "\nVERDICT: no monitor source -> getUserMedia alone is not enough; a native PipeWire capture (addon) is needed for 4.3.",
  );

  app.exit(monitors.length > 0 ? 0 : 1);
});
