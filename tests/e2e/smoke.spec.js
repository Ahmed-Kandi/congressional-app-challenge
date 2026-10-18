// Browser smoke test. Runs in Chromium with a fake camera (a test pattern, no hands),
// so nothing here depends on hand detection.
import { test, expect } from "@playwright/test";
import { buildRecording, serializeRecording } from "../../js/debug/recorder.js";
import { generateSynthetic } from "../synthetic.js";

// We fail on every console ERROR. Nothing is ignored at the moment, because in
// Chromium 156 the fake camera and MediaPipe only log at warning/info level.
// The warnings seen (and allowed, since they are not errors) are:
//   - "OpenGL error checking is disabled"                       (MediaPipe GPU setup)
//   - "GL Driver Message ... GPU stall due to ReadPixels"         (headless GPU warning)
//   - "Using NORM_RECT without IMAGE_DIMENSIONS ..."              (MediaPipe internal note)
// If a future Chromium turns one of these fake-device or GPU messages into an
// error, add a pattern for exactly that message here, with a comment.
const IGNORED_CONSOLE_PATTERNS = [];

function watchConsole(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) errors.push(text);
  });
  page.on("pageerror", (error) => errors.push(`Uncaught: ${error.message}`));
  return errors;
}

test("setup screen loads with camera picker and privacy line", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/index.html");
  await expect(page.locator("#privacy-line")).toBeVisible();
  await expect(page.locator("#privacy-line")).toContainText("Video stays on this device. Nothing is uploaded.");
  await expect(page.locator("#screen-setup")).toBeVisible();
  // The fake camera should show up in the picker once permission is granted.
  await expect(page.locator("#camera-picker option")).not.toHaveCount(0);
  await expect(page.locator("#camera-picker")).toBeEnabled();
  expect(await page.locator("#camera-picker option").count()).toBeGreaterThanOrEqual(1);
  // Give MediaPipe time to load so its errors (if any) are caught too.
  await expect(page.locator("#setup-status")).toHaveText(/Tracking hands|unavailable/, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test("debug panel toggles", async ({ page }) => {
  await page.goto("/index.html?skipSetup=1");
  const panel = page.locator("#debug-panel");
  await expect(panel).toBeHidden();
  await page.locator("#debug-toggle").click();
  await expect(panel).toBeVisible();
  await expect(page.locator("#debug-toggle")).toHaveAttribute("aria-expanded", "true");
  await page.locator("#debug-toggle").click();
  await expect(panel).toBeHidden();
});

test("typing the first 10 characters of a Level 1 drill updates the display", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/index.html?skipSetup=1");
  await expect(page.locator("#screen-exercise")).toBeVisible();
  const target = await page.locator("#target-text").textContent();
  expect(target.length).toBeGreaterThan(10);
  await expect(page.locator("#live-wpm")).toHaveText("0");

  await page.keyboard.type(target.slice(0, 10), { delay: 60 });

  await expect(page.locator("#target-text .char-correct")).toHaveCount(10);
  await expect(page.locator("#target-text .char-current")).toHaveCount(1);
  await expect(page.locator("#live-typed")).toHaveText(`10 / ${target.length}`);
  await expect(page.locator("#live-wpm")).not.toHaveText("0");
  await expect(page.locator("#live-accuracy")).toHaveText("100%");
  // The team's function is still the stub, so the badge shows and checks are neutral.
  await expect(page.locator("#attribution-badge")).toBeVisible();
  await expect(page.locator("#attribution-badge")).toHaveText("Finger check not built yet");
  await expect(page.locator("#feedback-text")).toHaveText("Finger check unavailable.");
  // The page must not have scrolled from the space bar.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(errors).toEqual([]);
});

test("replaying a recording drives the exercise and traces through the live code path", async ({ page }) => {
  const errors = watchConsole(page);
  // Four synthetic presses that type "fdsa" (no camera needed).
  const { frames, keyEvents } = generateSynthetic({
    fps: 30,
    durationMs: 2000,
    presses: [
      { finger: "L_INDEX", t: 1300 },
      { finger: "L_MIDDLE", t: 1700 },
      { finger: "L_RING", t: 2100 },
      { finger: "L_PINKY", t: 2500 },
    ],
  });
  const recording = buildRecording({ frames, keyEvents, meta: { note: "e2e synthetic" } });

  await page.goto("/index.html?skipSetup=1");
  await page.locator("#debug-toggle").click();
  await page.locator("#debug-load").setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeRecording(recording)),
  });

  // The replayed keys complete the rebuilt exercise text "fdsa", which opens the summary.
  await expect(page.locator("#screen-summary")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#summary-char-accuracy")).toHaveText("100%");
  await expect(page.locator("#summary-finger-accuracy")).toHaveText("not available");
  // One motion trace per replayed key press.
  await expect(page.locator("#trace-select option")).toHaveCount(4);
  await expect(page.locator("#trace-select option").first()).toContainText('"a" (KeyA), expected left pinky');
  await expect(page.locator("#debug-replay-status")).toContainText("finished", { timeout: 5_000 });
  await expect(page.locator("#debug-source")).toHaveText("live", { timeout: 5_000 });
  expect(errors).toEqual([]);
});
