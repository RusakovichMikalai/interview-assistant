import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

// Real-window smoke test. Launches `electron .` (the built app) and checks the
// window actually opens and paints the renderer. Needs a display, so it runs
// only under `npm run test:e2e`, never in the default sandboxed `npm test`.

let app: ElectronApplication;
let page: Page;

beforeAll(async () => {
  app = await electron.launch({ args: ["."], cwd: resolve(__dirname, "..") });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

afterAll(async () => {
  await app?.close();
});

it("opens a window titled Interview Assistant", async () => {
  expect(await page.title()).toBe("Interview Assistant");
});

it("runs the renderer script and paints the status line", async () => {
  // "Ready. v..." is set by renderer.js; the static HTML says "Skeleton build.",
  // so requiring "Ready" proves the module actually executed.
  await expect.poll(() => page.locator("#status").textContent()).toMatch(/^Ready\./);
});

// Runs on Linux (xvfb), where content protection is unavailable, so the window
// must say so rather than claim it is hidden (task 8.1).
it("shows that hiding from capture is unsupported on Linux", async () => {
  await expect.poll(() => page.locator("#protection").textContent()).toMatch(/not supported/);
  expect(await page.locator("#protection").getAttribute("data-disabled")).toBe("true");
});

// Task 6.1: the provider-profile CRUD UI must paint in the real window - the
// preset dropdown (seven choices) and the "Add" control that renderer.js builds.
it("paints the provider-profile add row with the preset choices", async () => {
  await expect.poll(() => page.locator("#profiles-add select.preset option").count()).toBe(7);
  expect(await page.locator("#profiles-add button.add").textContent()).toBe("Add");
});

// Task 4.5: the pre-interview check must paint a level meter per channel and,
// before any capture, warn that both channels are silent, naming the device.
it("paints the audio-check meters and silent-channel warnings", async () => {
  await expect.poll(() => page.locator("#precheck-meters .meter").count()).toBe(2);
  expect(await page.locator("#precheck-warnings .warning").count()).toBe(2);
  expect(await page.locator("#precheck-warnings").textContent()).toMatch(/System audio is not captured/);
});

it("screenshots the launched window", async () => {
  const shot = resolve(__dirname, "screenshots", "launch.png");
  mkdirSync(dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
});

// Task 8.4: the capture self-check must report the window VISIBLE when protection
// is off (Linux is always off). Paint the marker across the window, grab the real
// screen through desktopCapturer in the main process, and confirm it leaked in.
it("capture self-check sees the window when protection is off", async () => {
  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "capture-marker";
    el.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgb(255,0,170)";
    document.body.appendChild(el);
  });
  await page.waitForTimeout(400); // let the compositor present the marker before the grab

  // app.evaluate runs in the main process with `electron` injected but no `require`,
  // so this mirrors capture-probe.ts / self-check.ts (CAPTURE_MARKER rgb(255,0,170),
  // BGRA->RGBA, tolerance 16, floor 0.005) rather than importing them. Those pure
  // parts are covered directly by test/self-check.test.ts.
  const result = await app.evaluate(async ({ desktopCapturer, screen }) => {
    const { width, height } = screen.getPrimaryDisplay().size;
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height } });
    if (sources.length === 0) return { visible: false, sources: 0, size: { width: 0, height: 0 }, fraction: 0 };
    const img = sources[0].thumbnail;
    const size = img.getSize();
    const bgra = img.toBitmap();
    const n = size.width * size.height;
    let hit = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const b = bgra[o];
      const g = bgra[o + 1];
      const r = bgra[o + 2];
      if (Math.abs(r - 255) <= 16 && Math.abs(g - 0) <= 16 && Math.abs(b - 170) <= 16) hit++;
    }
    const fraction = n ? hit / n : 0;
    return { visible: fraction >= 0.005, sources: sources.length, size, fraction };
  });

  expect(result.visible, JSON.stringify(result)).toBe(true);
});
