"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BackendBanner,
  Card,
  CardHeader,
  EmptyState,
  ExceptionPill,
  LiveTag,
  Skeleton,
  StatusPill,
} from "@/components/ui";
import { ageDays, money } from "@/lib/format";
import { extractionFailureReason, getExceptions, useApi, type ApiInvoice } from "@/lib/api";

type FilterType = "all" | string | "UNCLASSIFIED";

const typeFilters: Array<FilterType> = [
  "all",
  "PRICE_VARIANCE",
  "QTY_SHORT",
  "DUPLICATE",
  "MISSING_PO",
  "TAX_MISMATCH",
  "TOTAL_MISMATCH",
  "UNCLASSIFIED",
];

const typeLabels: Record<string, string> = {
  all: "All types",
  PRICE_VARIANCE: "Price variance",
  QTY_SHORT: "Qty short",
  DUPLICATE: "Duplicate",
  MISSING_PO: "Missing PO",
  TAX_MISMATCH: "Tax mismatch",
  TOTAL_MISMATCH: "Total mismatch",
  UNCLASSIFIED: "Unclassified",
};

interface QueueRow {
  key: string;
  invoiceId: string;
  invoiceNumber: string;
  type: string | null;
  vendor: string;
  amount: number;
  currency: string;
  age: number | null;
  status: string;
  summary: string;
}

function rowsFromApi(invoices: ApiInvoice[]): QueueRow[] {
  const rows: QueueRow[] = [];
  for (const inv of invoices) {
    const codes = new Set<string>([
      ...inv.exceptions.map((e) => e.code),
      ...(inv.match?.exception_codes ?? []),
    ]);
    const age = ageDays(inv.invoice_date);
    if (codes.size === 0) {
      const failure = extractionFailureReason(inv);
      rows.push({
        key: `${inv.id}-unclassified`,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number || inv.id.slice(0, 8),
        type: null,
        vendor: inv.vendor_name || "Unknown vendor",
        amount: inv.total,
        currency: inv.currency,
        age,
        status: inv.status,
        summary: failure
          ? `${failure} Needs human review.`
          : "Parked by the pipeline — no typed exception was raised yet. Needs human review.",
      });
      continue;
    }
    for (const code of codes) {
      const exc = inv.exceptions.find((e) => e.code === code);
      rows.push({
        key: `${inv.id}-${code}`,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number || inv.id.slice(0, 8),
        type: code,
        vendor: inv.vendor_name || "Unknown vendor",
        amount: inv.total,
        currency: inv.currency,
        age,
        status: inv.status,
        summary: exc?.message || exc?.root_cause || `Match rule raised ${code}.`,
      });
    }
  }
  return rows;
}

/** Queue status from the invoice lifecycle status the API serves. */
function rowOpenStatus(status: string): "open" | "resolved" {
  return status === "flagged" || status === "on_hold" ? "open" : "resolved";
}

const filterBtnCls = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${
    active ? "bg-primary text-white" : "bg-white text-ink shadow-card ring-1 ring-hairline hover:bg-slate-50"
  }`;

export default function ExceptionsPage() {
  const [type, setType] = useState<FilterType>("all");
  const [status, setStatus] = useState<"all" | "open" | "resolved">("all");

  const queue = useApi(getExceptions);
  const loaded = queue.data !== null;

  const allRows: QueueRow[] = useMemo(
    () => (loaded ? rowsFromApi(queue.data ?? []) : []),
    [loaded, queue.data],
  );

  const rows = useMemo(
    () =>
      allRows.filter(
        (e) =>
          (type === "all" || (type === "UNCLASSIFIED" ? e.type === null : e.type === type)) &&
          (status === "all" || rowOpenStatus(e.status) === status),
      ),
    [allRows, type, status],
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-semibold leading-[34px] text-ink">Exceptions</h1>
          {queue.loading ? (
            <Skeleton className="mt-2 h-4 w-80" />
          ) : queue.error !== null ? (
            <p className="mt-1 text-sm text-amber-700">Exception queue unavailable — the backend could not be reached.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {rows.length} of {allRows.length} exceptions · amounts held until a human clears them · live
              from GET /api/queue/exceptions
            </p>
          )}
        </div>
        {loaded && <LiveTag />}
      </div>

      {queue.error !== null && (
        <BackendBanner message={`Exception queue could not be loaded. ${queue.error}`} onRetry={queue.refresh} />
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {typeFilters.map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={filterBtnCls(type === t)}>
            {typeLabels[t]}
          </button>
        ))}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="ml-auto rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink shadow-card transition-colors duration-150 ease-out hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      {loaded && (
        <p className="mt-3 text-xs text-muted">
          The API tracks queue status only (flagged / on hold) — in-review and resolved states are not served yet, so
          the status filter only separates open from resolved.
        </p>
      )}

      <Card className="mt-4">
        <CardHeader title="Exception queue" />
        <div className="overflow-x-auto px-2 pb-2 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Exception</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-right font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {queue.loading ? (
                [0, 1, 2].map((i) => (
                  <tr key={i} className="border-t border-hairline" aria-hidden="true">
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="mt-1.5 h-3 w-56" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="ml-auto h-4 w-8" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                  </tr>
                ))
              ) : queue.error !== null ? (
                <tr className="border-t border-hairline">
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-amber-700">
                    Exception queue could not be loaded. {queue.error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr className="border-t border-hairline">
                  <td colSpan={6} className="px-3 py-4">
                    <EmptyState
                      title={allRows.length === 0 ? "Exception queue is clear" : "No exceptions match these filters"}
                      body={
                        allRows.length === 0
                          ? "Nothing is flagged or on hold. Upload an invoice to start the queue."
                          : "Try a different type or status filter."
                      }
                      {...(allRows.length === 0
                        ? { ctaHref: "/inbox", ctaLabel: "Upload your first invoice" }
                        : {})}
                    />
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
                  <tr
                    key={e.key}
                    className="border-t border-hairline transition-colors duration-150 ease-out hover:bg-slate-50 motion-reduce:transition-none"
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={`/invoices/${e.invoiceId}`}
                        className="font-medium text-primary transition-colors duration-150 ease-out hover:text-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
                      >
                        {e.invoiceNumber}
                      </Link>
                      <span className="block max-w-md text-xs text-muted">{e.summary}</span>
                    </td>
                    <td className="px-3 py-3">
                      {e.type ? (
                        <ExceptionPill type={e.type} />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Unclassified
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink">{e.vendor}</td>
                    <td className="px-3 py-3 text-right font-medium text-ink tnum">{money(e.amount, e.currency)}</td>
                    <td className="px-3 py-3 text-right text-muted tnum">{e.age === null ? "—" : `${e.age}d`}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={e.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
