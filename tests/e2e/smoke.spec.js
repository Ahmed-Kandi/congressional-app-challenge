// Browser smoke test. Runs in Chromium with a fake camera (a test pattern, no hands),
// so nothing here depends on hand detection.
import { test, expect } from "@playwright/test";

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
