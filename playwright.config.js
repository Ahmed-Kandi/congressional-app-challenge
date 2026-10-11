// Playwright settings for the browser smoke test (npm run e2e).
import { defineConfig, devices } from "@playwright/test";

// A different port from `npm run serve` (8080) so a dev server can stay running.
const PORT = 8181;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    launchOptions: {
      // Chromium's fake camera: grants permission and supplies a test pattern.
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  webServer: {
    // --base proves the app also works under a GitHub Pages style subpath.
    command: `node scripts/serve.mjs --port ${PORT} --base /typing-form-coach/`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: false,
  },
});
