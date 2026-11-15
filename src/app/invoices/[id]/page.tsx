"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BackendBanner,
  BigMoney,
  Card,
  CardHeader,
  ExceptionPill,
  LiveTag,
  Skeleton,
  StatusPill,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatDate, money, taxLabel } from "@/lib/format";
import {
  ApiError,
  draftVendorQuery,
  extractionFailureReason,
  getInvoice,
  retryExtraction,
  streamTrace,
  type ApiInvoice,
  type TraceEvent,
} from "@/lib/api";

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** Human label for a stored audit action. */
function traceLabel(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const linkCls =
  "inline-flex items-center gap-0.5 text-sm font-medium text-primary transition-colors duration-150 ease-out hover:text-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none";
const primaryBtnCls =
  "rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 motion-reduce:transition-none";
const secondaryBtnCls =
  "rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-card ring-1 ring-hairline transition-colors duration-150 ease-out hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none";

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const [real, setReal] = useState<ApiInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [traceDone, setTraceDone] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setApiError(null);
    setNotFoundFlag(false);
    getInvoice(params.id)
      .then((inv) => setReal(inv))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          setNotFoundFlag(true);
        } else {
          setApiError(e instanceof Error ? e.message : "Failed to load invoice");
        }
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live trace (SSE) once we have a real invoice.
  useEffect(() => {
    if (!real) return;
    setTraceEvents([]);
    setTraceDone(false);
    setTraceError(null);
    const abort = streamTrace(
      real.id,
      (ev) => setTraceEvents((prev) => [...prev, ev]),
      () => setTraceDone(true),
      (msg) => setTraceError(msg),
    );
    return abort;
  }, [real]);

  if (loading) {
    return (
      <div>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-96" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <div className="space-y-3 px-5 py-5" aria-hidden="true">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </Card>
          <Card>
            <div className="space-y-3 px-5 py-5" aria-hidden="true">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (notFoundFlag) notFound();

  if (apiError !== null || !real) {
    return (
      <div>
        <Link href="/inbox" className={linkCls}>
          <Icon name="chevron-left" size={14} />
          All invoices
        </Link>
        <h1 className="mt-1 text-[28px] font-semibold leading-[34px] text-ink">Invoice not loaded</h1>
        <BackendBanner
          message={`This invoice could not be loaded. ${apiError ?? "Unknown error."}`}
          onRetry={load}
        />
      </div>
    );
  }

  const onDraft = async () => {
    if (!real) return;
    setDraftLoading(true);
    setDraftError(null);
    try {
      const res = await draftVendorQuery(real.id);
      setDraft(res.draft);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Could not draft the vendor query.");
    } finally {
      setDraftLoading(false);
    }
  };

  /** Re-run extraction for a parked invoice. The retry runs in the
   * background — poll until the invoice leaves "received" (or 30s
   * elapse, then the user refreshes). */
  const onRetry = async () => {
    if (!real || retrying) return;
    setRetrying(true);
    setRetryError(null);
    setRetryNote(null);
    try {
      await retryExtraction(real.id);
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await getInvoice(real.id);
        setReal(fresh);
        if (fresh.status !== "received") {
          setRetrying(false);
          return;
        }
      }
      setRetryNote("Still processing — refresh the page to check the result.");
      setRetrying(false);
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "Retry failed.");
      setRetrying(false);
    }
  };

  const inv = real;
  const failureReason = extractionFailureReason(inv);
  const retryable = (inv.status === "on_hold" || inv.status === "flagged") && failureReason !== null;
  const rootCauses = inv.exceptions.map((e) => e.root_cause).filter(Boolean) as string[];
  const subtotal = inv.subtotal;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/inbox" className={linkCls}>
            <Icon name="chevron-left" size={14} />
            All invoices
          </Link>
          <h1 className="mt-1 text-[28px] font-semibold leading-[34px] text-ink">
            {shortId(inv.id)} <span className="font-normal text-muted">· {inv.invoice_number || "no invoice no."}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {inv.vendor_name || "Unknown vendor — extraction pending"} · Invoice {formatDate(inv.invoice_date)} · Due{" "}
            {formatDate(inv.due_date ?? "")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveTag />
          <StatusPill status={inv.status} />
        </div>
      </div>

      {failureReason !== null ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">Extraction did not run</p>
          <p className="mt-1 text-sm leading-6 text-amber-800">{failureReason}</p>
          {retryable && (
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={() => void onRetry()} disabled={retrying} className={primaryBtnCls}>
                {retrying ? "Reprocessing…" : "Retry extraction"}
              </button>
              {retryNote && <span className="text-xs text-amber-800">{retryNote}</span>}
              {retryError && <span className="text-xs text-red-700">{retryError}</span>}
            </div>
          )}
        </div>
      ) : (
        inv.lines.length === 0 &&
        !inv.match && (
          <p className="mt-3 rounded-lg border border-hairline bg-page px-3 py-2 text-xs text-muted">
            Extraction has not run for this invoice yet — vendor, lines and match data will appear once it does.
          </p>
        )
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Document viewer — real lines when present, honest empty state otherwise */}
        <Card>
          <CardHeader
            title="Invoice document"
            action={
              <span className="text-xs text-muted">
                {inv.lines.length > 0 ? "Extracted lines" : "No extracted lines yet — extraction parked"}
              </span>
            }
          />
          <div className="px-5 pb-5 pt-4">
            {inv.lines.length > 0 ? (
              <div className="rounded-lg border border-hairline bg-white p-5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-hairline pb-4">
                  <div>
                    <p className="text-base font-bold text-ink">{inv.vendor_name || "Unknown vendor"}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">Tax Invoice · FY 2026–27</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">Invoice No.</p>
                    <p className="font-semibold text-ink">{inv.invoice_number || "—"}</p>
                    <p className="mt-1 text-xs text-muted">Date {formatDate(inv.invoice_date)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1.5 font-medium">Description</th>
                      <th className="py-1.5 text-right font-medium">Qty</th>
                      <th className="py-1.5 text-right font-medium">Rate</th>
                      <th className="py-1.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lines.map((l) => (
                      <tr key={l.description} className="border-t border-hairline align-top">
                        <td className="py-2 pr-2 text-ink">
                          {l.description}
                          {l.hsn_code && <span className="block text-xs text-muted">HSN {l.hsn_code}</span>}
                        </td>
                        <td className="whitespace-nowrap py-2 text-right tnum">{l.qty}</td>
                        <td className="whitespace-nowrap py-2 pl-2 text-right tnum">{money(l.unit_price, inv.currency)}</td>
                        <td className="whitespace-nowrap py-2 pl-2 text-right font-medium tnum">{money(l.qty * l.unit_price, inv.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <div className="mt-4 space-y-1 border-t border-hairline pt-3 text-right">
                  <p className="text-sm text-muted">
                    Subtotal <span className="ml-6 inline-block w-28 text-ink tnum">{money(subtotal, inv.currency)}</span>
                  </p>
                  <p className="text-sm text-muted">
                    Tax <span className="ml-6 inline-block w-28 text-ink tnum">{money(inv.tax_total, inv.currency)}</span>
                  </p>
                  <p className="text-base font-semibold text-ink">
                    Total <span className="ml-6 inline-block w-28 tnum"><BigMoney amount={inv.total} currency={inv.currency} /></span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-hairline bg-page p-5 text-sm text-muted">
                <p className="font-medium text-ink">No document content extracted yet</p>
                <p className="mt-1 leading-6">
                  The file was stored (hash{" "}
                  <code className="rounded bg-white px-1 py-0.5 text-xs">{(inv.document_hash ?? "").slice(0, 12) || "—"}…</code>)
                  {failureReason ? ` — ${failureReason}` : " — the extractor has not run for this invoice yet."} The
                  invoice is parked as <span className="font-medium text-ink">{inv.status}</span> for human review.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Extracted fields + exceptions */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Extracted fields" />
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
              {[
                ["Vendor", inv.vendor_name || "Not extracted"],
                ["Invoice no.", inv.invoice_number || "—"],
                ["Invoice date", formatDate(inv.invoice_date)],
                ["Due date", formatDate(inv.due_date ?? "")],
                ["PO number", inv.match?.po_id ?? "Not found"],
                ["Subtotal", money(subtotal, inv.currency)],
                [taxLabel(inv.currency), money(inv.tax_total, inv.currency)],
                ["Total", money(inv.total, inv.currency)],
                ["Lines", `${inv.lines.length} line${inv.lines.length === 1 ? "" : "s"}`],
                ["Document hash", inv.document_hash ? `${inv.document_hash.slice(0, 12)}…` : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5 font-medium text-ink tnum">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {inv.exceptions.length > 0 && (
            <Card>
              <CardHeader title="Exceptions" />
              <ul className="space-y-3 px-5 pb-5 pt-3">
                {inv.exceptions.map((e) => (
                  <li key={e.code} className="text-sm">
                    <ExceptionPill type={e.code} />
                    <p className="mt-1 leading-6 text-ink">{e.message}</p>
                    {e.root_cause && <p className="mt-1 text-muted">{e.root_cause}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {rootCauses.length > 0 && (
            <Card>
              <CardHeader title="Exception root cause" />
              {rootCauses.map((rc, i) => (
                <p key={i} className="px-5 pb-5 pt-3 text-sm leading-6 text-ink">
                  {rc}
                </p>
              ))}
            </Card>
          )}
        </div>
      </div>

      {/* 3-way match — real match data when present */}
      <Card className="mt-5">
        <CardHeader
          title="3-way match — Invoice vs PO vs Receipt"
          action={
            inv.match ? (
              <span className="text-sm text-muted">
                Outcome: <span className="font-medium text-ink">{inv.match.outcome}</span>
                {inv.match.exception_codes.length > 0 && ` · ${inv.match.exception_codes.join(", ")}`}
              </span>
            ) : null
          }
        />
        {inv.match ? (
          <div className="overflow-x-auto px-2 pb-2 pt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Rule</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {inv.match.rule_outcomes.map((r) => (
                  <tr
                    key={r.rule}
                    className={`border-t border-hairline transition-colors duration-150 ease-out hover:bg-slate-50 motion-reduce:transition-none ${r.passed ? "" : "bg-amber-50/50"}`}
                  >
                    <td className="px-3 py-3 font-mono text-xs text-ink">{r.rule}</td>
                    <td className="px-3 py-3">
                      {r.passed ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-money-in" /> Passed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted">{r.detail || "—"}</td>
                  </tr>
                ))}
                {inv.match.rule_outcomes.length === 0 && (
                  <tr className="border-t border-hairline">
                    <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted">
                      Match ran but produced no rule outcomes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {inv.match.aligned_pairs.length > 0 && (
              <p className="border-t border-hairline px-5 py-3 text-xs text-muted">
                {inv.match.aligned_pairs.length} line alignment{inv.match.aligned_pairs.length === 1 ? "" : "s"}{" "}
                (Hungarian) — PO {inv.match.po_id ?? "—"} · Receipt {inv.match.gr_id ?? "—"}.
              </p>
            )}
          </div>
        ) : (
          <p className="px-5 pb-5 pt-3 text-sm leading-6 text-muted">
            No match has run for this invoice yet — the matcher needs extracted lines.
            {failureReason ? ` ${failureReason}` : ""}
          </p>
        )}
      </Card>

      {/* Vendor query draft (draft only — never auto-sent) */}
      <Card className="mt-5">
        <CardHeader
          title="Vendor query"
          action={
            <button type="button" onClick={onDraft} disabled={draftLoading} className={primaryBtnCls}>
              {draftLoading ? "Drafting…" : "Draft vendor query"}
            </button>
          }
        />
        {draftError && (
          <p className="mx-5 mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{draftError}</p>
        )}
        {draft ? (
          <div className="px-5 pb-5 pt-3">
            <pre className="whitespace-pre-wrap rounded-lg border border-hairline bg-page p-4 font-sans text-sm leading-6 text-ink">
              {draft}
            </pre>
            <p className="mt-2 text-xs text-muted">Draft only — the backend never sends vendor emails automatically.</p>
          </div>
        ) : (
          <p className="px-5 pb-5 pt-3 text-sm text-muted">
            Drafts a query to the vendor citing the mismatches on this invoice (POST /api/invoices/{shortId(inv.id)}
            /query-vendor). Nothing is sent.
          </p>
        )}
      </Card>

      {/* Live trace (SSE) */}
      <Card className="mt-5">
        <CardHeader
          title="Agent trace"
          action={
            <span className="text-xs text-muted">
              {traceDone ? "Stream complete" : traceError ? "Stream unavailable" : "Streaming…"}
            </span>
          }
        />
        {traceError && (
          <p className="mx-5 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {traceError}
          </p>
        )}
        {traceEvents.length > 0 ? (
          <ol className="space-y-0 px-5 pb-5 pt-3">
            {traceEvents.map((ev, i) => (
              <li key={`${ev.at}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
                {i < traceEvents.length - 1 && (
                  <span className="absolute left-[7px] top-5 h-full w-px bg-hairline" aria-hidden />
                )}
                <span className="relative mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-white bg-money-in shadow-sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {traceLabel(ev.action)}
                    <span className="ml-2 text-xs font-normal text-muted">
                      {ev.actor} · {new Date(ev.at).toLocaleString("en-IN")}
                    </span>
                  </p>
                  {Object.keys(ev.detail).length > 0 && (
                    <p className="mt-0.5 font-mono text-xs text-muted">{JSON.stringify(ev.detail)}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-5 pb-5 pt-3 text-sm text-muted">
            {traceDone
              ? "No audit events recorded for this invoice yet."
              : "Waiting for trace events from GET /api/invoices/{id}/trace (SSE)…"}
          </p>
        )}
      </Card>

      <div className="mt-5 flex gap-2">
        <Link href="/approvals" className={primaryBtnCls}>
          Go to approvals
        </Link>
        <Link href="/exceptions" className={secondaryBtnCls}>
          Back to exceptions
        </Link>
      </div>
    </div>
  );
}
