/**
 * Mobile fidelity screenshots — the responsive pass for the Mercury polish.
 *
 * Same real backend + temp DB as the reload suite (see
 * playwright.mobile.config.ts). No assertions on pixel perfection — a
 * human reviews the shots against the Mercury reference. The only
 * assertions are that each page loads and no horizontal overflow exists
 * (document scrollWidth must not exceed the viewport width).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { BACKEND_URL, TEST_DATABASE_URL } from "./test-config";

const SHOTS = path.join(__dirname, "screenshots", "mobile");
const SEED_SCRIPT = path.join(__dirname, "seed-invoice.py");
const BACKEND_PYTHON = path.resolve(__dirname, "../../backend/.venv/bin/python");

const TEST_EMAIL = "mobile-test@elric.local";
const TEST_PASSWORD = "Mobile-Test-2026!";

let accessToken = "";
let refreshCookie = "";
let testUserId = "";
let seededInvoiceId = "";

function parseRefreshCookie(setCookie: string | undefined): string {
  if (!setCookie) return "";
  const m = /elric_refresh=([^;]+)/.exec(setCookie);
  return m ? m[1] : "";
}

async function freshLogin(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  if (!res.ok()) throw new Error(`test login failed (${res.status()})`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("test login returned no access token");
  accessToken = body.access_token;
  refreshCookie = parseRefreshCookie(res.headers()["set-cookie"]);
  if (!refreshCookie) throw new Error("test login set no elric_refresh cookie");
}

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: horizontal overflow ${overflow}px`).toBeLessThanOrEqual(0);
}

test.describe.serial("mobile fidelity", () => {
  test.beforeAll(async ({ request }) => {
    let res = await request.post(`${BACKEND_URL}/api/auth/register`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    if (res.status() === 409) {
      res = await request.post(`${BACKEND_URL}/api/auth/login`, {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
    }
    expect(res.status()).toBeLessThan(300);
    const body = (await res.json()) as { access_token?: string; user?: { id?: string } };
    accessToken = body.access_token!;
    testUserId = String(body.user?.id ?? "");
    refreshCookie = parseRefreshCookie(res.headers()["set-cookie"]);
    const done = await request.post(`${BACKEND_URL}/api/auth/complete-onboarding`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(done.status()).toBe(200);
    // One flagged invoice so the dashboard/inbox have real rows.
    const seedOut = execFileSync(BACKEND_PYTHON, [SEED_SCRIPT], {
      env: { ...process.env, TEST_DATABASE_URL, SEED_USER_ID: testUserId },
    })
      .toString()
      .trim();
    expect(seedOut).toMatch(/^[0-9a-f-]{36}$/);
    seededInvoiceId = seedOut;
  });

  test.beforeEach(async ({ page, request }) => {
    await freshLogin(request);
    await page.context().addCookies([
      {
        name: "elric_refresh",
        value: refreshCookie,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  });

  test("dashboard + drawer + inbox + exceptions + invoice detail (mobile)", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "mobile viewport only");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.waitForSelector('[data-testid="pending-total"]');
    await assertNoHorizontalOverflow(page, "dashboard");
    await page.screenshot({ path: path.join(SHOTS, "01-dashboard.png"), fullPage: true });

    // Drawer opens from the hamburger and shows the nav.
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await assertNoHorizontalOverflow(page, "drawer open");
    await page.screenshot({ path: path.join(SHOTS, "02-drawer-open.png") });
    // Tapping a nav item navigates and closes the drawer.
    await page.getByRole("link", { name: "Transactions" }).click();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    await assertNoHorizontalOverflow(page, "inbox");
    await page.screenshot({ path: path.join(SHOTS, "03-inbox.png"), fullPage: true });

    await page.goto("/exceptions");
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalOverflow(page, "exceptions");
    await page.screenshot({ path: path.join(SHOTS, "04-exceptions.png"), fullPage: true });

    await page.goto(`/invoices/${seededInvoiceId}`);
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalOverflow(page, "invoice detail");
    await page.screenshot({ path: path.join(SHOTS, "05-invoice-detail.png"), fullPage: true });
  });

  test("dashboard (tablet)", async ({ page }) => {
    test.skip(test.info().project.name !== "tablet", "tablet viewport only");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await assertNoHorizontalOverflow(page, "tablet dashboard");
    await page.screenshot({ path: path.join(SHOTS, "06-dashboard-tablet.png"), fullPage: true });
  });
});
