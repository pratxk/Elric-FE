/**
 * Retry + vendor-registry tests for the Elric v1.1 fix round, against
 * the stub API only (tests/stub-api.mjs) — never the production Render
 * backend.
 *
 * Pins the two blockers the independent verification found:
 *  1. An extraction failure must surface its TRUE reason (the backend's
 *     extraction_error_kind), never a guessed "no Gemini key" — and the
 *     invoice detail page must offer a working Retry.
 *  2. A vendor created in onboarding step 4 must be visible on the
 *     Vendors page and in the dashboard's vendor-balances card even
 *     before its first invoice (registry list, not invoice balances).
 *
 * The stub seeds parked invoices via POST /api/_test/seed-parked-invoice
 * and simulates the retry's background re-run finishing as a flagged,
 * extracted invoice.
 */
import { test, expect, type Page } from "@playwright/test";

const STRONG_PW = "Str0ng!Password";
const STUB_URL = "http://localhost:18001";

let counter = 0;
function freshEmail(): string {
  counter += 1;
  return `retry${Date.now()}-${counter}@example.com`;
}

async function waitHydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

async function registerViaUI(page: Page, email: string) {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await waitHydrated(page);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(STRONG_PW);
  await page.getByLabel("Confirm password").fill(STRONG_PW);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

/** Complete onboarding via the skip path (no vendor created). */
async function onboardedUserSkip(page: Page): Promise<string> {
  const email = freshEmail();
  await registerViaUI(page, email);
  await page.getByRole("button", { name: /Set up your company/ }).click();
  await expect(page.getByRole("heading", { name: "Your company" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Finish setup")).toHaveCount(0);
  return email;
}

/** Complete the full FTUE walk through step 4 (first vendor) and a step-5
 * upload, landing on the new invoice's detail page. Returns the vendor
 * name created in step 4. */
async function onboardedWithVendor(page: Page, vendorName: string): Promise<void> {
  const email = freshEmail();
  await registerViaUI(page, email);
  await expect(page.getByRole("heading", { name: "Welcome to Elric" })).toBeVisible();
  await page.getByRole("button", { name: /Set up your company/ }).click();
  await expect(page.getByRole("heading", { name: "Your company" })).toBeVisible();
  await page.getByLabel("Company name").fill("Retry Test Corp Pvt Ltd");
  await page.getByLabel("State").fill("Karnataka");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: /Approval & matching rules/ })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Add your first vendor" })).toBeVisible();
  await page.getByLabel("Vendor name").fill(vendorName);
  await page.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
  await page.getByRole("button", { name: /Add vendor & continue/ }).click();
  await expect(page.getByRole("heading", { name: "Upload your first invoice" })).toBeVisible();
  await page.setInputFiles('input[type="file"]', {
    name: "invoice.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% test invoice\n"),
  });
  await expect(page).toHaveURL(/\/invoices\/inv-\d+$/, { timeout: 15000 });
}

/** The guided tour appears after onboarding; click it away (Next…Done). */
async function dismissTour(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Elric guided tour" });
  for (let i = 0; i < 6; i++) {
    if ((await dialog.count()) === 0) return;
    const done = page.getByRole("button", { name: "Done" });
    if ((await done.count()) > 0) {
      await done.click();
      return;
    }
    const next = page.getByRole("button", { name: "Next" });
    if ((await next.count()) > 0) {
      await next.click();
      continue;
    }
    return;
  }
}

/** Seed a parked invoice through the stub's test seam, with a Bearer
 * token from a direct login. Returns the seeded invoice id. */
async function seedParkedInvoice(page: Page, email: string, kind: string): Promise<string> {
  const login = await page.request.post(`${STUB_URL}/api/auth/login`, {
    data: { email, password: STRONG_PW },
  });
  expect(login.ok(), "stub login for seeding must succeed").toBe(true);
  const { access_token: token } = (await login.json()) as { access_token: string };
  const seed = await page.request.post(`${STUB_URL}/api/_test/seed-parked-invoice`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { kind },
  });
  expect(seed.status(), "seeding a parked invoice must succeed").toBe(201);
  const body = (await seed.json()) as { id: string };
  return body.id;
}

test.describe("retry extraction", () => {
  test("overloaded (503) invoice shows the true reason and Retry recovers it", async ({ page }) => {
    const email = await onboardedUserSkip(page);
    const id = await seedParkedInvoice(page, email, "overloaded");

    await page.goto(`/invoices/${id}`);
    await page.waitForLoadState("networkidle");

    // The TRUE reason — and never the false "no Gemini key" diagnosis.
    // (The reason sentence also appears in the doc-viewer and match
    // empty states, so match the banner title exactly / first match.)
    await expect(page.getByText("Extraction did not run", { exact: true })).toBeVisible();
    await expect(page.getByText(/Gemini was overloaded \(HTTP 503\)/).first()).toBeVisible();
    await expect(page.getByText(/no Gemini key/i)).toHaveCount(0);

    // Retry runs the (stubbed) background re-run; the page polls until
    // the invoice leaves "received", then shows the extracted content.
    await page.getByRole("button", { name: "Retry extraction" }).click();
    await expect(page.getByRole("button", { name: "Reprocessing…" })).toBeVisible();
    await expect(page.getByText("Seeded test line")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("No matching purchase order found.")).toBeVisible();
    await expect(page.getByText("Extraction did not run", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry extraction" })).toHaveCount(0);
    await expect(page.getByText(/no Gemini key/i)).toHaveCount(0);
  });

  test("no_key invoice is the ONLY case that may say no key configured", async ({ page }) => {
    const email = await onboardedUserSkip(page);
    const id = await seedParkedInvoice(page, email, "no_key");

    await page.goto(`/invoices/${id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Extraction did not run", { exact: true })).toBeVisible();
    await expect(page.getByText(/No Gemini API key is configured/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry extraction" })).toBeVisible();
  });
});

test.describe("vendor registry visibility", () => {
  test("FTUE vendor shows on the Vendors page and dashboard with zero balance", async ({ page }) => {
    // Hermetic start: earlier tests in this suite leave seeded invoices
    // (and their vendor summaries) in the shared stub — wipe them so
    // the row counts below are exact.
    await page.request.post(`${STUB_URL}/api/_test/reset`);
    await onboardedWithVendor(page, "FTUE Vendor");
    await dismissTour(page);

    // Vendors page: registered vendor listed even with no invoices.
    await page.goto("/vendors");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("FTUE Vendor")).toBeVisible();
    await expect(page.getByText("No vendors yet")).toHaveCount(0);
    await expect(page.getByText("1 vendor")).toBeVisible();

    // Dashboard vendor-balances card: same vendor, ₹0.00, no phantom rows.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("vendor-balances");
    await expect(card.getByText("FTUE Vendor")).toBeVisible();
    await expect(card.getByTestId("vendor-balance")).toHaveText("₹0.00");
  });
});
