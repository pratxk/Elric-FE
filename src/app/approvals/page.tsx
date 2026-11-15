"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BackendBanner,
  BigMoney,
  Card,
  EmptyState,
  LiveTag,
  Skeleton,
  StatusPill,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  ApiError,
  approveInvoice,
  extractionFailureReason,
  getExceptions,
  rejectInvoice,
  useApi,
  type ApiInvoice,
} from "@/lib/api";

type Decision = "approved" | "rejected";

interface ApprovalRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  vendor: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  matchSummary: string;
  status: string;
}

function rowsFromApi(invoices: ApiInvoice[]): ApprovalRow[] {
  return invoices.map((inv) => {
    const codes = [...new Set([...inv.exceptions.map((e) => e.code), ...(inv.match?.exception_codes ?? [])])];
    const failure = extractionFailureReason(inv);
    const matchSummary =
      codes.length > 0
        ? `Match outcome: ${inv.match?.outcome ?? "—"} · ${codes.join(", ")}`
        : inv.match
          ? `Match outcome: ${inv.match.outcome} · no exceptions`
          : failure
            ? `No match data — ${failure} Review the document before deciding.`
            : "No match data yet — extraction has not completed; review the document before deciding.";
    return {
      id: inv.id,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number || inv.id.slice(0, 8),
      vendor: inv.vendor_name || "Unknown vendor",
      amount: inv.total,
      currency: inv.currency,
      dueDate: inv.due_date,
      matchSummary,
      status: inv.status,
    };
  });
}

const approveBtnCls =
  "rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";
const rejectBtnCls =
  "rounded-full bg-white px-4 py-2 text-sm font-medium text-money-out shadow-card ring-1 ring-hairline transition-colors duration-150 ease-out hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";
const reviewLinkCls =
  "rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-card ring-1 ring-hairline transition-colors duration-150 ease-out hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none";

export default function ApprovalsPage() {
  const queue = useApi(getExceptions);
  const loaded = queue.data !== null;
  const rows: ApprovalRow[] = loaded ? rowsFromApi(queue.data ?? []) : [];

  const [decisions, setDecisions] = useState<Record<string, { decision: Decision; status: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pending = rows.filter((r) => !decisions[r.id]);

  const decide = async (row: ApprovalRow, d: Decision) => {
    if (!loaded) return;
    setBusy(row.id);
    setErrors((prev) => ({ ...prev, [row.id]: "" }));
    try {
      const updated =
        d === "approved" ? await approveInvoice(row.invoiceId) : await rejectInvoice(row.invoiceId);
      setDecisions((prev) => ({ ...prev, [row.id]: { decision: d, status: updated.status } }));
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 409
          ? `Cannot ${d === "approved" ? "approve" : "reject"} from its current state — ${e.message}`
          : e instanceof Error
            ? e.message
            : "Decision failed.";
      setErrors((prev) => ({ ...prev, [row.id]: msg }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Approvals</h1>
          {queue.loading ? (
            <Skeleton className="mt-2 h-4 w-80" />
          ) : queue.error !== null ? (
            <p className="mt-1 text-sm text-amber-700">Approval queue unavailable — the backend could not be reached.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {pending.length} invoice{pending.length === 1 ? "" : "s"} waiting on a human decision · decisions
              post to POST /api/invoices/{"{id}"}/approve | reject
            </p>
          )}
        </div>
        {loaded && <LiveTag />}
      </div>

      {queue.error !== null && (
        <BackendBanner message={`Approval queue could not be loaded. ${queue.error}`} onRetry={queue.refresh} />
      )}
      {loaded && (
        <p className="mt-3 text-xs text-muted">
          The API has no separate approvals endpoint — this queue is the flagged / on-hold queue
          (GET /api/queue/exceptions).
        </p>
      )}

      <div className="mt-5 space-y-4">
        {queue.loading ? (
          [0, 1].map((i) => (
            <Card key={i}>
              <div className="flex flex-wrap items-start gap-4 px-5 py-5" aria-hidden="true">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="mt-2 h-4 w-40" />
                  <Skeleton className="mt-2 h-4 w-72" />
                  <Skeleton className="mt-3 h-3 w-32" />
                </div>
                <div className="text-right">
                  <Skeleton className="ml-auto h-6 w-28" />
                  <div className="mt-3 flex gap-2">
                    <Skeleton className="h-9 w-24 rounded-full" />
                    <Skeleton className="h-9 w-20 rounded-full" />
                    <Skeleton className="h-9 w-20 rounded-full" />
                  </div>
                </div>
              </div>
            </Card>
          ))
        ) : queue.error !== null ? (
          <Card>
            <p className="px-5 py-8 text-center text-sm text-amber-700">
              Approval queue could not be loaded. {queue.error}
            </p>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              title="Approval queue is clear"
              body="Nothing is flagged or on hold. Upload an invoice to start the queue."
              ctaHref="/inbox"
              ctaLabel="Upload your first invoice"
            />
          </Card>
        ) : (
          rows.map((a) => {
            const d = decisions[a.id];
            const err = errors[a.id];
            return (
              <Card key={a.id} className={d ? "opacity-70" : ""}>
                <div className="flex flex-wrap items-start gap-4 px-5 py-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/invoices/${a.invoiceId}`}
                        className="text-[15px] font-semibold text-primary transition-colors duration-150 ease-out hover:text-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
                      >
                        {a.invoiceNumber}
                      </Link>
                      {d && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            d.decision === "approved" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${d.decision === "approved" ? "bg-money-in" : "bg-money-out"}`}
                          />
                          {d.decision === "approved" ? "Approved" : "Rejected"}
                        </span>
                      )}
                      {!d && <StatusPill status={a.status} />}
                    </div>
                    <p className="mt-1 text-sm text-ink">{a.vendor}</p>
                    <p className="mt-1 text-sm text-muted">{a.matchSummary}</p>
                    <p className="mt-2 text-xs text-muted">Due {a.dueDate ? formatDate(a.dueDate) : "—"}</p>
                    {err && (
                      <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {err}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold text-ink">
                      <BigMoney amount={a.amount} currency={a.currency} />
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={!!d || busy === a.id}
                        onClick={() => void decide(a, "approved")}
                        className={approveBtnCls}
                      >
                        {busy === a.id ? "Saving…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={!!d || busy === a.id}
                        onClick={() => void decide(a, "rejected")}
                        className={rejectBtnCls}
                      >
                        Reject
                      </button>
                      <Link href={`/invoices/${a.invoiceId}`} className={reviewLinkCls}>
                        Review
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
        {loaded && pending.length === 0 && rows.length > 0 && (
          <Card>
            <p className="px-5 py-8 text-center text-sm text-muted">
              Queue cleared. Reload to fetch the latest queue from the backend.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
