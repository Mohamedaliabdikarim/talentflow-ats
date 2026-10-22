import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { revealAll } from "./helpers/reveal";

/**
 * Captures reference screenshots at the design breakpoints (docs/DESIGN.md §3) into
 * docs/screenshots. Opt-in: set SCREENSHOTS=1. Public pages use the real routes; the
 * workspace and admin pages use the local preview (real components, synthetic data).
 */
const ENABLED = process.env.SCREENSHOTS === "1";
const OUTPUT_DIR = path.resolve("docs/screenshots");
const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 760 },
  { name: "tablet-768", width: 768, height: 900 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
const PAGES = [
  { slug: "landing", path: "/", heading: "Hire with clarity. Move talent forward." },
  { slug: "login", path: "/login?error=expired_link", heading: "Sign in" },
  { slug: "dashboard", path: "/preview/o/northwind", heading: "Northwind Hiring" },
  { slug: "jobs", path: "/preview/o/northwind/jobs", heading: "Jobs" },
  {
    slug: "job-detail",
    path: "/preview/o/northwind/jobs/00000000-0000-4000-8000-000000000001",
    heading: "Senior Backend Engineer",
  },
  { slug: "candidates", path: "/preview/o/northwind/candidates", heading: "Candidates" },
  {
    slug: "candidate-detail",
    path: "/preview/o/northwind/candidates/00000000-0000-4000-8000-000000000101",
    heading: "Ada Lindqvist",
  },
  { slug: "pipeline", path: "/preview/o/northwind/pipeline", heading: "Pipeline" },
  { slug: "admin-overview", path: "/preview/admin", heading: "Overview" },
];

test.describe("reference screenshots", () => {
  test.skip(!ENABLED, "set SCREENSHOTS=1 to capture");

  for (const target of PAGES) {
    for (const viewport of VIEWPORTS) {
      test(`${target.slug} at ${viewport.name}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "chromium", "desktop chromium only");
        mkdirSync(OUTPUT_DIR, { recursive: true });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(target.path);
        await expect(page.getByRole("heading", { name: target.heading }).first()).toBeVisible();
        // Bring every scroll-triggered reveal to its final state before the capture.
        await revealAll(page);
        await page.waitForTimeout(700);
        // No horizontal page scroll at any breakpoint (docs/DESIGN.md §3).
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        await page.screenshot({
          path: path.join(OUTPUT_DIR, `${target.slug}-${viewport.name}.png`),
          fullPage: true,
        });
      });
    }
  }
});
