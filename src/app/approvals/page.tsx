"use client";

import { useState } from "react";
import Link from "next/link";
import { BackendBanner, Card, LiveTag, MockTag, StatusPill } from "@/components/ui";
import { approvals as mockApprovals, type InvoiceStatus } from "@/lib/mock-data";
import { formatDate, inr } from "@/lib/format";
import {
  ApiError,
  approveInvoice,
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
  dueDate: string | null;
  matchSummary: string;
  status: string;
}

function rowsFromApi(invoices: ApiInvoice[]): ApprovalRow[] {
  return invoices.map((inv) => {
    const codes = [...new Set([...inv.exceptions.map((e) => e.code), ...(inv.match?.exception_codes ?? [])])];
    const matchSummary =
      codes.length > 0
        ? `Match outcome: ${inv.match?.outcome ?? "—"} · ${codes.join(", ")}`
        : inv.match
          ? `Match outcome: ${inv.match.outcome} · no exceptions`
          : "No match data — extraction parked (no Gemini key); review the document before deciding.";
    return {
      id: inv.id,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number || inv.id.slice(0, 8),
      vendor: inv.vendor_name || "Unknown vendor",
      amount: inv.total,
      dueDate: inv.due_date,
      matchSummary,
      status: inv.status,
    };
  });
}

export default function ApprovalsPage() {
  const queue = useApi(getExceptions);
  const live = queue.data !== null;

  const [decisions, setDecisions] = useState<Record<string, { decision: Decision; status: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rows: ApprovalRow[] = live
    ? rowsFromApi(queue.data ?? [])
    : mockApprovals.map((a) => ({
        id: a.id,
        invoiceId: a.invoiceId,
        invoiceNumber: a.invoiceNumber,
        vendor: a.vendor,
        amount: a.amount,
        dueDate: a.dueDate,
        matchSummary: a.matchSummary,
        status: "flagged",
      }));

  const pending = rows.filter((r) => !decisions[r.id]);

  const decide = async (row: ApprovalRow, d: Decision) => {
    if (!live) return;
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
          <p className="mt-1 text-sm text-muted">
            {pending.length} invoice{pending.length === 1 ? "" : "s"} waiting on a human decision
            {live
              ? " · decisions post to POST /api/invoices/{id}/approve | reject"
              : " · decisions here are client-side only and reset on reload"}
          </p>
        </div>
        {live ? <LiveTag /> : <MockTag />}
      </div>

      {queue.error !== null && <BackendBanner onRetry={queue.refresh} />}
      {live && (
        <p className="mt-3 text-xs text-muted">
          The API has no separate approvals endpoint — this queue is the flagged / on-hold queue
          (GET /api/queue/exceptions). SLA timers and named approvers are not served yet.
        </p>
      )}

      <div className="mt-5 space-y-4">
        {rows.map((a) => {
          const d = decisions[a.id];
          const err = errors[a.id];
          return (
            <Card key={a.id} className={d ? "opacity-70" : ""}>
              <div className="flex flex-wrap items-start gap-4 px-5 py-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/invoices/${a.invoiceId}`} className="text-[15px] font-semibold text-primary hover:text-primary-dark">
                      {a.invoiceNumber}
                    </Link>
                    {d && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          d.decision === "approved" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${d.decision === "approved" ? "bg-money-in" : "bg-money-out"}`} />
                        {d.decision === "approved" ? "Approved" : "Rejected"}
                      </span>
                    )}
                    {!d && live && <StatusPill status={a.status as InvoiceStatus} />}
                  </div>
                  <p className="mt-1 text-sm text-ink">{a.vendor}</p>
                  <p className="mt-1 text-sm text-muted">{a.matchSummary}</p>
                  <p className="mt-2 text-xs text-muted">
                    Due {a.dueDate ? formatDate(a.dueDate) : "—"}
                    {!live && " · Approver: Finance Head · SLA 18h left"}
                  </p>
                  {err && (
                    <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold text-ink tnum">{inr(a.amount)}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={!!d || busy === a.id || !live}
                      onClick={() => void decide(a, "approved")}
                      className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === a.id ? "Saving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={!!d || busy === a.id || !live}
                      onClick={() => void decide(a, "rejected")}
                      className="rounded-full bg-white px-4 py-2 text-sm font-medium text-money-out shadow-card ring-1 ring-hairline hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <Link
                      href={`/invoices/${a.invoiceId}`}
                      className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-card ring-1 ring-hairline hover:bg-slate-50"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {rows.length === 0 && (
          <Card>
            <p className="px-5 py-8 text-center text-sm text-muted">
              {live ? "Approval queue is clear — nothing flagged or on hold." : "No approvals waiting."}
            </p>
          </Card>
        )}
        {pending.length === 0 && rows.length > 0 && (
          <Card>
            <p className="px-5 py-8 text-center text-sm text-muted">
              Queue cleared. {live ? "Reload to fetch the latest queue from the backend." : "Reload the page to reset the demo decisions."}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
