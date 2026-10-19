import { expect, test } from "@playwright/test";

/**
 * Smoke suite: runs without a Supabase project. Covers the health probe, the public login
 * page, the proxy's unauthenticated redirects (spec §10 "unauthenticated access is denied")
 * and the invitation confirm route's handling of missing tokens.
 */

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

test("login page is reachable, labelled and keyboard focusable", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("protected routes redirect signed-out visitors to login with a return path", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  await page.goto("/o/acme/pipeline?job=1");
  await expect(page).toHaveURL(/\/login\?next=%2Fo%2Facme%2Fpipeline%3Fjob%3D1$/);
});

test("confirm route rejects a missing token with a generic message", async ({ page }) => {
  await page.goto("/auth/confirm");
  await expect(page).toHaveURL(/\/login\?error=invalid_link$/);
  // Filter: Next.js adds its own role="alert" route announcer to every page.
  await expect(page.getByRole("alert").filter({ hasText: "not valid" })).toBeVisible();
});

test("login page has no framework fingerprint header", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
