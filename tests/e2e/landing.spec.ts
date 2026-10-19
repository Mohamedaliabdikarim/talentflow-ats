import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Public landing page at "/": content, CTAs, navigation, the inert product showcase, a11y. */

const HEADLINE = "Hire with clarity. Move talent forward.";

test("hero headline, honest copy and sign-in CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE })).toBeVisible();
  await expect(page.getByText("Accounts are created by invitation")).toBeVisible();
  const signIn = page
    .getByRole("main")
    .getByRole("link", { name: /^Sign in/ })
    .first();
  await expect(signIn).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "See the product" })).toHaveAttribute(
    "href",
    "#product",
  );
  await expect(page.getByText("In development").first()).toBeVisible();
});

test("navigation links reach every section and the app entry", async ({ page }) => {
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Open menu" });
  if (await menuButton.isVisible()) await menuButton.click();
  const nav = page.getByRole("navigation", { name: "Primary" }).first();
  for (const label of ["Product", "Jobs", "Candidates", "Collaboration", "AI insights"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Get started" }).first()).toHaveAttribute(
    "href",
    "/login",
  );
});

test("product showcase renders the real board but is inert", async ({ page }) => {
  await page.goto("/");
  const showcase = page.locator("[inert]").first();
  await expect(showcase).toContainText("Pipeline");
  await expect(showcase).toContainText("Ada Example");
  // Nothing inside the showcase can take focus.
  const focusable = await showcase.locator("a, button, input, select, textarea").count();
  expect(focusable).toBeGreaterThan(0);
  await page.keyboard.press("Tab");
  const activeInside = await page.evaluate(() =>
    Boolean(document.activeElement?.closest("[inert]")),
  );
  expect(activeInside).toBe(false);
});

test("the app entry point sends signed-out visitors to login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
});

test("no detectable accessibility violations on the landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Reveal every section and let entrance animations finish: axe samples computed colours,
  // and a half-faded button or paragraph would be reported as low contrast (seen in CI).
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]")).filter(
              (element) => Number(getComputedStyle(element).opacity) < 1,
            ).length,
        ),
      { timeout: 10_000 },
    )
    .toBe(0);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
