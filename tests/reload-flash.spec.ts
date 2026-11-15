/**
 * Reload-flash + mock-removal + Mercury fidelity + Eval-summary suite.
 *
 * Runs against the REAL local backend (temp SQLite DB, see
 * playwright.reload.config.ts) — never the production Render service,
 * never the stub API. Data comes from the backend itself:
 *   - empty-DB tests run first, against the wiped temp DB;
 *   - the "with data" case uploads a real PDF through the real upload
 *     endpoint and seeds one flagged invoice via the backend's own
 *     store layer (tests/seed-invoice.py).
 *
 * Auth (real): the backend enforces Bearer auth on every data endpoint
 * (v1.1 contract). beforeAll registers a real test user against the
 * test backend and completes onboarding; beforeEach logs in fresh and
 * plants the fresh refresh cookie in the browser context so AuthShell's
 * silent refresh mints a real access token. A fresh login per test is
 * required because the backend rotates refresh tokens (see freshLogin).
 * Direct backend calls from the spec use the same token (with one
 * fresh-login retry on 401). No auth endpoint is stubbed anywhere in
 * this suite.
 *
 * Eval note: GET /api/eval/summary is being implemented by the backend
 * builder in parallel. This spec probes it live: if the endpoint
 * answers, the test runs against the REAL endpoint; if it 404s, the
 * spec serves the endpoint's exact pinned-contract shape filled with
 * numbers from a REAL POST /api/eval/run against the same backend
 * (stub transport only, real measured numbers) and logs which mode ran.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { BACKEND_URL, FORBIDDEN, TEST_DATABASE_URL, forbiddenFound, minimalPdf } from "./test-config";

const SHOTS = path.join(__dirname, "screenshots");
const SEED_SCRIPT = path.join(__dirname, "seed-invoice.py");
const BACKEND_PYTHON = path.resolve(__dirname, "../../backend/.venv/bin/python");

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/* ------------------------------------------------------- real test auth */

const TEST_EMAIL = "reload-test@elric.local";
const TEST_PASSWORD = "Test!Password1"; // meets the server policy (12+, upper/lower/digit/symbol)

let accessToken = "";
let refreshCookie = "";
let testUserId = "";

function parseRefreshCookie(setCookie: string | undefined): string {
  if (!setCookie) return "";
  const m = /elric_refresh=([^;]+)/.exec(setCookie);
  return m ? m[1] : "";
}

/**
 * Log in fresh and keep the new access token + refresh cookie.
 * A fresh login is required (not a refresh) because the backend ROTATES
 * refresh tokens: the first silent refresh inside AuthShell revokes the
 * token this suite captured, and re-presenting a revoked token is reuse
 * → the whole family is revoked and the next test would land on /login.
 * A new login mints a new session, so it is immune to rotation.
 */
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

/** Direct backend call with the real Bearer token; fresh-login once on 401. */
async function backendFetch(
  request: APIRequestContext,
  method: "get" | "post",
  path: string,
  opts: Record<string, unknown> = {},
): Promise<import("@playwright/test").APIResponse> {
  const doCall = () =>
    method === "get"
      ? request.get(`${BACKEND_URL}${path}`, {
          ...(opts as object),
          headers: { Authorization: `Bearer ${accessToken}`, ...((opts.headers as object) ?? {}) },
        })
      : request.post(`${BACKEND_URL}${path}`, {
          ...(opts as object),
          headers: { Authorization: `Bearer ${accessToken}`, ...((opts.headers as object) ?? {}) },
        });
  let res = await doCall();
  if (res.status() === 401) {
    // Access token expired (or rotated away) — fresh login, then retry once.
    await freshLogin(request);
    res = await doCall();
  }
  return res;
}

/** Sample page HTML repeatedly while the document is still loading. */
async function collectLoadSamples(page: Page): Promise<string[]> {
  const samples: string[] = [];
  for (let i = 0; i < 60; i++) {
    samples.push(await page.content());
    if ((await page.evaluate(() => document.readyState)) === "complete") break;
    await page.waitForTimeout(50);
  }
  samples.push(await page.content());
  return samples;
}

function assertNoForbidden(samples: string[], where: string): void {
  const bad: string[] = [];
  for (const html of samples) bad.push(...forbiddenFound(html));
  expect(bad, `forbidden dummy values during ${where}: ${[...new Set(bad)].join(", ")}`).toEqual([]);
}

test.describe.serial("reload flash, mock removal, fidelity, eval", () => {
  test.beforeAll(async ({ request }) => {
    // Real user on the real test backend (DB is wiped per run).
    let res = await request.post(`${BACKEND_URL}/api/auth/register`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    if (res.status() === 409) {
      res = await request.post(`${BACKEND_URL}/api/auth/login`, {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
    }
    expect(res.status(), "test user register/login should succeed").toBeLessThan(300);
    const body = (await res.json()) as { access_token?: string; user?: { id?: string } };
    expect(body.access_token, "backend must return an access token").toBeTruthy();
    accessToken = body.access_token!;
    testUserId = String(body.user?.id ?? "");
    expect(testUserId, "backend must return the test user id").toBeTruthy();
    refreshCookie = parseRefreshCookie(res.headers()["set-cookie"]);
    expect(refreshCookie, "backend must set the elric_refresh cookie").toBeTruthy();
    // Complete onboarding so AuthShell does not bounce to /onboarding.
    const done = await request.post(`${BACKEND_URL}/api/auth/complete-onboarding`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(done.status(), "complete-onboarding should succeed").toBe(200);
  });

  test.beforeEach(async ({ page, request }) => {
    // Fresh login per test (see freshLogin): AuthShell rotates the
    // refresh token on its first silent refresh, so a cookie captured
    // in beforeAll is revoked by the second test. Plant a fresh one.
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

  test("font: Inter actually loads and applies (not a fallback)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    const font = await page.evaluate(async () => {
      await document.fonts.ready;
      const cs = getComputedStyle(document.body);
      const h1 = document.querySelector("h1");
      const h1cs = h1 ? getComputedStyle(h1) : null;
      // next/font serves Inter under a generated family (__Inter_<hash>);
      // the "Inter" name in the stack is only a fallback. The loaded
      // faces are the proof — document.fonts.check() is NOT: it returns
      // true even for a nonexistent family.
      const loadedInterWeights = [...document.fonts]
        .filter((f) => f.family.startsWith("__Inter") && f.status === "loaded")
        .map((f) => f.weight);
      return {
        bodyFamily: cs.fontFamily,
        bodySize: cs.fontSize,
        smoothing: cs.getPropertyValue("-webkit-font-smoothing"),
        loadedInterWeights,
        h1Size: h1cs?.fontSize,
        h1Weight: h1cs?.fontWeight,
        h1LetterSpacing: h1cs?.letterSpacing,
      };
    });
    // Real Inter (next/font) is first in the stack, not a fallback.
    expect(font.bodyFamily.startsWith("__Inter")).toBe(true);
    expect(font.bodySize).toBe("14px");
    expect(font.smoothing).toBe("antialiased");
    expect(font.loadedInterWeights).toContain("400");
    expect(font.loadedInterWeights).toContain("600");
    expect(font.h1Size).toBe("28px");
    expect(["600", "700"]).toContain(font.h1Weight);
    // Global token: headings track at -0.01em → -0.28px at 28px.
    expect(Math.abs(parseFloat(font.h1LetterSpacing ?? "0") - -0.28)).toBeLessThan(0.1);
  });

  test("empty DB: every page shows an honest empty state, zero non-zero numbers", async ({ page }) => {
    // Dashboard — real API zeros only.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Two honest empty states on an empty dashboard: vendor balances
    // + recent invoices. A bare toBeVisible() would trip strict mode.
    await expect(page.getByTestId("empty-state")).toHaveCount(2);
    await expect(page.getByTestId("pending-total")).toHaveText(/₹0\.00/);
    await expect(page.getByTestId("skeleton")).toHaveCount(0);
    assertNoForbidden([await page.content()], "dashboard (empty DB)");

    // Inbox.
    await page.goto("/inbox");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("skeleton")).toHaveCount(0);
    assertNoForbidden([await page.content()], "inbox (empty DB)");

    // Exceptions.
    await page.goto("/exceptions");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Exception queue is clear")).toBeVisible();
    await expect(page.getByText("0 of 0 exceptions")).toBeVisible();
    assertNoForbidden([await page.content()], "exceptions (empty DB)");

    // Approvals.
    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Approval queue is clear")).toBeVisible();
    await expect(page.getByText("0 invoices waiting on a human decision")).toBeVisible();
    assertNoForbidden([await page.content()], "approvals (empty DB)");

    // Vendors.
    await page.goto("/vendors");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("No vendors yet")).toBeVisible();
    await expect(page.getByText("0 vendors · balances are open")).toBeVisible();
    assertNoForbidden([await page.content()], "vendors (empty DB)");

    // Payments — wired to GET /api/payments.
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("No payments scheduled yet")).toBeVisible();
    await expect(page.getByTestId("skeleton")).toHaveCount(0);
    assertNoForbidden([await page.content()], "payments (empty DB)");

    // Accounting — wired to GET /api/ledger.
    await page.goto("/accounting");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("No ledger entries yet")).toBeVisible();
    await expect(page.getByTestId("skeleton")).toHaveCount(0);
    assertNoForbidden([await page.content()], "accounting (empty DB)");

    // Eval — GET /api/eval/summary now exists on the backend, so even an
    // empty DB yields a live summary (the synthetic corpus runs on
    // demand, zero LLM calls). Live data, honest empty state, or honest
    // error state all pass; dummy values never do.
    await page.goto("/eval");
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .getByTestId("eval-synthetic")
        .or(page.getByTestId("empty-state"))
        .or(page.getByTestId("backend-error")),
    ).toBeVisible();
    assertNoForbidden([await page.content()], "eval (empty DB)");
  });

  test("reload flash: dashboard never renders dummy values across 5 reloads", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    assertNoForbidden(await collectLoadSamples(page), "initial dashboard load");
    await expect(page.getByTestId("empty-state")).toHaveCount(2);

    for (let r = 1; r <= 5; r++) {
      await page.screenshot({ path: path.join(SHOTS, `reload-${r}-before.png`) });
      await page.reload({ waitUntil: "commit" });
      assertNoForbidden(await collectLoadSamples(page), `dashboard reload ${r}`);
      await page.screenshot({ path: path.join(SHOTS, `reload-${r}-after.png`) });
      await expect(page.getByTestId("empty-state")).toHaveCount(2);
      await expect(page.getByTestId("pending-total")).toHaveText(/₹0\.00/);
    }
  });

  test("reload flash: payments + accounting never render dummy values during load", async ({ page }) => {
    for (const [route, emptyText] of [
      ["/payments", "No payments scheduled yet"],
      ["/accounting", "No ledger entries yet"],
    ] as const) {
      await page.goto(route, { waitUntil: "commit" });
      assertNoForbidden(await collectLoadSamples(page), `${route} initial load`);
      await expect(page.getByText(emptyText)).toBeVisible();
      await page.reload({ waitUntil: "commit" });
      assertNoForbidden(await collectLoadSamples(page), `${route} reload`);
      await expect(page.getByText(emptyText)).toBeVisible();
    }
  });

  test("stability: pending-approval amount and vendor balances identical across 3 reloads", async ({
    page,
    request,
  }) => {
    // 1. A real invoice row, created by the backend itself: upload a
    //    fixture PDF through the real upload endpoint.
    const upload = await backendFetch(request, "post", "/api/invoices/upload", {
      multipart: {
        file: { name: "fixture-invoice.pdf", mimeType: "application/pdf", buffer: minimalPdf() },
      },
    });
    expect(upload.status(), "upload should be accepted (202)").toBe(202);
    const uploaded = (await upload.json()) as { id: string };
    // Wait for the pipeline to park it (flagged); the uploaded row has
    // no vendor and total 0, so it cannot move the money values — but
    // wait for it to settle so counts are stable across reloads.
    const deadline = Date.now() + 30_000;
    let parkedStatus = "";
    while (Date.now() < deadline) {
      const res = await backendFetch(request, "get", `/api/invoices/${uploaded.id}`);
      if (res.ok()) {
        parkedStatus = String(((await res.json()) as { status: string }).status);
        if (parkedStatus === "flagged") break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    // eslint-disable-next-line no-console
    console.log(`uploaded invoice settled as: ${parkedStatus || "(unknown)"}`);

    // 2. One flagged invoice with vendor + total, via the backend's own
    //    store layer (tests/seed-invoice.py). Pending total and vendor
    //    balance become exactly ₹1,00,000.00 from the API.
    const seedOut = execFileSync(BACKEND_PYTHON, [SEED_SCRIPT], {
      env: { ...process.env, TEST_DATABASE_URL, SEED_USER_ID: testUserId },
    })
      .toString()
      .trim();
    expect(seedOut).toMatch(/^[0-9a-f-]{36}$/);

    const readValues = async () => {
      await page.waitForSelector('[data-testid="pending-total"]');
      await expect(page.getByTestId("skeleton")).toHaveCount(0);
      const pending = (await page.getByTestId("pending-total").textContent()) ?? "";
      const balances = await page.getByTestId("vendor-balance").allTextContents();
      return { pending, balances };
    };

    await page.goto("/");
    const first = await readValues();
    expect(first.pending).toContain("1,00,000");
    expect(first.balances).toEqual(["₹1,00,000.00"]);

    for (let r = 1; r <= 3; r++) {
      await page.reload();
      expect(await readValues(), `values changed on reload ${r}`).toEqual(first);
    }
  });

  test("eval page: skeleton → real numbers; false-approve rate matches the API", async ({
    page,
    request,
  }) => {
    // Probe the real endpoint first.
    const probe = await backendFetch(request, "get", "/api/eval/summary");
    let mode = "real-backend";
    let apiSummary: {
      synthetic: { false_approve_rate: number; match_rate: number; auto_approve_rate: number; exception_code_accuracy: number } | null;
      graph: unknown;
    };
    if (probe.status() === 200) {
      apiSummary = (await probe.json()) as typeof apiSummary;
    } else {
      // Endpoint not landed yet: serve its exact pinned-contract shape,
      // filled with numbers from a REAL POST /api/eval/run against the
      // same backend. Stub transport only — the numbers are measured.
      mode = "stub-transport-real-numbers";
      const run = await backendFetch(request, "post", "/api/eval/run?n_per_scenario=2", {});
      expect(run.status(), "real eval run should succeed").toBe(200);
      const runJson = (await run.json()) as { metrics: unknown; graph_eval: unknown };
      apiSummary = {
        synthetic: (runJson.metrics ?? null) as typeof apiSummary.synthetic,
        graph: runJson.graph_eval ?? null,
      };
      const stubBody = {
        synthetic: apiSummary.synthetic,
        graph: apiSummary.graph,
        generated_at: new Date().toISOString(),
        cached: false,
      };
      await page.route("**/api/eval/summary*", async (route) => {
        await new Promise((r) => setTimeout(r, 900));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stubBody) });
      });
    }
    // eslint-disable-next-line no-console
    console.log(`eval test mode: ${mode}`);
    expect(apiSummary.synthetic, "synthetic eval numbers must exist").not.toBeNull();

    if (mode === "real-backend") {
      // Delay the real summary response so the skeleton is observable.
      await page.route("**/api/eval/summary*", async (route) => {
        const res = await backendFetch(request, "get", "/api/eval/summary");
        const body = await res.text();
        await new Promise((r) => setTimeout(r, 900));
        await route.fulfill({ status: res.status(), contentType: "application/json", body });
      });
    }

    await page.goto("/eval", { waitUntil: "commit" });
    await expect(page.getByTestId("eval-loading")).toBeVisible();
    await expect(page.getByTestId("eval-synthetic")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("skeleton")).toHaveCount(0);

    const s = apiSummary.synthetic!;
    await expect(page.getByTestId("eval-synthetic-False-approve rate")).toHaveText(pct(s.false_approve_rate));
    await expect(page.getByTestId("eval-synthetic-3-way match rate")).toHaveText(pct(s.match_rate));
    await expect(page.getByTestId("eval-synthetic-Auto-approve rate")).toHaveText(pct(s.auto_approve_rate));
    await expect(page.getByTestId("eval-synthetic-Exception-code accuracy")).toHaveText(
      pct(s.exception_code_accuracy),
    );
    assertNoForbidden([await page.content()], "eval page");

    // "Run eval" re-runs against the real backend and the numbers stay.
    await page.getByRole("button", { name: "Run eval (synthetic corpus)" }).click();
    await expect(page.getByTestId("eval-synthetic")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("eval-synthetic-False-approve rate")).toHaveText(pct(s.false_approve_rate));
  });

  test("reduced motion: skeletons do not animate, transitions are off", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    await ctx.addCookies([
      {
        name: "elric_refresh",
        value: refreshCookie,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const rmPage = await ctx.newPage();
    // Hold the metrics response so skeletons stay on screen to inspect.
    await rmPage.route("**/api/metrics", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await rmPage.goto("/", { waitUntil: "commit" });
    await rmPage.waitForSelector('[data-testid="skeleton"]');
    const reduced = await rmPage.evaluate(() => {
      const el = document.querySelector('[data-testid="skeleton"]')!;
      const cs = getComputedStyle(el);
      const pill = document.querySelector('a[href="/inbox"]');
      const pillCs = pill ? getComputedStyle(pill) : null;
      const toMs = (v: string) => (v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000);
      return {
        mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
        skeletonAnimationName: cs.animationName,
        skeletonAnimationDurationMs: toMs(cs.animationDuration),
        pillTransitionMs: pillCs ? toMs(pillCs.transitionDuration) : null,
      };
    });
    expect(reduced.mediaMatches).toBe(true);
    expect(reduced.skeletonAnimationName).toBe("none");
    expect(reduced.skeletonAnimationDurationMs).toBeLessThanOrEqual(0.1);
    if (reduced.pillTransitionMs !== null) {
      expect(reduced.pillTransitionMs).toBeLessThanOrEqual(0.1);
    }
    await ctx.close();
  });

  test("fidelity screenshots: pages vs the Mercury reference", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    const shots: Array<[string, string]> = [
      ["dashboard", "/"],
      ["inbox", "/inbox"],
      ["exceptions", "/exceptions"],
      ["approvals", "/approvals"],
      ["vendors", "/vendors"],
      ["payments", "/payments"],
      ["accounting", "/accounting"],
      ["eval", "/eval"],
    ];
    for (const [name, url] of shots) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("skeleton")).toHaveCount(0);
      await page.screenshot({ path: path.join(SHOTS, `${name}-after.png`) });
    }
    assertNoForbidden([await page.content()], "fidelity screenshots pass");
  });
});
