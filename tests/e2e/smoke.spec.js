// Placeholder smoke test. Expanded in later phases.
import { test, expect } from "@playwright/test";

test("page loads", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("h1")).toHaveText("Typing Form Coach");
});
