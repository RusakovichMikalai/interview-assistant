import { app, BrowserWindow, utilityProcess, type UtilityProcess } from "electron";
import * as path from "node:path";
import { SettingsStore } from "./settings-store";

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

function startSttProcess(): void {
  // Separate OS process keeps heavy STT work off the UI thread (see design D3).
  sttProc = utilityProcess.fork(path.join(__dirname, "..", "utility", "stt-process.js"));
}

app.whenReady().then(async () => {
  const store = new SettingsStore(path.join(app.getPath("userData"), "settings.json"));
  await store.load();

  startSttProcess();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  sttProc?.kill();
  if (process.platform !== "darwin") app.quit();
});
