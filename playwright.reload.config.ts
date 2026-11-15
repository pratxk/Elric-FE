import { defineConfig, devices } from "@playwright/test";
import * as path from "node:path";

/**
 * Reload-flash / mock-removal suite config — SEPARATE from the default
 * playwright.config.ts (auth-ftue suite, stub API on :18001, `next start`
 * on :3000). This suite needs the REAL backend, so it runs its own
 * servers and is invoked explicitly:
 *
 *   npx playwright test -c playwright.reload.config.ts
 *
 * Real local backend on a TEMP SQLite DB (never the production Render
 * service): the backend runs from ../backend on port 8001 with
 * DATABASE_URL pointed at /tmp/elric-playwright-test/elric-playwright.db.
 * The DB file is wiped by the backend's webServer command BEFORE uvicorn
 * starts (see below) — NOT by global-setup: Playwright starts webServers
 * before it runs globalSetup, so a wipe in global-setup would delete the
 * live DB ~17s after the backend created it and every write after that
 * would fail "attempt to write a readonly database" (proven with strace
 * 2026-11-15: globalSetup ran 17s after the backend's first journal
 * write and unlinked the live file). The frontend runs `next dev`
 * on port 3100 with API_URL pointed at that backend, so all data the
 * pages show comes from the real backend over the real proxy path.
 *
 * Auth (real): the backend enforces Bearer auth on every data endpoint
 * (v1.1 contract). The spec registers a real test user against the test
 * backend in beforeAll and plants its refresh cookie in the browser, so
 * AuthShell's silent refresh mints a real access token. No auth endpoint
 * is stubbed; the only route interception in this suite is the eval
 * summary delay/stub (see the eval test).
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "reload-flash.spec.ts",
  globalSetup: "./tests/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
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
      command:
        "rm -f /tmp/elric-playwright-test/elric-playwright.db /tmp/elric-playwright-test/elric-playwright.db-wal /tmp/elric-playwright-test/elric-playwright.db-shm /tmp/elric-playwright-test/elric-playwright.db-journal && mkdir -p /tmp/elric-playwright-test && ../backend/.venv/bin/python -m uvicorn app.main:app --port 8001 --host 127.0.0.1",
      cwd: path.resolve(__dirname, "../backend"),
      url: "http://127.0.0.1:8001/health",
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: "sqlite:////tmp/elric-playwright-test/elric-playwright.db",
        GEMINI_API_KEY: "",
        GEMINI_API_KEY_SECONDARY: "",
        LANGSMITH_API_KEY: "",
        // Test-only signing secret (the backend refuses to start without
        // one); never a production value. Auth endpoints are not
        // exercised here — the spec stubs the auth handshake.
        JWT_SECRET: "playwright-test-only-secret-not-for-production",
      },
    },
    {
      command: "npx next dev -p 3100 -H 127.0.0.1",
      url: "http://127.0.0.1:3100",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        API_URL: "http://127.0.0.1:8001",
      },
    },
  ],
});
