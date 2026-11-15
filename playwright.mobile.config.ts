import { defineConfig, devices } from "@playwright/test";
import * as path from "node:path";

/**
 * Mobile fidelity config — same real backend + temp DB as
 * playwright.reload.config.ts, different viewport projects. Run with:
 *
 *   npx playwright test -c playwright.mobile.config.ts
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "mobile-fidelity.spec.ts",
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
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
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
        GEMINI_API_KEY: "test-key-not-real",
        GEMINI_API_KEY_SECONDARY: "",
        JWT_SECRET: "test-secret-for-playwright-only-not-production",
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
