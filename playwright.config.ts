import { defineConfig, devices } from "@playwright/test";

const STUB_PORT = 18001;

/**
 * Tests run against the production build served on :3000, proxied by
 * Next.js to the stub API on :18001 (API_URL). The stub access-token TTL
 * is 5s so expiry / silent-refresh is exercised on every test; refresh
 * handles it transparently. Never point this at the production backend.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "auth-ftue.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "node tests/stub-api.mjs",
      port: STUB_PORT,
      reuseExistingServer: !process.env.CI,
      env: {
        STUB_PORT: String(STUB_PORT),
        // Short access-token TTL so expiry -> auto-refresh is covered.
        STUB_ACCESS_TTL_SECONDS: "5",
        STUB_LOCKOUT_MS: String(15 * 60 * 1000),
      },
    },
    {
      command: "npx next start -p 3000",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: { API_URL: `http://localhost:${STUB_PORT}` },
    },
  ],
});
