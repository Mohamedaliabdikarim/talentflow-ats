import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the standalone build (`pnpm build && pnpm start`) or any
 * URL given in PLAYWRIGHT_BASE_URL (for example the Azure deployment).
 *
 * The smoke suite needs no Supabase project: placeholder public values let the proxy run
 * its cookie-only checks. Authenticated scenarios (Phase 3+) need a hosted project and
 * the E2E_* credentials documented in docs/TEST_PLAN.md.
 */
// 127.0.0.1 rather than localhost: Node may resolve localhost to ::1 first, which the
// standalone server (bound to 127.0.0.1) does not listen on.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: "http://127.0.0.1:3000/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          PORT: "3000",
          HOSTNAME: "127.0.0.1",
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        },
      },
});
