import { expect, type Page } from "@playwright/test";

/**
 * Brings every scroll-triggered reveal on the landing page to its final state before axe or
 * a screenshot looks at it. Stepping through the page with window.scrollTo proved unreliable
 * on slow CI runners: the IntersectionObserver behind Motion's `whileInView` can miss an
 * element the scroll jumps past, and with `once: true` that element then stays invisible.
 * Scrolling each `[data-reveal]` element into view and waiting for its opacity is
 * deterministic.
 */
export async function revealAll(page: Page): Promise<void> {
  const reveals = page.locator("[data-reveal]");
  const count = await reveals.count();
  for (let index = 0; index < count; index += 1) {
    const element = reveals.nth(index);
    await element.scrollIntoViewIfNeeded();
    await expect
      .poll(() => element.evaluate((node) => Number(getComputedStyle(node).opacity)), {
        timeout: 5_000,
      })
      .toBe(1);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}
