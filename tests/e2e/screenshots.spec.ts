import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Captures reference screenshots of the public pages at the design breakpoints
 * (docs/DESIGN.md §3) into docs/screenshots. Opt-in: set SCREENSHOTS=1. The images are
 * committed as Phase 3 evidence; authenticated pages are added once test accounts exist.
 */
const ENABLED = process.env.SCREENSHOTS === "1";
const OUTPUT_DIR = path.resolve("docs/screenshots");
const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 760 },
  { name: "tablet-768", width: 768, height: 900 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

test.describe("reference screenshots", () => {
  test.skip(!ENABLED, "set SCREENSHOTS=1 to capture");

  for (const viewport of VIEWPORTS) {
    test(`login page at ${viewport.name}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "desktop chromium only");
      mkdirSync(OUTPUT_DIR, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/login?error=expired_link");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      // No horizontal page scroll at any breakpoint (docs/DESIGN.md §3).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `login-${viewport.name}.png`),
        fullPage: true,
      });
    });
  }
});
