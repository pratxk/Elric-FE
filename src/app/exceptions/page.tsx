"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BackendBanner, Card, CardHeader, ExceptionPill, ExceptionStatusPill, LiveTag, MockTag, StatusPill } from "@/components/ui";
import { exceptions as mockExceptions, type ExceptionStatus, type ExceptionType, type InvoiceStatus } from "@/lib/mock-data";
import { ageDays, inr } from "@/lib/format";
import { getExceptions, useApi, type ApiInvoice } from "@/lib/api";

type FilterType = "all" | ExceptionType | "UNCLASSIFIED";

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
  type: ExceptionType | null;
  vendor: string;
  amount: number;
  age: number | null;
  status: string;
  excStatus?: ExceptionStatus; // mock-only: open / in_review / resolved
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
      rows.push({
        key: `${inv.id}-unclassified`,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number || inv.id.slice(0, 8),
        type: null,
        vendor: inv.vendor_name || "Unknown vendor",
        amount: inv.total,
        age,
        status: inv.status,
        summary:
          "Parked by the pipeline — extraction unavailable (no Gemini key), so no typed exception was raised yet. Needs human review.",
      });
      continue;
    }
    for (const code of codes) {
      const exc = inv.exceptions.find((e) => e.code === code);
      rows.push({
        key: `${inv.id}-${code}`,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number || inv.id.slice(0, 8),
        type: code as ExceptionType,
        vendor: inv.vendor_name || "Unknown vendor",
        amount: inv.total,
        age,
        status: inv.status,
        summary: exc?.message || exc?.root_cause || `Match rule raised ${code}.`,
      });
    }
  }
  return rows;
}

export default function ExceptionsPage() {
  const [type, setType] = useState<FilterType>("all");
  const [status, setStatus] = useState<"all" | "open" | "in_review" | "resolved">("all");

  const queue = useApi(getExceptions);
  const live = queue.data !== null;

  const allRows: QueueRow[] = useMemo(() => {
    if (!live) {
      return mockExceptions.map((e) => ({
        key: e.id,
        invoiceId: e.invoiceId,
        invoiceNumber: e.invoiceNumber,
        type: e.type,
        vendor: e.vendor,
        amount: e.amount,
        age: e.ageDays,
        status: e.status === "resolved" ? "approved" : "flagged",
        excStatus: e.status,
        summary: e.summary,
      }));
    }
    return rowsFromApi(queue.data ?? []);
  }, [live, queue.data]);

  const rows = useMemo(
    () =>
      allRows.filter((e) => {
        const rowStatus =
          e.excStatus ?? (e.status === "flagged" || e.status === "on_hold" ? "open" : "resolved");
        return (
          (type === "all" || (type === "UNCLASSIFIED" ? e.type === null : e.type === type)) &&
          (status === "all" || rowStatus === status)
        );
      }),
    [allRows, type, status],
  );

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Exceptions</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} of {allRows.length} exceptions · amounts held until a human clears them
            {live ? " · live from GET /api/queue/exceptions" : ""}
          </p>
        </div>
        {live ? <LiveTag /> : <MockTag />}
      </div>

      {queue.error !== null && <BackendBanner onRetry={queue.refresh} />}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {typeFilters.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
              type === t ? "bg-primary text-white" : "bg-white text-ink shadow-card ring-1 ring-hairline hover:bg-slate-50"
            }`}
          >
            {typeLabels[t]}
          </button>
        ))}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="ml-auto rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink shadow-card"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_review">In review</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      {live && (
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
              {rows.map((e) => (
                <tr key={e.key} className="border-t border-hairline hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <Link href={`/invoices/${e.invoiceId}`} className="font-medium text-primary hover:text-primary-dark">
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
                  <td className="px-3 py-3 text-right font-medium text-ink tnum">{inr(e.amount)}</td>
                  <td className="px-3 py-3 text-right text-muted tnum">{e.age === null ? "—" : `${e.age}d`}</td>
                  <td className="px-3 py-3">
                    {!live && e.excStatus ? (
                      <ExceptionStatusPill status={e.excStatus} />
                    ) : (
                      <StatusPill status={e.status as InvoiceStatus} />
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr className="border-t border-hairline">
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                    {live ? "Exception queue is clear — nothing flagged or on hold." : "No exceptions match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
