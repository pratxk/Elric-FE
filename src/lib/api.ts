/**
 * Typed client for the Elric backend API (ARCHITECTURE.md §8).
 *
 * Base URL: NEXT_PUBLIC_API_URL when set (direct calls — the backend then
 * needs CORS enabled). When unset, calls go same-origin and Next.js
 * rewrites /api/* to the backend (API_URL env, default
 * http://localhost:8000 — see next.config.mjs). The backend ships no CORS
 * middleware, so the same-origin proxy is the default local path.
 *
 * The frontend never calls Gemini itself. The backend only calls Gemini
 * during extraction; with no key configured it parks uploads as flagged
 * instead — that is the honest behaviour this client surfaces.
 */
import { useCallback, useEffect, useState } from "react";

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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Accept: "application/json" },
    });
  } catch {
    throw new ApiError(0, "Backend unreachable — is it running on port 8000?");
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
}

export interface ApiMetrics {
  total_invoices: number;
  by_status: Record<string, number>;
  exceptions_open: number;
  money_in_exceptions_inr: number;
  auto_approved: number;
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
    currency: String(raw.currency ?? "INR"),
    status: String(raw.status ?? ""),
    subtotal: toNum(raw.subtotal),
    tax_total: toNum(raw.tax_total),
    total: toNum(raw.total),
    document_hash: (raw.document_hash as string | null) ?? null,
    lines,
    match,
    exceptions,
  };
}

/* -------------------------------------------------------------- endpoints */

export async function getHealth(): Promise<{ status: string }> {
  // /health is proxied to the backend by next.config.mjs, like /api/*.
  return req<{ status: string }>("/health");
}

export async function getMetrics(): Promise<ApiMetrics> {
  const raw = await req<Record<string, unknown>>("/api/metrics");
  return {
    total_invoices: toNum(raw.total_invoices),
    by_status: (raw.by_status as Record<string, number>) ?? {},
    exceptions_open: toNum(raw.exceptions_open),
    money_in_exceptions_inr: toNum(raw.money_in_exceptions_inr),
    auto_approved: toNum(raw.auto_approved),
  };
}

export async function listInvoices(status?: string): Promise<ApiInvoice[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const raw = await req<Array<Record<string, unknown>>>(`/api/invoices${q}`);
  return raw.map(normalizeInvoice);
}

export async function getInvoice(id: string): Promise<ApiInvoice> {
  return normalizeInvoice(await req<Record<string, unknown>>(`/api/invoices/${encodeURIComponent(id)}`));
}

export async function uploadInvoice(file: File): Promise<ApiInvoice> {
  const form = new FormData();
  form.append("file", file);
  return normalizeInvoice(
    await req<Record<string, unknown>>("/api/invoices/upload", {
      method: "POST",
      body: form,
    }),
  );
}

export async function approveInvoice(id: string, reason = ""): Promise<ApiInvoice> {
  return normalizeInvoice(
    await req<Record<string, unknown>>(`/api/invoices/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approver: "ap_clerk", reason }),
    }),
  );
}

export async function rejectInvoice(id: string, reason = ""): Promise<ApiInvoice> {
  return normalizeInvoice(
    await req<Record<string, unknown>>(`/api/invoices/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approver: "ap_clerk", reason }),
    }),
  );
}

export async function draftVendorQuery(id: string): Promise<{ invoice_id: string; draft: string; sent: boolean }> {
  return req<{ invoice_id: string; draft: string; sent: boolean }>(
    `/api/invoices/${encodeURIComponent(id)}/query-vendor`,
    { method: "POST" },
  );
}

export async function getExceptions(): Promise<ApiInvoice[]> {
  const raw = await req<Array<Record<string, unknown>>>("/api/queue/exceptions");
  return raw.map(normalizeInvoice);
}

export async function runEval(nPerScenario = 2): Promise<EvalResult> {
  const raw = await req<{ kind: string; metrics: Record<string, unknown> }>(
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
      res = await fetch(`${API_BASE}/api/invoices/${encodeURIComponent(id)}/trace`, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
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
