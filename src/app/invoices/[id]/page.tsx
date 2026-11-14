"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BackendBanner,
  Card,
  CardHeader,
  ExceptionPill,
  LiveTag,
  MockTag,
  StatusPill,
} from "@/components/ui";
import { getInvoice as getMockInvoice, type Invoice as MockInvoice, type InvoiceStatus } from "@/lib/mock-data";
import { formatDate, inr } from "@/lib/format";
import {
  ApiError,
  draftVendorQuery,
  getInvoice,
  streamTrace,
  type ApiInvoice,
  type TraceEvent,
} from "@/lib/api";

const traceDot: Record<string, string> = {
  done: "bg-money-in",
  active: "bg-primary",
  waiting: "bg-slate-300",
  failed: "bg-money-out",
};

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** Human label for a stored audit action. */
function traceLabel(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const [real, setReal] = useState<ApiInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [traceDone, setTraceDone] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const mock = getMockInvoice(params.id);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInvoice(params.id)
      .then((inv) => {
        if (!cancelled) setReal(inv);
      })
      .catch((e: unknown) => {
        if (!cancelled) setApiError(e instanceof Error ? e.message : "Failed to load invoice");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

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
        <p className="mt-5 text-sm text-muted">Loading invoice…</p>
      </div>
    );
  }

  // No real invoice and no mock match → 404.
  if (!real && !mock) notFound();

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

  /* ---------------------------------------------------------- mock render */
  if (!real && mock) return <MockDetail inv={mock} apiError={apiError} />;

  /* ---------------------------------------------------------- real render */
  const inv = real as ApiInvoice;
  const rootCauses = inv.exceptions.map((e) => e.root_cause).filter(Boolean) as string[];
  const subtotal = inv.subtotal;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <Link href="/inbox" className="text-sm font-medium text-primary hover:text-primary-dark">
            ← All invoices
          </Link>
          <h1 className="mt-1 text-[26px] font-semibold leading-8 text-ink">
            {shortId(inv.id)} <span className="font-normal text-muted">· {inv.invoice_number || "no invoice no."}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {inv.vendor_name || "Unknown vendor — extraction pending"} · Invoice {formatDate(inv.invoice_date)} · Due{" "}
            {formatDate(inv.due_date ?? "")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveTag />
          <StatusPill status={inv.status as InvoiceStatus} />
        </div>
      </div>

      {apiError === null && (
        <p className="mt-3 rounded-lg border border-hairline bg-page px-3 py-2 text-xs text-muted">
          Live data from GET /api/invoices/{shortId(inv.id)}. This upload was parked by the backend pipeline —
          with no Gemini key configured, extraction never ran, so vendor, lines and match data are empty until a key
          is set and the invoice is re-processed.
        </p>
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
                <div className="flex items-start justify-between border-b border-hairline pb-4">
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
                        <td className="py-2 text-right tnum">{l.qty}</td>
                        <td className="py-2 text-right tnum">{inr(l.unit_price)}</td>
                        <td className="py-2 text-right font-medium tnum">{inr(l.qty * l.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 space-y-1 border-t border-hairline pt-3 text-right">
                  <p className="text-sm text-muted">
                    Subtotal <span className="ml-6 inline-block w-28 text-ink tnum">{inr(subtotal)}</span>
                  </p>
                  <p className="text-sm text-muted">
                    Tax <span className="ml-6 inline-block w-28 text-ink tnum">{inr(inv.tax_total)}</span>
                  </p>
                  <p className="text-base font-semibold text-ink">
                    Total <span className="ml-6 inline-block w-28 tnum">{inr(inv.total)}</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-hairline bg-page p-5 text-sm text-muted">
                <p className="font-medium text-ink">No document content extracted yet</p>
                <p className="mt-1 leading-6">
                  The file was stored (hash{" "}
                  <code className="rounded bg-white px-1 py-0.5 text-xs">{(inv.document_hash ?? "").slice(0, 12) || "—"}…</code>)
                  but the extractor could not run — no Gemini key is configured on this backend. The invoice is
                  parked as <span className="font-medium text-ink">{inv.status}</span> for human review. The styled
                  document viewer from the demo is kept for mock invoices (e.g. INV-2481).
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Extracted fields + exceptions */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Extracted fields" action={<LiveTag />} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-sm">
              {[
                ["Vendor", inv.vendor_name || "Not extracted"],
                ["Invoice no.", inv.invoice_number || "—"],
                ["Invoice date", formatDate(inv.invoice_date)],
                ["Due date", formatDate(inv.due_date ?? "")],
                ["PO number", inv.match?.po_id ?? "Not found"],
                ["Subtotal", inr(subtotal)],
                ["Tax (GST)", inr(inv.tax_total)],
                ["Total", inr(inv.total)],
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
              <CardHeader title="Exceptions" action={<LiveTag />} />
              <ul className="space-y-3 px-5 pb-5 pt-3">
                {inv.exceptions.map((e) => (
                  <li key={e.code} className="text-sm">
                    {["PRICE_VARIANCE", "QTY_SHORT", "DUPLICATE", "MISSING_PO", "TAX_MISMATCH", "TOTAL_MISMATCH"].includes(e.code) ? (
                      <ExceptionPill type={e.code as never} />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        {e.code}
                      </span>
                    )}
                    <p className="mt-1 leading-6 text-ink">{e.message}</p>
                    {e.root_cause && <p className="mt-1 text-muted">{e.root_cause}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {rootCauses.length > 0 && (
            <Card>
              <CardHeader title="Exception root cause" action={<LiveTag />} />
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
            ) : (
              <LiveTag />
            )
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
                  <tr key={r.rule} className={`border-t border-hairline ${r.passed ? "" : "bg-amber-50/50"}`}>
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
            No match has run for this invoice yet — the matcher needs extracted lines, and extraction is parked
            (no Gemini key). The demo 3-way match table is kept for mock invoices (e.g. INV-2481).
          </p>
        )}
      </Card>

      {/* Vendor query draft (draft only — never auto-sent) */}
      <Card className="mt-5">
        <CardHeader
          title="Vendor query"
          action={
            <button
              type="button"
              onClick={onDraft}
              disabled={draftLoading}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-40"
            >
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
            <span className="flex items-center gap-2">
              <LiveTag />
              <span className="text-xs text-muted">
                {traceDone ? "Stream complete" : traceError ? "Stream unavailable" : "Streaming…"}
              </span>
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
        <Link href="/approvals" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
          Go to approvals
        </Link>
        <Link href="/exceptions" className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-card ring-1 ring-hairline hover:bg-slate-50">
          Back to exceptions
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ mock */

function MockDetail({ inv, apiError }: { inv: MockInvoice; apiError: string | null }) {
  const subtotal = inv.amount - inv.tax;
  const matchedCount = inv.matchRows.filter((r) => r.status === "matched").length;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <Link href="/inbox" className="text-sm font-medium text-primary hover:text-primary-dark">
            ← All invoices
          </Link>
          <h1 className="mt-1 text-[26px] font-semibold leading-8 text-ink">
            {inv.id} <span className="font-normal text-muted">· {inv.number}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {inv.vendor} · GSTIN {inv.gstin} · Invoice {formatDate(inv.invoiceDate)} · Due {formatDate(inv.dueDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MockTag />
          <StatusPill status={inv.status} />
        </div>
      </div>

      {apiError !== null && (
        <p className="mt-3 text-xs text-muted">
          Backend lookup failed ({apiError}) — showing the demo invoice. Start the backend to see live data.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Invoice document" action={<span className="text-xs text-muted">Mock document · not a real PDF</span>} />
          <div className="px-5 pb-5 pt-4">
            <div className="rounded-lg border border-hairline bg-white p-5 text-sm">
              <div className="flex items-start justify-between border-b border-hairline pb-4">
                <div>
                  <p className="text-base font-bold text-ink">{inv.vendor}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    GSTIN {inv.gstin}
                    <br />
                    Tax Invoice · FY 2026–27
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Invoice No.</p>
                  <p className="font-semibold text-ink">{inv.number}</p>
                  <p className="mt-1 text-xs text-muted">Date {formatDate(inv.invoiceDate)}</p>
                </div>
              </div>
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
                        <span className="block text-xs text-muted">HSN {l.hsn}</span>
                      </td>
                      <td className="py-2 text-right tnum">{l.qty}</td>
                      <td className="py-2 text-right tnum">{inr(l.unitPrice)}</td>
                      <td className="py-2 text-right font-medium tnum">{inr(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 space-y-1 border-t border-hairline pt-3 text-right">
                <p className="text-sm text-muted">
                  Subtotal <span className="ml-6 inline-block w-28 text-ink tnum">{inr(subtotal)}</span>
                </p>
                <p className="text-sm text-muted">
                  GST (18%) <span className="ml-6 inline-block w-28 text-ink tnum">{inr(inv.tax)}</span>
                </p>
                <p className="text-base font-semibold text-ink">
                  Total <span className="ml-6 inline-block w-28 tnum">{inr(inv.amount)}</span>
                </p>
              </div>
              <p className="mt-4 text-xs text-muted">
                PO {inv.poNumber ?? "— not on file"} · Payment due {formatDate(inv.dueDate)} · NEFT to vendor account on record.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Extracted fields" action={<span className="text-xs text-muted">Avg confidence 0.97</span>} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-sm">
              {[
                ["Vendor", inv.vendor],
                ["GSTIN", inv.gstin],
                ["Invoice no.", inv.number],
                ["Invoice date", formatDate(inv.invoiceDate)],
                ["Due date", formatDate(inv.dueDate)],
                ["PO number", inv.poNumber ?? "Not found"],
                ["Subtotal", inr(subtotal)],
                ["Tax (GST)", inr(inv.tax)],
                ["Total", inr(inv.amount)],
                ["Lines", `${inv.lines.length} line${inv.lines.length === 1 ? "" : "s"}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5 font-medium text-ink tnum">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {inv.rootCause && (
            <Card>
              <CardHeader title="Exception root cause" />
              <p className="px-5 pb-5 pt-3 text-sm leading-6 text-ink">{inv.rootCause}</p>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="3-way match — Invoice vs PO vs Receipt"
          action={
            <span className="text-sm text-muted">
              {matchedCount} of {inv.matchRows.length} lines matched
            </span>
          }
        />
        <div className="overflow-x-auto px-2 pb-2 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 text-right font-medium">Invoice qty</th>
                <th className="px-3 py-2 text-right font-medium">PO qty</th>
                <th className="px-3 py-2 text-right font-medium">Receipt qty</th>
                <th className="px-3 py-2 text-right font-medium">Invoice price</th>
                <th className="px-3 py-2 text-right font-medium">PO price</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {inv.matchRows.map((r) => (
                <tr key={r.line} className={`border-t border-hairline ${r.status === "variance" ? "bg-amber-50/50" : ""}`}>
                  <td className="px-3 py-3 text-ink">{r.line}</td>
                  <td className="px-3 py-3 text-right tnum">{r.invoiceQty}</td>
                  <td className="px-3 py-3 text-right tnum">{r.poQty}</td>
                  <td className="px-3 py-3 text-right tnum">{r.receiptQty}</td>
                  <td className="px-3 py-3 text-right tnum">{inr(r.invoicePrice)}</td>
                  <td className="px-3 py-3 text-right tnum">{inr(r.poPrice)}</td>
                  <td className={`px-3 py-3 text-right font-mono font-medium tnum ${r.variance === 0 ? "text-muted" : "text-money-out"}`}>
                    {r.variance === 0 ? "₹0.00" : `+${inr(r.variance)}`}
                  </td>
                  <td className="px-3 py-3">
                    {r.status === "matched" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-money-in" /> Matched
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber" /> Variance
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader
          title="Agent trace"
          action={<span className="text-xs text-muted">Mock trace — live SSE stream lands on real invoices</span>}
        />
        <ol className="space-y-0 px-5 pb-5 pt-3">
          {inv.trace.map((s, i) => (
            <li key={s.step} className="relative flex gap-3 pb-5 last:pb-0">
              {i < inv.trace.length - 1 && (
                <span className="absolute left-[7px] top-5 h-full w-px bg-hairline" aria-hidden />
              )}
              <span className={`relative mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-white shadow-sm ${traceDot[s.status]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {s.agent} — {s.step}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {s.status === "done" ? "Done" : s.status === "active" ? "Running…" : s.status === "failed" ? "Failed" : "Waiting"}
                    {s.durationMs !== undefined && s.durationMs > 0 ? ` · ${(s.durationMs / 1000).toFixed(1)}s` : ""}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-5 flex gap-2">
        <Link href="/approvals" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
          Go to approvals
        </Link>
        <Link href="/exceptions" className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-card ring-1 ring-hairline hover:bg-slate-50">
          Back to exceptions
        </Link>
      </div>
    </div>
  );
}
