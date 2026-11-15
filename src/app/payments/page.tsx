"use client";

import Link from "next/link";
import {
  BackendBanner,
  Card,
  CardHeader,
  EmptyState,
  LiveTag,
  Skeleton,
} from "@/components/ui";
import { commonCurrency, formatDate, money } from "@/lib/format";
import { getPayments, listInvoices, useApi, type ApiPayment } from "@/lib/api";

const payStatus: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  scheduled: { label: "Scheduled", dot: "bg-primary", text: "text-primary-dark", bg: "bg-primary-soft" },
  paid: { label: "Paid", dot: "bg-money-in", text: "text-green-700", bg: "bg-green-50" },
  overdue: { label: "Overdue", dot: "bg-money-out", text: "text-red-700", bg: "bg-red-50" },
};

function PayPill({ status }: { status: string }) {
  const s = payStatus[status] ?? {
    label: status || "Unknown",
    dot: "bg-slate-400",
    text: "text-slate-700",
    bg: "bg-slate-100",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export default function PaymentsPage() {
  const payments = useApi(getPayments);
  const loaded = payments.data !== null;
  const rows: ApiPayment[] = loaded ? (payments.data ?? []) : [];
  const totalScheduled = rows
    .filter((p) => p.status === "scheduled")
    .reduce((s, p) => s + p.amount, 0);
  // Payments carry no currency of their own — each is its invoice's
  // amount. Join the invoice list (read-only) to show each payment
  // in its invoice's currency; the queued total uses that currency
  // only when every scheduled payment shares it, else workspace INR.
  const invList = useApi(listInvoices);
  const invoiceCurrency = new Map((invList.data ?? []).map((i) => [i.id, i.currency]));
  const currencyOf = (p: ApiPayment) => invoiceCurrency.get(p.invoice_id) ?? "INR";
  const scheduledCurrency = commonCurrency(
    rows.filter((p) => p.status === "scheduled").map(currencyOf),
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-semibold leading-[34px] text-ink">Payments</h1>
          {payments.loading ? (
            <Skeleton className="mt-2 h-4 w-80" />
          ) : loaded ? (
            <p className="mt-1 text-sm text-muted">
              Scheduled payouts · {money(totalScheduled, scheduledCurrency)} queued · payments are scheduled, never executed, without human approval
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">Scheduled payouts</p>
          )}
        </div>
        {loaded && <LiveTag />}
      </div>

      <Card className="mt-5">
        <CardHeader title="Payment schedule" />
        {payments.loading ? (
          <div className="space-y-3 px-5 py-4" data-testid="payments-loading">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : payments.error ? (
          <div className="px-5 py-4">
            <BackendBanner message={payments.error} onRetry={payments.refresh} />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-4">
            <EmptyState
              title="No payments scheduled yet"
              body="Approved invoices will appear here once their payments are scheduled."
              ctaLabel="Review approvals"
              ctaHref="/approvals"
            />
          </div>
        ) : (
          <div className="overflow-x-auto px-2 pb-2 pt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Invoice</th>
                  <th className="px-3 py-2 font-medium">Scheduled</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-hairline">
                    <td className="px-3 py-3">
                      <Link
                        href={`/invoices/${p.invoice_id}`}
                        className="font-medium text-primary transition-colors duration-150 ease-out hover:text-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
                      >
                        {p.invoice_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted tnum">{formatDate(p.scheduled_date)}</td>
                    <td className="px-3 py-3 text-right font-medium text-ink tnum">{money(p.amount, currencyOf(p))}</td>
                    <td className="px-3 py-3">
                      <PayPill status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
