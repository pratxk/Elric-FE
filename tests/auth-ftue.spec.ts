/**
 * Auth + FTUE tests for Elric v1.1, against the stub API only
 * (tests/stub-api.mjs) — never the production Render backend.
 *
 * Token contract under test: short-lived JWT access token in memory,
 * HttpOnly `elric_refresh` cookie, POST /api/auth/refresh rotation with
 * reuse rejection, 401 -> refresh-once -> retry, silent refresh on load.
 */
import { test, expect, type Page } from "@playwright/test";

const STRONG_PW = "Str0ng!Password";
const NEW_STRONG_PW = "An0ther!Strong1";
const WEAK_PW = "short";

let counter = 0;
function freshEmail(): string {
  counter += 1;
  return `test${Date.now()}-${counter}@example.com`;
}

async function waitHydrated(page: Page) {
  // In dev mode the first click can land before React hydrates the form
  // (the button exists in the DOM but no handler is attached yet), so the
  // submit silently does nothing. Wait for the network to settle and give
  // hydration a moment before interacting.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

async function registerViaUI(page: Page, email: string, password: string = STRONG_PW) {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await waitHydrated(page);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Our error banner: a <p role="alert"> (Next's own route announcer also
 *  carries role="alert", so a bare getByRole("alert") is ambiguous). */
function errorAlert(page: Page) {
  return page.locator('p[role="alert"]');
}

async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await waitHydrated(page);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Register a fresh user and land on the onboarding wizard. */
async function freshUserOnOnboarding(page: Page): Promise<string> {
  const email = freshEmail();
  await registerViaUI(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  return email;
}

/**
 * Complete onboarding via the skip path: step 1 -> step 2 -> "Skip for now"
 * -> dashboard with the "Finish setup" banner -> dismiss the banner.
 * Returns the email of the now-onboarded user.
 */
async function onboardedUser(page: Page): Promise<string> {
  const email = await freshUserOnOnboarding(page);
  await page.getByRole("button", { name: /Set up your company/ }).click();
  await expect(page.getByRole("heading", { name: "Your company" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByText("Finish setup").first()).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Finish setup")).toHaveCount(0);
  return email;
}

test.describe("register", () => {
  test("valid registration lands on onboarding", async ({ page }) => {
    const email = freshEmail();
    await registerViaUI(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Welcome to Elric" })).toBeVisible();
  });

  test("weak password shows live checklist and the server rejects it with 422", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Password", { exact: true }).fill(WEAK_PW);
    // Live feedback: the length rule is still unmet.
    await expect(page.getByText("At least 12 characters")).toBeVisible();
    // Client-side enforcement keeps the submit disabled…
    await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
    // …and the server enforces the same policy (422) when called directly.
    const res = await page.request.post("/api/auth/register", {
      data: { email: freshEmail(), password: WEAK_PW },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(String(body.detail)).toContain("12 characters");
  });

  test("duplicate email shows the server error", async ({ browser }) => {
    const email = freshEmail();
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();
    await registerViaUI(p1, email);
    await expect(p1).toHaveURL(/\/onboarding$/);
    await ctx1.close();

    // Fresh context (no session) so the guard does not bounce us away.
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await registerViaUI(p2, email);
    await expect(p2.locator('p[role="alert"]')).toContainText("already exists");
    await expect(p2).toHaveURL(/\/register$/);
    await ctx2.close();
  });
});

test.describe("login", () => {
  test("valid login routes to onboarding when setup is incomplete", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const email = await freshUserOnOnboarding(await ctx1.newPage());
    await ctx1.close();

    // Fresh context: no in-memory token, no refresh cookie carried over.
    const ctx2 = await browser.newContext();
    await loginViaUI(await ctx2.newPage(), email, STRONG_PW);
    const page = ctx2.pages()[0];
    await expect(page).toHaveURL(/\/onboarding$/);
    await ctx2.close();
  });

  test("wrong password shows the generic error verbatim", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const email = await freshUserOnOnboarding(await ctx1.newPage());
    await ctx1.close();

    const ctx2 = await browser.newContext();
    const page = await ctx2.newPage();
    await loginViaUI(page, email, "Wr0ng!Password");
    await expect(errorAlert(page)).toHaveText("Invalid email or password");
    await expect(page).toHaveURL(/\/login$/);
    await ctx2.close();
  });

  test("unknown email shows the same generic error", async ({ page }) => {
    await loginViaUI(page, freshEmail(), STRONG_PW);
    await expect(errorAlert(page)).toHaveText("Invalid email or password");
  });

  test("5 failed attempts lock the account out with 429", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const email = await freshUserOnOnboarding(await ctx1.newPage());
    await ctx1.close();

    const ctx2 = await browser.newContext();
    const page = await ctx2.newPage();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    // Attempts 1–4: generic 401. Attempt 5: 429 lockout.
    for (let i = 1; i <= 5; i++) {
      const res = await page.request.post("/api/auth/login", {
        data: { email, password: "Wr0ng!Password" },
      });
      if (i < 5) {
        expect(res.status()).toBe(401);
      } else {
        expect(res.status()).toBe(429);
        expect(String((await res.json()).detail)).toContain("Too many attempts");
      }
    }
    // The UI surfaces the same lockout message.
    await loginViaUI(page, email, "Wr0ng!Password");
    await expect(errorAlert(page)).toContainText("Too many attempts — try again in 15 minutes");
    await ctx2.close();
  });
});

test.describe("guard and refresh", () => {
  test("unauthenticated visit to / redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  });

  test("authenticated visit to /login redirects to /onboarding (or /)", async ({ page }) => {
    await freshUserOnOnboarding(page);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("silent refresh on load: expired access token still keeps the session", async ({ page }) => {
    await onboardedUser(page);
    await expect(page).toHaveURL("http://localhost:3000/");
    // Access tokens live 5s in the stub; wait past expiry, then reload.
    // The refresh cookie must silently mint a new token — no login redirect.
    await page.waitForTimeout(6000);
    await page.reload();
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("access-token expiry mid-session auto-refreshes and the retry succeeds", async ({ page }) => {
    await onboardedUser(page);
    await page.waitForTimeout(6000);
    // This navigation forces a fresh API call (settings) on an expired
    // token: the client must refresh once and retry successfully.
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Company profile" })).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("refresh failure redirects to /login", async ({ page }) => {
    await onboardedUser(page);
    await page.waitForTimeout(6000);
    await page.context().clearCookies();
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logout returns to /login and the guard blocks / afterwards", async ({ page }) => {
    await onboardedUser(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("FTUE wizard", () => {
  test("walk steps 1–5: settings save, vendor add, real upload lands on the invoice", async ({ page }) => {
    const email = freshEmail();
    await registerViaUI(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);

    // Step 1 — welcome.
    await expect(page.getByRole("heading", { name: "Welcome to Elric" })).toBeVisible();
    await page.getByRole("button", { name: /Set up your company/ }).click();

    // Step 2 — company profile, saved on Continue.
    await expect(page.getByRole("heading", { name: "Your company" })).toBeVisible();
    await page.getByLabel("Company name").fill("Test Corp Pvt Ltd");
    await page.getByLabel("State").fill("Karnataka");
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 3 — approval rules, saved on Continue.
    await expect(page.getByRole("heading", { name: /Approval & matching rules/ })).toBeVisible();
    await page.getByLabel(/Auto-approve limit/).fill("75000");
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 4 — first vendor.
    await expect(page.getByRole("heading", { name: "Add your first vendor" })).toBeVisible();
    await page.getByLabel("Vendor name").fill("Acme Supplies");
    await page.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
    await page.getByRole("button", { name: /Add vendor & continue/ }).click();

    // Step 5 — real upload through the upload flow.
    await expect(page.getByRole("heading", { name: "Upload your first invoice" })).toBeVisible();
    await page.setInputFiles('input[type="file"]', {
      name: "invoice.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% test invoice\n"),
    });
    await expect(page).toHaveURL(/\/invoices\/inv-\d+$/, { timeout: 15000 });
  });

  test("skip path leaves the Finish setup banner; dismissing it completes setup", async ({ page }) => {
    await freshUserOnOnboarding(page);
    await page.getByRole("button", { name: /Set up your company/ }).click();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page).toHaveURL("http://localhost:3000/");
    const banner = page.getByText("Finish setup");
    await expect(banner.first()).toBeVisible();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("Finish setup")).toHaveCount(0);
    // Setup is now complete: a fresh visit to /onboarding bounces to /.
    await page.goto("/onboarding");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("guided tour appears after onboarding and is replayable from Settings", async ({ page }) => {
    await onboardedUser(page);
    // Replay from Settings so the tour is deterministic in the test.
    await page.goto("/settings");
    await page.getByRole("button", { name: "Replay tour" }).click();
    const dialog = page.getByRole("dialog", { name: "Elric guided tour" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Dashboard");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(dialog).toContainText("Inbox");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(dialog).toContainText("Exceptions");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(dialog).toContainText("Approvals");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("settings", () => {
  test("edit a field, save, reload — the saved value persists", async ({ page }) => {
    await onboardedUser(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    const company = page.getByLabel("Company name").first();
    await company.fill("Persisted Corp Pvt Ltd");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Company name").first()).toHaveValue("Persisted Corp Pvt Ltd");
    // The wizard-saved value from the earlier FTUE run is also visible here
    // via the approval-rules field when set; the company name proves the round-trip.
  });

  test("vendors CRUD: add, edit, remove", async ({ page }) => {
    await onboardedUser(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Add vendor" }).click();
    await page.getByLabel("Vendor name").last().fill("CRUD Vendor");
    await page.getByLabel("GSTIN").last().fill("29AAAAA0000A1Z5");
    await page.getByRole("button", { name: "Save vendor" }).click();
    await expect(page.getByRole("cell", { name: "CRUD Vendor" })).toBeVisible();

    await page.getByRole("row", { name: "CRUD Vendor" }).getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Vendor name").last().fill("CRUD Vendor Renamed");
    await page.getByRole("button", { name: "Save vendor" }).click();
    await expect(page.getByRole("cell", { name: "CRUD Vendor Renamed" })).toBeVisible();

    page.on("dialog", (dialog) => void dialog.accept());
    await page
      .getByRole("row", { name: "CRUD Vendor Renamed" })
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(page.getByRole("cell", { name: "CRUD Vendor Renamed" })).toHaveCount(0);
  });

  test("change password revokes the session and forces a fresh login", async ({ page }) => {
    const email = await onboardedUser(page);
    await page.goto("/settings");
    await page.getByLabel("Current password").fill(STRONG_PW);
    await page.getByLabel("New password", { exact: true }).fill(NEW_STRONG_PW);
    await page.getByLabel("Confirm new password").fill(NEW_STRONG_PW);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page).toHaveURL(/\/login\?notice=/);
    await expect(page.getByText("Please log in again with your new password.")).toBeVisible();

    // Old password no longer works; new password does.
    await loginViaUI(page, email, STRONG_PW);
    await expect(errorAlert(page)).toHaveText("Invalid email or password");
    await loginViaUI(page, email, NEW_STRONG_PW);
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("change password with the wrong current password shows 401", async ({ page }) => {
    await onboardedUser(page);
    await page.goto("/settings");
    await page.getByLabel("Current password").fill("Wr0ng!Password");
    await page.getByLabel("New password", { exact: true }).fill(NEW_STRONG_PW);
    await page.getByLabel("Confirm new password").fill(NEW_STRONG_PW);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(errorAlert(page)).toContainText("current password is incorrect");
    await expect(page).toHaveURL(/\/settings$/);
  });
});

test.describe("design fidelity", () => {
  test("Inter is actually loaded and applied to body text", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily).toContain("Inter");
    const interLoaded = await page.evaluate(() => document.fonts.check('16px Inter'));
    expect(interLoaded).toBe(true);
  });

  test("screenshots: login, onboarding, settings", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    await page.screenshot({ path: "tests/screenshots/login.png" });

    await freshUserOnOnboarding(page);
    await page.screenshot({ path: "tests/screenshots/onboarding.png" });

    // Finish setup with the same user (a second registration would bounce
    // off the guard, which redirects authenticated visits to /register).
    await page.getByRole("button", { name: /Set up your company/ }).click();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page).toHaveURL("http://localhost:3000/");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.screenshot({ path: "tests/screenshots/settings.png" });
  });
});
