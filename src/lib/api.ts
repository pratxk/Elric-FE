/**
 * Typed client for the Elric backend API (ARCHITECTURE.md §8).
 *
 * Base URL: NEXT_PUBLIC_API_URL when set (direct calls — the backend then
 * needs CORS enabled). When unset, calls go same-origin and Next.js
 * rewrites /api/* to the backend (API_URL env, default
 * http://localhost:8000 — see next.config.mjs). The backend ships no CORS
 * middleware, so the same-origin proxy is the default local path.
 *
 * The frontend never calls Gemini itself. Extraction failures are
 * surfaced by the backend on each invoice as extraction_error /
 * extraction_error_kind — the UI renders that true reason and offers a
 * retry (POST /api/invoices/{id}/retry-extraction). It never guesses
 * "no key configured": that copy appears only when the backend reports
 * kind "no_key".
 */
import { useCallback, useEffect, useState } from "react";
import { normalizeCurrency } from "./format";

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function toNum(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------- auth (tokens) */

/**
 * Token auth (v1.1 contract): the backend returns a short-lived JWT
 * `access_token` in JSON on register/login/refresh, and sets an HttpOnly
 * `elric_refresh` cookie (7 days). The access token lives IN MEMORY ONLY
 * — never localStorage/sessionStorage — and is sent as
 * `Authorization: Bearer <token>` on every API call. The refresh cookie
 * flows automatically with `credentials: "include"` (same-origin via the
 * Next.js proxy); the frontend never reads it.
 */

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path !== "/login" && path !== "/register") window.location.href = "/login";
}

/** Raw refresh call — never goes through req() (no retry loop on itself). */
let refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        clearAccessToken();
        return null;
      }
      const body = (await res.json()) as { access_token?: string };
      if (typeof body.access_token !== "string" || body.access_token === "") {
        clearAccessToken();
        return null;
      }
      setAccessToken(body.access_token);
      return body.access_token;
    } catch {
      clearAccessToken();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * App-load / route-guard entry point: if there is no access token in
 * memory, silently refresh via the cookie first. Returns true when a
 * usable token exists afterwards.
 */
export async function ensureSession(): Promise<boolean> {
  if (accessToken) return true;
  return (await refreshAccessToken()) !== null;
}

/** Fetch with auth. On 401, refresh once and retry; if refresh fails, log out. */
async function reqAuth<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
    Accept: "application/json",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers });
  } catch {
    throw new ApiError(0, "Backend unreachable — is it running on port 8000?");
  }
  if (res.status === 401 && !retried && path.startsWith("/api/") && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/register") && !path.startsWith("/api/auth/refresh")) {
    const fresh = await refreshAccessToken();
    if (fresh) return reqAuth<T>(path, init, true);
    redirectToLogin();
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/* ------------------------------------------------------- auth endpoints */

export interface ApiUser {
  id: string;
  email: string;
  onboarding_completed: boolean;
}

export interface AuthResponse {
  access_token: string;
  user: ApiUser;
}

function storeAuth(r: AuthResponse): AuthResponse {
  if (typeof r.access_token === "string" && r.access_token !== "") setAccessToken(r.access_token);
  return r;
}

export async function registerUser(email: string, password: string): Promise<AuthResponse> {
  const r = await reqAuth<AuthResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return storeAuth(r);
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const r = await reqAuth<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return storeAuth(r);
}

export async function logoutUser(): Promise<void> {
  try {
    await reqAuth<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  } finally {
    clearAccessToken();
  }
}

export async function getMe(): Promise<ApiUser> {
  return reqAuth<ApiUser>("/api/auth/me");
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await reqAuth<{ ok: boolean }>("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  // Success revokes ALL sessions server-side: drop the in-memory token
  // and force a fresh login (the settings page redirects to /login).
  clearAccessToken();
}

export async function completeOnboarding(): Promise<{ onboarding_completed: boolean }> {
  return reqAuth<{ onboarding_completed: boolean }>("/api/auth/complete-onboarding", { method: "POST" });
}

/* ------------------------------------------------------------------ types */

export interface ApiInvoiceLine {
  description: string;
  hsn_code?: string | null;
  qty: number;
  unit_price: number;
  tax_rate_pct?: number;
}

export interface ApiMatchRule {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface ApiMatch {
  outcome: string;
  exception_codes: string[];
  rule_outcomes: ApiMatchRule[];
  aligned_pairs: Array<{ invoice_idx?: number; po_idx?: number; score?: number }>;
  po_id?: string | null;
  gr_id?: string | null;
}

export interface ApiException {
  code: string;
  message: string;
  severity?: string;
  line_ref?: string | null;
  root_cause?: string | null;
}

export interface ApiInvoice {
  id: string;
  vendor_id: string;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  currency: string;
  status: string;
  subtotal: number;
  tax_total: number;
  total: number;
  document_hash: string | null;
  lines: ApiInvoiceLine[];
  match: ApiMatch | null;
  exceptions: ApiException[];
  /** Last extraction failure, as reported by the backend (None when
   * extraction succeeded or has not run). */
  extraction_error: string | null;
  /** "no_key" | "overloaded" | "quota" | "failed" | null. */
  extraction_error_kind: string | null;
}

/** Human sentence for an invoice's extraction failure, or null when
 * there is none. Keyed on the backend-reported kind — "no key" appears
 * only when the backend genuinely has no key configured. */
export function extractionFailureReason(inv: Pick<ApiInvoice, "extraction_error" | "extraction_error_kind">): string | null {
  if (!inv.extraction_error && !inv.extraction_error_kind) return null;
  switch (inv.extraction_error_kind) {
    case "no_key":
      return "No Gemini API key is configured on this backend — set GEMINI_API_KEY and retry the invoice.";
    case "overloaded":
      return "Gemini was overloaded (HTTP 503) when this invoice was processed — extraction did not run. You can retry it below.";
    case "quota":
      return "Gemini quota was exhausted when this invoice was processed — extraction did not run. Try again later.";
    default:
      return inv.extraction_error
        ? `Extraction failed — ${inv.extraction_error}`
        : "Extraction failed for an unknown reason — see the invoice trace.";
  }
}

export interface ApiMetrics {
  total_invoices: number;
  by_status: Record<string, number>;
  exceptions_open: number;
  money_in_exceptions_inr: number;
  money_in_exceptions_currency: string;
  auto_approved: number;
  // Aging breakdown, served by /api/metrics (buckets + due-soon).
  overdue_count: number;
  overdue_total_inr: number;
  overdue_total_currency: string;
  due_soon_count: number;
  due_soon_total_inr: number;
  due_soon_total_currency: string;
  aging_buckets: Record<string, { count: number; total_inr: number }>;
}

export interface ApiVendorSummary {
  vendor_id: string;
  vendor_name: string;
  open_balance_inr: number;
  open_count: number;
  last_invoice_date: string | null;
}

export interface ApiPayment {
  id: string;
  invoice_id: string;
  amount: number;
  scheduled_date: string;
  status: string;
}

export interface ApiForecastWeek {
  week_start: string;
  projected_outflow_inr: number;
}

export interface ApiForecast {
  weeks: number;
  start: string;
  weekly_outflows: ApiForecastWeek[];
  total_projected_inr: number;
}

export interface EvalScenario {
  n: number;
  code_correct: number;
  auto_approved: number;
}

export interface EvalResult {
  kind: string;
  n_cases: number;
  match_rate: number;
  auto_approve_rate: number;
  false_approve_rate: number;
  false_approves: number;
  exception_code_accuracy: number;
  per_scenario: Record<string, EvalScenario>;
}

export interface TraceEvent {
  action: string;
  actor: string;
  detail: Record<string, unknown>;
  at: string;
}

/* -------------------------------------------------------------- normalise */

function normalizeInvoice(raw: Record<string, unknown>): ApiInvoice {
  const lines = Array.isArray(raw.lines)
    ? (raw.lines as Array<Record<string, unknown>>).map((l) => ({
        description: String(l.description ?? ""),
        hsn_code: (l.hsn_code as string | null) ?? null,
        qty: toNum(l.qty),
        unit_price: toNum(l.unit_price),
        tax_rate_pct: l.tax_rate_pct === undefined ? undefined : toNum(l.tax_rate_pct),
      }))
    : [];
  const matchRaw = raw.match as Record<string, unknown> | null;
  const match: ApiMatch | null = matchRaw
    ? {
        outcome: String(matchRaw.outcome ?? ""),
        exception_codes: Array.isArray(matchRaw.exception_codes)
          ? (matchRaw.exception_codes as unknown[]).map(String)
          : [],
        rule_outcomes: Array.isArray(matchRaw.rule_outcomes)
          ? (matchRaw.rule_outcomes as Array<Record<string, unknown>>).map((r) => ({
              rule: String(r.rule ?? ""),
              passed: Boolean(r.passed),
              detail: String(r.detail ?? ""),
            }))
          : [],
        aligned_pairs: Array.isArray(matchRaw.aligned_pairs)
          ? (matchRaw.aligned_pairs as Array<Record<string, unknown>>).map((p) => ({
              invoice_idx: p.invoice_idx === undefined ? undefined : toNum(p.invoice_idx),
              po_idx: p.po_idx === undefined ? undefined : toNum(p.po_idx),
              score: p.score === undefined ? undefined : toNum(p.score),
            }))
          : [],
        po_id: (matchRaw.po_id as string | null) ?? null,
        gr_id: (matchRaw.gr_id as string | null) ?? null,
      }
    : null;
  const exceptions = Array.isArray(raw.exceptions)
    ? (raw.exceptions as Array<Record<string, unknown>>).map((e) => ({
        code: String(e.code ?? ""),
        message: String(e.message ?? ""),
        severity: (e.severity as string | undefined) ?? undefined,
        line_ref: (e.line_ref as string | null) ?? null,
        root_cause: (e.root_cause as string | null) ?? null,
      }))
    : [];
  return {
    id: String(raw.id ?? ""),
    vendor_id: String(raw.vendor_id ?? ""),
    vendor_name: String(raw.vendor_name ?? ""),
    invoice_number: String(raw.invoice_number ?? ""),
    invoice_date: String(raw.invoice_date ?? ""),
    due_date: (raw.due_date as string | null) ?? null,
    currency: normalizeCurrency(String(raw.currency ?? "INR")),
    status: String(raw.status ?? ""),
    subtotal: toNum(raw.subtotal),
    tax_total: toNum(raw.tax_total),
    total: toNum(raw.total),
    document_hash: (raw.document_hash as string | null) ?? null,
    lines,
    match,
    exceptions,
    extraction_error: (raw.extraction_error as string | null) ?? null,
    extraction_error_kind: (raw.extraction_error_kind as string | null) ?? null,
  };
}

export interface ApiSettings {
  company_name: string;
  country: string;
  state: string;
  currency: string;
  auto_approve_limit_inr: number;
  tolerance_pct: number;
  tolerance_flat_inr: number;
  duplicate_window_days: number;
}

export const DEFAULT_SETTINGS: ApiSettings = {
  company_name: "",
  country: "India",
  state: "Karnataka",
  currency: "INR",
  auto_approve_limit_inr: 50000,
  tolerance_pct: 2,
  tolerance_flat_inr: 500,
  duplicate_window_days: 90,
};

/** Password policy (mirrors the server): 12+ chars, upper, lower, digit, symbol. */
export const PASSWORD_RULES: Array<{ key: string; label: string; test: (pw: string) => boolean }> = [
  { key: "length", label: "At least 12 characters", test: (pw) => pw.length >= 12 },
  { key: "upper", label: "At least one uppercase letter (A–Z)", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lower", label: "At least one lowercase letter (a–z)", test: (pw) => /[a-z]/.test(pw) },
  { key: "digit", label: "At least one digit (0–9)", test: (pw) => /[0-9]/.test(pw) },
  { key: "symbol", label: "At least one symbol (!@#$…)", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function passwordIsValid(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

export interface ApiVendor {
  id: string;
  name: string;
  gstin: string;
  state: string;
  payment_terms: string;
  email: string;
}

/** Merge the vendor registry with invoice-derived balances into one
 * row per vendor. A registered vendor shows even with no invoices yet
 * (zero balance); a vendor that only exists on invoices still shows
 * with its balance. Used by the Vendors page and the dashboard's
 * vendor-balances card so neither ever says "No vendors yet" to a
 * user who already registered one.
 *
 * Currency: the backend sums a vendor's open invoice totals without
 * conversion, so a row's balance is only meaningful in the currency
 * of those invoices. `invoices` (the user's invoice list) supplies
 * it: when every open invoice for the vendor shares one currency the
 * row uses it, otherwise the workspace currency (INR). */
export interface VendorRow {
  id: string;
  name: string;
  openCount: number;
  openBalanceInr: number;
  lastInvoiceDate: string | null;
  registered: boolean;
  currency: string;
}

/** Open statuses, mirroring the backend's vendor-summary aggregation. */
const OPEN_STATUSES = new Set([
  "received",
  "extracted",
  "validated",
  "matched",
  "flagged",
  "approved",
  "posted",
  "scheduled",
  "on_hold",
]);

function vendorCurrency(row: { id: string; name: string }, invoices: ApiInvoice[]): string {
  const currencies = invoices
    .filter(
      (i) =>
        OPEN_STATUSES.has(i.status) && (i.vendor_id === row.id || (row.name !== "" && i.vendor_name === row.name)),
    )
    .map((i) => i.currency);
  const distinct = [...new Set(currencies.map((c) => normalizeCurrency(c)).filter((c) => c !== ""))];
  return distinct.length === 1 ? distinct[0] : "INR";
}

export function mergeVendorRows(
  registry: ApiVendor[],
  summaries: ApiVendorSummary[],
  invoices: ApiInvoice[] = [],
): VendorRow[] {
  const byId = new Map<string, ApiVendorSummary>();
  for (const s of summaries) byId.set(s.vendor_id, s);
  const rows: VendorRow[] = registry.map((v) => {
    const s = byId.get(v.id);
    return {
      id: v.id,
      name: v.name,
      openCount: s?.open_count ?? 0,
      openBalanceInr: s?.open_balance_inr ?? 0,
      lastInvoiceDate: s?.last_invoice_date ?? null,
      registered: true,
      currency: vendorCurrency(v, invoices),
    };
  });
  for (const s of summaries) {
    if (!registry.some((v) => v.id === s.vendor_id)) {
      rows.push({
        id: s.vendor_id,
        name: s.vendor_name,
        openCount: s.open_count,
        openBalanceInr: s.open_balance_inr,
        lastInvoiceDate: s.last_invoice_date,
        registered: false,
        currency: vendorCurrency({ id: s.vendor_id, name: s.vendor_name }, invoices),
      });
    }
  }
  return rows.sort((a, b) => b.openBalanceInr - a.openBalanceInr);
}

/* -------------------------------------------------------------- endpoints */

export async function getHealth(): Promise<{ status: string }> {
  // /health is proxied to the backend by next.config.mjs, like /api/*.
  return reqAuth<{ status: string }>("/health");
}

/* ------------------------------------------------------------- settings */

export async function getSettings(): Promise<ApiSettings> {
  const raw = await reqAuth<Record<string, unknown>>("/api/settings");
  return {
    company_name: String(raw.company_name ?? ""),
    country: String(raw.country ?? "India"),
    state: String(raw.state ?? ""),
    currency: normalizeCurrency(String(raw.currency ?? "INR")),
    auto_approve_limit_inr: toNum(raw.auto_approve_limit_inr),
    tolerance_pct: toNum(raw.tolerance_pct),
    tolerance_flat_inr: toNum(raw.tolerance_flat_inr),
    duplicate_window_days: toNum(raw.duplicate_window_days),
  };
}

export async function updateSettings(s: ApiSettings): Promise<ApiSettings> {
  const raw = await reqAuth<Record<string, unknown>>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  });
  return {
    company_name: String(raw.company_name ?? s.company_name),
    country: String(raw.country ?? s.country),
    state: String(raw.state ?? s.state),
    currency: normalizeCurrency(String(raw.currency ?? s.currency)),
    auto_approve_limit_inr: toNum(raw.auto_approve_limit_inr ?? s.auto_approve_limit_inr),
    tolerance_pct: toNum(raw.tolerance_pct ?? s.tolerance_pct),
    tolerance_flat_inr: toNum(raw.tolerance_flat_inr ?? s.tolerance_flat_inr),
    duplicate_window_days: toNum(raw.duplicate_window_days ?? s.duplicate_window_days),
  };
}

/* -------------------------------------------------------------- vendors */

export async function listVendors(): Promise<ApiVendor[]> {
  // The registry list — NOT GET /api/vendors (that returns per-vendor
  // open-balance summaries derived from invoices).
  const raw = await reqAuth<Array<Record<string, unknown>>>("/api/vendors/registry");
  return raw.map((v) => ({
    id: String(v.id ?? v.vendor_id ?? ""),
    name: String(v.name ?? v.vendor_name ?? ""),
    gstin: String(v.gstin ?? ""),
    state: String(v.state ?? ""),
    payment_terms: String(v.payment_terms ?? ""),
    email: String(v.email ?? ""),
  }));
}

export async function createVendor(v: Omit<ApiVendor, "id">): Promise<ApiVendor> {
  const raw = await reqAuth<Record<string, unknown>>("/api/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(v),
  });
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? v.name),
    gstin: String(raw.gstin ?? v.gstin),
    state: String(raw.state ?? v.state),
    payment_terms: String(raw.payment_terms ?? v.payment_terms),
    email: String(raw.email ?? v.email),
  };
}

export async function updateVendor(id: string, v: Omit<ApiVendor, "id">): Promise<ApiVendor> {
  const raw = await reqAuth<Record<string, unknown>>(`/api/vendors/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(v),
  });
  return {
    id: String(raw.id ?? id),
    name: String(raw.name ?? v.name),
    gstin: String(raw.gstin ?? v.gstin),
    state: String(raw.state ?? v.state),
    payment_terms: String(raw.payment_terms ?? v.payment_terms),
    email: String(raw.email ?? v.email),
  };
}

export async function deleteVendor(id: string): Promise<void> {
  await reqAuth<unknown>(`/api/vendors/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getMetrics(): Promise<ApiMetrics> {
  const raw = await reqAuth<Record<string, unknown>>("/api/metrics");
  const bucketsRaw = (raw.aging_buckets as Record<string, Record<string, unknown>>) ?? {};
  const buckets: Record<string, { count: number; total_inr: number }> = {};
  for (const [k, v] of Object.entries(bucketsRaw)) {
    buckets[k] = { count: toNum(v.count), total_inr: toNum(v.total_inr) };
  }
  return {
    total_invoices: toNum(raw.total_invoices),
    by_status: (raw.by_status as Record<string, number>) ?? {},
    exceptions_open: toNum(raw.exceptions_open),
    money_in_exceptions_inr: toNum(raw.money_in_exceptions_inr),
    money_in_exceptions_currency: String(raw.money_in_exceptions_currency ?? "INR"),
    auto_approved: toNum(raw.auto_approved),
    overdue_count: toNum(raw.overdue_count),
    overdue_total_inr: toNum(raw.overdue_total_inr),
    overdue_total_currency: String(raw.overdue_total_currency ?? "INR"),
    due_soon_count: toNum(raw.due_soon_count),
    due_soon_total_inr: toNum(raw.due_soon_total_inr),
    due_soon_total_currency: String(raw.due_soon_total_currency ?? "INR"),
    aging_buckets: buckets,
  };
}

export async function getVendorSummaries(): Promise<ApiVendorSummary[]> {
  const raw = await reqAuth<Array<Record<string, unknown>>>("/api/vendors");
  // Tolerant of both shapes: the old summary shape (vendor_id,
  // open_balance_inr, …) and the v1.1 CRUD shape (id, name, …), which
  // carries no balances — those read as zero / unknown.
  return raw.map((v) => ({
    vendor_id: String(v.vendor_id ?? v.id ?? ""),
    vendor_name: String(v.vendor_name ?? v.name ?? ""),
    open_balance_inr: toNum(v.open_balance_inr),
    open_count: toNum(v.open_count),
    last_invoice_date: (v.last_invoice_date as string | null) ?? null,
  }));
}

export async function getPayments(): Promise<ApiPayment[]> {
  const raw = await reqAuth<Array<Record<string, unknown>>>("/api/payments");
  return raw.map((p) => ({
    id: String(p.id ?? ""),
    invoice_id: String(p.invoice_id ?? ""),
    amount: toNum(p.amount),
    scheduled_date: String(p.scheduled_date ?? ""),
    status: String(p.status ?? ""),
  }));
}

export async function getForecast(): Promise<ApiForecast> {
  const raw = await reqAuth<Record<string, unknown>>("/api/forecast");
  const weeks = Array.isArray(raw.weekly_outflows)
    ? (raw.weekly_outflows as Array<Record<string, unknown>>).map((w) => ({
        week_start: String(w.week_start ?? ""),
        projected_outflow_inr: toNum(w.projected_outflow_inr),
      }))
    : [];
  return {
    weeks: toNum(raw.weeks),
    start: String(raw.start ?? ""),
    weekly_outflows: weeks,
    total_projected_inr: toNum(raw.total_projected_inr),
  };
}

export async function listInvoices(status?: string): Promise<ApiInvoice[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const raw = await reqAuth<Array<Record<string, unknown>>>(`/api/invoices${q}`);
  return raw.map(normalizeInvoice);
}

export async function getInvoice(id: string): Promise<ApiInvoice> {
  return normalizeInvoice(await reqAuth<Record<string, unknown>>(`/api/invoices/${encodeURIComponent(id)}`));
}

export async function uploadInvoice(file: File): Promise<ApiInvoice> {
  const form = new FormData();
  form.append("file", file);
  return normalizeInvoice(
    await reqAuth<Record<string, unknown>>("/api/invoices/upload", {
      method: "POST",
      body: form,
    }),
  );
}

/** Re-run the pipeline for an on-hold / flagged invoice whose
 * extraction failed. 202 with the reset row (status "received", error
 * cleared); the re-run finishes in the background — poll getInvoice
 * until the status moves. */
export async function retryExtraction(id: string): Promise<ApiInvoice> {
  return normalizeInvoice(
    await reqAuth<Record<string, unknown>>(`/api/invoices/${encodeURIComponent(id)}/retry-extraction`, {
      method: "POST",
    }),
  );
}

export async function approveInvoice(id: string, reason = ""): Promise<ApiInvoice> {
  return normalizeInvoice(
    await reqAuth<Record<string, unknown>>(`/api/invoices/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approver: "ap_clerk", reason }),
    }),
  );
}

export async function rejectInvoice(id: string, reason = ""): Promise<ApiInvoice> {
  return normalizeInvoice(
    await reqAuth<Record<string, unknown>>(`/api/invoices/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approver: "ap_clerk", reason }),
    }),
  );
}

export async function draftVendorQuery(id: string): Promise<{ invoice_id: string; draft: string; sent: boolean }> {
  return reqAuth<{ invoice_id: string; draft: string; sent: boolean }>(
    `/api/invoices/${encodeURIComponent(id)}/query-vendor`,
    { method: "POST" },
  );
}

export async function getExceptions(): Promise<ApiInvoice[]> {
  const raw = await reqAuth<Array<Record<string, unknown>>>("/api/queue/exceptions");
  return raw.map(normalizeInvoice);
}

export async function runEval(nPerScenario = 2): Promise<EvalResult> {
  const raw = await reqAuth<{ kind: string; metrics: Record<string, unknown> }>(
    `/api/eval/run?n_per_scenario=${nPerScenario}`,
    { method: "POST" },
  );
  const m = raw.metrics ?? {};
  return {
    kind: String(m.kind ?? raw.kind ?? "synthetic"),
    n_cases: toNum(m.n_cases),
    match_rate: toNum(m.match_rate),
    auto_approve_rate: toNum(m.auto_approve_rate),
    false_approve_rate: toNum(m.false_approve_rate),
    false_approves: toNum(m.false_approves),
    exception_code_accuracy: toNum(m.exception_code_accuracy),
    per_scenario: (m.per_scenario as Record<string, EvalScenario>) ?? {},
  };
}

/**
 * Consume the SSE trace for an invoice. The backend streams its stored
 * audit trail for the invoice, then a `done` event. Calls onEvent for each
 * audit entry. Returns an abort function.
 */
export function streamTrace(
  id: string,
  onEvent: (e: TraceEvent) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): () => void {
  const controller = new AbortController();
  (async () => {
    let res: Response;
    try {
      const streamHeaders: Record<string, string> = { Accept: "text/event-stream" };
      if (accessToken) streamHeaders.Authorization = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}/api/invoices/${encodeURIComponent(id)}/trace`, {
        signal: controller.signal,
        credentials: "include",
        headers: streamHeaders,
      });
    } catch {
      onError("Trace stream unreachable — backend may be down.");
      return;
    }
    if (!res.ok || !res.body) {
      onError(`Trace stream failed (${res.status}).`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLines = chunk
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim());
          if (chunk.includes("event: done")) {
            onDone();
            return;
          }
          if (dataLines.length > 0) {
            try {
              onEvent(JSON.parse(dataLines.join("\n")) as TraceEvent);
            } catch {
              /* ignore a malformed event */
            }
          }
        }
      }
      onDone();
    } catch {
      if (!controller.signal.aborted) onError("Trace stream interrupted.");
    }
  })();
  return () => controller.abort();
}

/* ------------------------------------------------------------------- hook */

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Fetch once on mount (and on refresh). Never throws into the render. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => setData(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Request failed"))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
