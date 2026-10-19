import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Exercises the authenticated-looking pages through the local preview (real view
 * components, synthetic data, no sign-in). The web server runs with TALENTFLOW_PREVIEW=1.
 * These are the only browser checks of jobs, candidates and the board until hosted
 * accounts exist.
 */
const BASE = "/preview/o/northwind";
const BACKEND_JOB = "Senior Backend Engineer";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("preview index lists the pages", async ({ page }) => {
  await page.goto("/preview");
  await expect(page.getByRole("heading", { name: "Local preview" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Kanban pipeline/ })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Local preview");
});

test("dashboard shows live counts and navigation", async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByRole("heading", { name: "Northwind Hiring" })).toBeVisible();
  await expect(page.getByText("Applications").first()).toBeVisible();
  // Below the md breakpoint the sidebar is hidden and navigation lives in a sheet.
  const menuButton = page.getByRole("button", { name: "Open navigation" });
  if (await menuButton.isVisible()) await menuButton.click();
  await expect(page.getByRole("navigation", { name: "Primary" }).first()).toContainText("Pipeline");
});

test("jobs table links to a job detail with its applications", async ({ page }) => {
  await page.goto(`${BASE}/jobs`);
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
  await page.getByRole("link", { name: BACKEND_JOB }).click();
  await expect(page.getByRole("heading", { name: BACKEND_JOB })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Ada Example");
});

test("candidate search filters by name and detail shows safe profile links", async ({ page }) => {
  await page.goto(`${BASE}/candidates?q=ada`);
  const table = page.getByRole("table");
  await expect(table).toContainText("Ada Example");
  await expect(table).not.toContainText("Bjørn Demo");
  await page.getByRole("link", { name: "Ada Example" }).click();
  await expect(page.getByRole("heading", { name: "Ada Example" })).toBeVisible();
  const linkedin = page.getByRole("link", { name: /Profile provided/ });
  await expect(linkedin).toHaveAttribute("rel", "noopener noreferrer");
  await expect(linkedin).toHaveAttribute("target", "_blank");
});

test("pipeline shows six stages, combines job and name filters, and persists a menu move", async ({
  page,
}, testInfo) => {
  // The in-memory store is shared by every browser project; only one project mutates it.
  test.skip(testInfo.project.name !== "chromium", "runs once against the shared preview store");
  await page.goto(`${BASE}/pipeline`);
  // Columns are the named list items; card <li> elements are list items too but unnamed.
  const columns = page.getByRole("listitem", {
    name: /^(New|Screening|Interview|Offer|Hired|Rejected)$/,
  });
  await expect(columns).toHaveCount(6);
  await expect(page.getByRole("listitem", { name: "Interview" })).toContainText("Ada Example");

  // Job filter through the real form.
  await page.getByRole("combobox", { name: "Job" }).click();
  await page.getByRole("option", { name: BACKEND_JOB }).click();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/pipeline\?job=/);
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(page.getByText(`Applications for ${BACKEND_JOB}`)).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Interview" })).not.toContainText("Chidi Sample");

  // Name filter combined with the job filter.
  await page.getByLabel("Candidate name").fill("ada");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/q=ada/);
  await expect(page.getByRole("listitem", { name: "Interview" })).toContainText("Ada Example");
  await expect(page.getByRole("listitem", { name: "Screening" })).not.toContainText("Bjørn Demo");

  // Move by the keyboard-accessible menu; the change is announced and survives a reload.
  await page.getByRole("button", { name: "Move Ada Example to another stage" }).click();
  await page.getByRole("menuitem", { name: "Offer" }).click();
  // Announced twice by design: the sr-only live region and the toast.
  await expect(page.getByText("Moved Ada Example to Offer").first()).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Offer" })).toContainText("Ada Example");
  await page.reload();
  await expect(page.getByRole("listitem", { name: "Offer" })).toContainText("Ada Example");

  // Reset restores the data set.
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.goto(`${BASE}/pipeline?job=${new URL(page.url()).searchParams.get("job")}&q=ada`);
  await expect(page.getByRole("listitem", { name: "Interview" })).toContainText("Ada Example");
});

test("empty filter result shows an explanatory empty state", async ({ page }) => {
  await page.goto(`${BASE}/pipeline?q=nobody-has-this-name`);
  await expect(page.getByText("No applications match these filters")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear filters" })).toBeVisible();
});

for (const path of [
  BASE,
  `${BASE}/jobs`,
  `${BASE}/candidates`,
  `${BASE}/pipeline`,
  "/preview/admin",
]) {
  test(`no detectable accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
}
