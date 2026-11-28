import { app, BrowserWindow, globalShortcut, utilityProcess, type UtilityProcess } from "electron";
import * as path from "node:path";
import { SettingsStore } from "./settings-store";
import { applyContentProtection } from "./invisibility/protection";
import { applyWindowFlags } from "./invisibility/window-flags";
import { DEFAULT_BINDINGS, registerHotkeys, type HotkeyAction } from "./invisibility/hotkeys";

// Entry for the Electron main process. Owns the hint window, the settings store
// and the STT utility process. This is skeleton wiring; features land in later
// tasks.

let sttProc: UtilityProcess | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 560,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  return win;
}

// Focus-free global hotkeys (task 8.3). toggle-hide and toggle-click-through act
// on the window here and drive the low-visibility flags (task 8.2); the hint and
// chain/scroll actions route to the hint pipeline, assembled in integration
// (group 11), so they are stubbed until then.
function registerSessionHotkeys(win: BrowserWindow): void {
  const vis = { hidden: false, clickThrough: false };
  const reapply = (): void => {
    applyContentProtection(win, process.platform, vis.hidden);
    applyWindowFlags(win, vis.hidden, { clickThrough: vis.clickThrough });
  };
  reapply();

  // shortcut: pipeline-bound actions no-op until group 11 wires the hint pipeline.
  const pipeline = (action: HotkeyAction) => () => win.webContents.send("session-action", action);

  const failed = registerHotkeys(globalShortcut, DEFAULT_BINDINGS, {
    hint: pipeline("hint"),
    "chain-fast": pipeline("chain-fast"),
    "chain-deep": pipeline("chain-deep"),
    "scroll-up": pipeline("scroll-up"),
    "scroll-down": pipeline("scroll-down"),
    "toggle-hide": () => {
      vis.hidden = !vis.hidden;
      reapply();
    },
    "toggle-click-through": () => {
      vis.clickThrough = !vis.clickThrough;
      reapply();
    },
  });
  if (failed.length) console.warn(`hotkeys refused by OS (conflict): ${failed.join(", ")}`);
}

function startSttProcess(): void {
  // Separate OS process keeps heavy STT work off the UI thread (see design D3).
  sttProc = utilityProcess.fork(path.join(__dirname, "..", "utility", "stt-process.js"));
}

app.whenReady().then(async () => {
  const store = new SettingsStore(path.join(app.getPath("userData"), "settings.json"));
  await store.load();

  startSttProcess();
  registerSessionHotkeys(createWindow());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) registerSessionHotkeys(createWindow());
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  sttProc?.kill();
  if (process.platform !== "darwin") app.quit();
});
