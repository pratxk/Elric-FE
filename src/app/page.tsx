"use client";

import Link from "next/link";
import { BackendBanner, Card, CardHeader, LiveTag, MockTag, StatusPill } from "@/components/ui";
import MoneyChart from "@/components/MoneyChart";
import { dashboard, invoices as mockInvoices, moneyMovement, vendors, type InvoiceStatus } from "@/lib/mock-data";
import { ageDays, formatDate, inr, inrCompact } from "@/lib/format";
import { getMetrics, listInvoices, useApi, type ApiInvoice } from "@/lib/api";

const actionPills = [
  { label: "Upload Invoice", href: "/inbox", primary: true },
  { label: "Approve", href: "/approvals", primary: false },
  { label: "Pay", href: "/payments", primary: false },
  { label: "Query Vendor", href: "/exceptions", primary: false },
];

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export default function DashboardPage() {
  const metrics = useApi(getMetrics);
  const invList = useApi(listInvoices);
  const live = metrics.data !== null && invList.data !== null;
  const backendDown = metrics.error !== null && invList.error !== null;

  const m = metrics.data;
  const realInvoices: ApiInvoice[] = invList.data ?? [];

  // Pipeline derived from real by_status + invoice totals (live) or mock.
  const byStatus = m?.by_status ?? {};
  const openCount = live
    ? ["received", "extracted", "validated", "matched", "flagged", "on_hold"].reduce(
        (s, k) => s + (byStatus[k] ?? 0),
        0,
      )
    : dashboard.pipeline.open;
  const paidCount = live ? (byStatus.paid ?? 0) : dashboard.pipeline.paid;
  const openValue = live
    ? realInvoices
        .filter((i) => !["paid", "rejected", "duplicate"].includes(i.status))
        .reduce((s, i) => s + i.total, 0)
    : dashboard.pipeline.openValue;
  const paidValue = live
    ? realInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0)
    : dashboard.pipeline.paidValue;

  const recent = live ? realInvoices.slice(0, 5) : mockInvoices.slice(0, 5);
  const topVendors = [...vendors].sort((a, b) => b.balance - a.balance).slice(0, 5);

  const pendingTotal = live ? (m?.money_in_exceptions_inr ?? 0) : dashboard.pendingApprovalTotal;
  const pendingCount = live ? (m?.exceptions_open ?? 0) : dashboard.pendingApprovalCount;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">
            {pendingCount} invoice{pendingCount === 1 ? "" : "s"} await approval · {inr(pendingTotal)} held in
            exceptions · Nov 2026
          </p>
        </div>
        {live ? <LiveTag /> : <MockTag />}
      </div>

      {backendDown && <BackendBanner onRetry={() => { metrics.refresh(); invList.refresh(); }} />}
      {metrics.loading && invList.loading && (
        <p className="mt-5 text-sm text-muted">Loading live data from the backend…</p>
      )}

      {/* Action pill row */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {actionPills.map((p) => (
          <Link
            key={p.label}
            href={p.href}
            className={
              p.primary
                ? "rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
                : "rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-card ring-1 ring-hairline hover:bg-slate-50"
            }
          >
            {p.label}
          </Link>
        ))}
        <span className="ml-auto text-sm text-muted">Customize</span>
      </div>

      {/* Pending approval + cash position | Vendor balances */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Pending approval"
            action={live ? <LiveTag /> : <MockTag />}
          />
          <div className="px-5 pt-2">
            <p className="text-[32px] font-semibold leading-9 text-ink tnum">{inr(pendingTotal)}</p>
            <div className="mt-2 flex items-center gap-4 text-sm">
              <span className="text-muted">Last 30 days</span>
              <span className="inline-flex items-center gap-1 font-medium text-money-in tnum">
                ↗ {inrCompact(dashboard.moneyIn30d)} in
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-money-out tnum">
                ↘ −{inrCompact(dashboard.moneyOut30d)} out
              </span>
              <MockTag />
            </div>
            <p className="mt-3 text-sm text-muted">
              Cash position <span className="font-medium text-ink tnum">{inr(dashboard.cashPosition)}</span> · HDFC Current A/c ·{" "}
              <span className="text-xs">demo figure</span>
            </p>
          </div>
          <div className="px-5 pb-5 pt-4">
            <MoneyChart labels={moneyMovement.labels} moneyIn={moneyMovement.moneyIn} moneyOut={moneyMovement.moneyOut} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Vendor balances"
            action={
              <span className="flex items-center gap-2">
                <MockTag />
                <Link href="/vendors" className="text-sm font-medium text-primary hover:text-primary-dark">
                  View all
                </Link>
              </span>
            }
          />
          <ul className="px-2 pb-3 pt-2">
            {topVendors.map((v) => (
              <li key={v.id}>
                <Link href="/vendors" className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-dark">
                    {v.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{v.name}</span>
                    <span className="block text-xs text-muted">Reliability {v.reliability}% · {v.openInvoices} open</span>
                  </span>
                  <span className="text-sm font-medium text-ink tnum">{inr(v.balance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Exceptions | Pipeline | Money movement summary */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <Card>
          <CardHeader title="Exceptions" action={live ? <LiveTag /> : <MockTag />} />
          <div className="flex gap-6 px-5 pb-2 pt-3">
            <div>
              <p className="text-xs text-muted">Outstanding</p>
              <p className="mt-0.5 text-xl font-semibold text-ink tnum">
                {live ? (m?.exceptions_open ?? 0) : dashboard.exceptions.outstanding}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Overdue</p>
              <p className="mt-0.5 text-xl font-semibold text-money-out tnum">
                {live ? "—" : dashboard.exceptions.overdue}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Due soon</p>
              <p className="mt-0.5 text-xl font-semibold text-ink tnum">
                {live ? "—" : dashboard.exceptions.dueSoon}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5">
            <span className="text-sm text-muted">
              Queue · <span className="font-medium text-ink tnum">{inr(pendingTotal)}</span> held
            </span>
            <Link href="/exceptions" className="text-sm font-medium text-primary hover:text-primary-dark">
              View →
            </Link>
          </div>
          {live && (
            <p className="border-t border-hairline px-5 py-2 text-xs text-muted">
              Aging breakdown (overdue / due soon) is not served by /api/metrics yet.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Invoice pipeline" action={live ? <LiveTag /> : <MockTag />} />
          <div className="flex gap-6 px-5 pb-2 pt-3">
            <div>
              <p className="text-xs text-muted">Overdue</p>
              <p className="mt-0.5 text-xl font-semibold text-ink tnum">
                {live ? "—" : dashboard.pipeline.overdue} ·{" "}
                <span className="text-base">{live ? "—" : inrCompact(dashboard.pipeline.overdueValue)}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Paid</p>
              <p className="mt-0.5 text-xl font-semibold text-ink tnum">
                {paidCount} · <span className="text-base">{inrCompact(paidValue)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5">
            <span className="text-sm text-muted">
              Open · {openCount} invoices ·{" "}
              <span className="font-medium text-ink tnum">{inrCompact(openValue)}</span>
            </span>
            <Link href="/inbox" className="text-sm font-medium text-primary hover:text-primary-dark">
              View →
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Money movement" action={<MockTag />} />
          <div className="px-5 pb-2 pt-3">
            <p className="text-xs text-muted">Money in · Oct 2026</p>
            <p className="mt-0.5 text-xl font-semibold text-money-in tnum">{inr(dashboard.moneyIn30d)}</p>
            <p className="mt-3 text-xs text-muted">Money out · Oct 2026</p>
            <p className="mt-0.5 text-xl font-semibold text-money-out tnum">−{inr(dashboard.moneyOut30d)}</p>
          </div>
          <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5">
            <span className="text-sm text-muted">Net · <span className="font-medium text-ink tnum">{inr(dashboard.moneyIn30d - dashboard.moneyOut30d)}</span></span>
            <Link href="/payments" className="text-sm font-medium text-primary hover:text-primary-dark">
              View →
            </Link>
          </div>
        </Card>
      </div>

      {/* Recent invoices */}
      <Card className="mt-5">
        <CardHeader
          title="Recent invoices"
          action={
            <span className="flex items-center gap-2">
              {live ? <LiveTag /> : <MockTag />}
              <Link href="/inbox" className="text-sm font-medium text-primary hover:text-primary-dark">
                View all
              </Link>
            </span>
          }
        />
        <div className="overflow-x-auto px-2 pb-2 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {live
                ? realInvoices.slice(0, 5).map((inv) => (
                    <tr key={inv.id} className="border-t border-hairline">
                      <td className="px-3 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-primary hover:text-primary-dark">
                          {shortId(inv.id)}
                        </Link>
                        <span className="block text-xs text-muted">{inv.invoice_number || "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-ink">{inv.vendor_name || "Unknown vendor"}</td>
                      <td className="px-3 py-3 text-muted tnum">{formatDate(inv.invoice_date)}</td>
                      <td className="px-3 py-3 text-right font-medium text-ink tnum">{inr(inv.total)}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={inv.status as InvoiceStatus} />
                      </td>
                    </tr>
                  ))
                : mockInvoices.slice(0, 5).map((inv) => (
                    <tr key={inv.id} className="border-t border-hairline">
                      <td className="px-3 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-primary hover:text-primary-dark">
                          {inv.id}
                        </Link>
                        <span className="block text-xs text-muted">{inv.number}</span>
                      </td>
                      <td className="px-3 py-3 text-ink">{inv.vendor}</td>
                      <td className="px-3 py-3 text-muted tnum">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-3 py-3 text-right font-medium text-ink tnum">{inr(inv.amount)}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={inv.status} />
                      </td>
                    </tr>
                  ))}
              {recent.length === 0 && (
                <tr className="border-t border-hairline">
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                    No invoices yet — upload one from the Inbox.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {live && (
          <p className="border-t border-hairline px-5 py-2 text-xs text-muted">
            {realInvoices.length} invoice{realInvoices.length === 1 ? "" : "s"} in the backend ·{" "}
            {m?.total_invoices ?? 0} total · {m?.auto_approved ?? 0} auto-approved
            {realInvoices.length > 0 && ageDays(realInvoices[0].invoice_date) !== null
              ? ` · newest ${ageDays(realInvoices[0].invoice_date)}d old`
              : ""}
          </p>
        )}
      </Card>
    </div>
  );
}
