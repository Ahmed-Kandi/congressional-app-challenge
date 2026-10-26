// Browser smoke test. Runs in Chromium with a fake camera (a test pattern, no hands),
// so nothing here depends on hand detection.
import { test, expect } from "@playwright/test";
import { buildRecording, serializeRecording } from "../../js/debug/recorder.js";
import { GRID_CORNERS } from "../../js/keyboardGrid.js";
import { generateSynthetic, syntheticCornerTouches } from "../synthetic.js";

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

test("landing page leads into camera setup", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/index.html");
  await expect(page.locator("#screen-landing")).toBeVisible();
  await expect(page.locator("#landing-title")).toContainText("hightype");
  await expect(page.locator("#screen-setup")).toBeHidden();
  await page.locator("#landing-nav-start").click();
  await expect(page.locator("#screen-dashboard")).toBeVisible();
  await page.locator("#dashboard-camera-start").click();
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
  // With no camera frames, the implemented check still stays neutral.
  await expect(page.locator("#attribution-badge")).toBeHidden();
  await expect(page.locator("#replay-badge")).toBeHidden();
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
  await expect(page.locator("#summary-finger-accuracy")).toHaveText("100%");
  // One motion trace per replayed key press.
  await expect(page.locator("#trace-select option")).toHaveCount(4);
  await expect(page.locator("#trace-select option").first()).toContainText('"a" (KeyA), expected left pinky');
  await expect(page.locator("#debug-replay-status")).toContainText("finished", { timeout: 5_000 });
  await expect(page.locator("#debug-source")).toHaveText("live", { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test("finishing a drill shows the summary, histogram, and history", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/index.html?skipSetup=1");
  const target = await page.locator("#target-text").textContent();
  await page.keyboard.type(target, { delay: 20 });

  await expect(page.locator("#screen-summary")).toBeVisible();
  await expect(page.locator("#summary-char-accuracy")).toHaveText("100%");
  await expect(page.locator("#summary-finger-accuracy")).toHaveText("not available");
  await expect(page.locator("#summary-wpm")).toHaveText(/^\d+ WPM$/);
  await expect(page.locator("#summary-headline")).toContainText("Finger check was not available");
  // 9 bars without a finger check: 8 fingers + one "either thumb" bar.
  await expect(page.locator("#summary-histogram .histogram-bar")).toHaveCount(9);
  await expect(page.locator("#summary-histogram")).toHaveAttribute("aria-label", /left index \d+/);
  await expect(page.locator("#history-summary tr")).toHaveCount(2); // header + this session

  await page.locator("#summary-again").click();
  await expect(page.locator("#screen-exercise")).toBeVisible();
  await expect(page.locator("#target-text")).toHaveText(target);
  expect(errors).toEqual([]);
});

// UI test double: replaces the team's module IN THIS TEST ONLY with one that
// always gives the same fixed answer ("left index") and never looks at frames.
// It is not an attribution method; it only proves the right/wrong display,
// overlay path and finger statistics work once the team's function returns results.
const FIXED_ANSWER_MODULE = `
export const ATTRIBUTION_IMPLEMENTED = true;
export function attributeKeystroke() { return { finger: "L_INDEX", confidence: 0.9 }; }
`;

test("when the finger check returns results, feedback and finger stats appear", async ({ page }) => {
  const errors = watchConsole(page);
  await page.route("**/js/core/fingerAttribution.js*", (route) =>
    route.fulfill({ contentType: "text/javascript", body: FIXED_ANSWER_MODULE }),
  );
  await page.goto("/index.html?skipSetup=1");
  await expect(page.locator("#attribution-badge")).toBeHidden();

  // Level 1, exercise 1 starts "fff jjj". F expects left index; J expects right index.
  await page.keyboard.type("f", { delay: 0 });
  await expect(page.locator("#feedback-text")).toHaveText("Correct finger: left index.");
  await expect(page.locator("#feedback-text")).toHaveAttribute("data-status", "correct");
  await page.keyboard.type("ff j", { delay: 30 });
  await expect(page.locator("#feedback-text")).toHaveText("Wrong hand: used left index, should be right index.");
  await expect(page.locator("#feedback-text")).toHaveAttribute("data-status", "wrong");

  const target = await page.locator("#target-text").textContent();
  await page.keyboard.type(target.slice(5), { delay: 15 });
  await expect(page.locator("#screen-summary")).toBeVisible();
  await expect(page.locator("#summary-headline")).toHaveText("You used 1 finger for 90 percent of your keystrokes.");
  await expect(page.locator("#summary-finger-accuracy")).not.toHaveText("not available");
  await expect(page.locator("#summary-histogram .histogram-bar")).toHaveCount(10);
  await expect(page.locator("#summary-substitutions tr")).not.toHaveCount(0);
  await expect(page.locator("#summary-substitutions")).toContainText("right index");
  expect(errors).toEqual([]);
});

// The only hosts the app may contact: itself, the MediaPipe library CDN, and the model file.
const ALLOWED_HOSTS = new Set(["localhost", "cdn.jsdelivr.net", "storage.googleapis.com"]);

test("works under a GitHub Pages style subpath and only talks to allowed hosts", async ({ page }) => {
  const errors = watchConsole(page);
  const failed = [];
  const hosts = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http")) hosts.add(url.hostname);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });

  // Landing, dashboard, and setup screens under /typing-form-coach/.
  await page.goto("/typing-form-coach/");
  await expect(page.locator("#screen-landing")).toBeVisible();
  await page.locator("#landing-nav-start").click();
  await expect(page.locator("#screen-dashboard")).toBeVisible();
  await page.locator("#dashboard-camera-start").click();
  await expect(page.locator("#screen-setup")).toBeVisible();
  await expect(page.locator("#setup-status")).toHaveText(/Tracking hands|unavailable/, { timeout: 30_000 });

  // Exercise under the subpath too.
  await page.goto("/typing-form-coach/index.html?skipSetup=1");
  await page.keyboard.type("fff", { delay: 30 });
  await expect(page.locator("#target-text .char-correct")).toHaveCount(3);

  expect(failed).toEqual([]);
  expect([...hosts].filter((host) => !ALLOWED_HOSTS.has(host))).toEqual([]);
  expect(errors).toEqual([]);
});

test("camera list refreshes on demand and when devices change", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/index.html");
  await page.locator("#landing-nav-start").click();
  await expect(page.locator("#screen-dashboard")).toBeVisible();
  await page.locator("#dashboard-camera-start").click();
  await expect(page.locator("#camera-picker")).toBeEnabled();
  const before = await page.locator("#camera-picker option").count();

  await page.locator("#camera-refresh").click();
  await expect(page.locator("#camera-picker option")).toHaveCount(before);

  // Simulate a camera being plugged in: the picker must re-read the list.
  await page.evaluate(() => {
    window.__enumerateCalls = 0;
    const original = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = () => {
      window.__enumerateCalls += 1;
      return original();
    };
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await expect.poll(() => page.evaluate(() => window.__enumerateCalls)).toBeGreaterThan(0);
  await expect(page.locator("#camera-picker")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("labeled data collection opens from Debug and returns to the dashboard", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/index.html?skipSetup=1");
  await page.locator("#debug-toggle").click();
  await page.locator("#debug-collect").click();
  await expect(page.locator("#screen-collect")).toBeVisible();
  await expect(page.locator("#collect-intro")).toBeVisible();
  await expect(page.locator("#collect-calibration-note")).not.toBeEmpty();
  await page.locator("#collect-back").click();
  await expect(page.locator("#screen-dashboard")).toBeVisible();
  expect(errors).toEqual([]);
});

test("keyboard map can be placed by dragging the discs onto the camera picture", async ({ page }) => {
  const errors = watchConsole(page);
  const { frames } = generateSynthetic({ fps: 30, durationMs: 4000, startTime: 0, seed: 7 });
  const recording = buildRecording({
    frames,
    keyEvents: [{ code: "Space", key: "Space", t: 300 }],
    meta: { note: "e2e manual keyboard map" },
  });

  await page.goto("/index.html?skipSetup=1");
  await page.locator("#exercise-quit").click();
  await page.locator("#choose-recalibrate").click();
  await page.locator("#debug-toggle").click();
  await page.locator("#debug-load").setInputFiles({
    name: "home-row.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeRecording(recording)),
  });
  await expect(page.locator("#calibrate-grid-step")).toBeVisible({ timeout: 6_000 });
  await expect(page.locator("#debug-replay-status")).toContainText("(finished)", { timeout: 6_000 });
  await page.locator("#debug-toggle").click();

  await page.evaluate(async () => {
    const video = document.querySelector("#camera-video");
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
    await video.play();
    document.querySelector("#stage").classList.add("has-video");
  });
  await page.locator("#stage").scrollIntoViewIfNeeded();
  const image = await page.evaluate(() => {
    const stage = document.querySelector("#stage").getBoundingClientRect();
    const video = document.querySelector("#camera-video");
    const scale = Math.min(stage.width / video.videoWidth, stage.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    return { left: stage.left + (stage.width - width) / 2, top: stage.top + (stage.height - height) / 2, width, height };
  });
  const touches = syntheticCornerTouches();
  for (const { code } of GRID_CORNERS) {
    const point = touches[code];
    const disc = page.locator(`#grid-disc-tray [data-grid-code="${code}"]`);
    const box = await disc.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(image.left + point.x * image.width, image.top + point.y * image.height, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.locator("#grid-steps li.done")).toHaveCount(4);
  await expect(page.locator("#grid-review-buttons")).toBeVisible();
  await expect(page.locator("#grid-status")).toContainText("Keyboard map ready");
  await page.locator("#grid-continue").click();
  await expect(page.locator("#screen-dashboard")).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("typingFormCoach.calibration") ?? "null"));
  expect(saved?.keyboardGrid?.homography).toHaveLength(9);
  expect(errors).toEqual([]);
});
