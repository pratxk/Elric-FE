"use client";

import Link from "next/link";
import {
  BackendBanner,
  BigMoney,
  Card,
  CardHeader,
  EmptyState,
  LiveTag,
  Skeleton,
  StatusPill,
} from "@/components/ui";
import MoneyChart from "@/components/MoneyChart";
import { ageDays, commonCurrency, formatDate, inr, inrCompact, money, moneyCompact } from "@/lib/format";
import {
  getForecast,
  getMetrics,
  getPayments,
  getVendorSummaries,
  listInvoices,
  listVendors,
  mergeVendorRows,
  useApi,
  type ApiInvoice,
} from "@/lib/api";
import { useMemo } from "react";

/**
 * Dashboard — live API only. Every card gates on its own fetch:
 * skeleton (grey blocks, no numbers) → real data → honest empty state
 * → error state. No number renders before its fetch resolves, and no
 * figure is ever invented. There is no bank feed, so there is no cash
 * position card at all.
 */

const actionPills = [
  { label: "Upload Invoice", href: "/inbox", primary: true },
  { label: "Approve", href: "/approvals", primary: false },
  { label: "Pay", href: "/payments", primary: false },
  { label: "Query Vendor", href: "/exceptions", primary: false },
];

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** Short week label, e.g. "15 Nov". */
function shortWeekLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const linkCls =
  "text-sm font-medium text-primary transition-colors duration-150 ease-out hover:text-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none";

export default function DashboardPage() {
  const metrics = useApi(getMetrics);
  const invList = useApi(listInvoices);
  const vendorList = useApi(getVendorSummaries);
  const vendorRegistry = useApi(listVendors);
  const paymentList = useApi(getPayments);
  const forecast = useApi(getForecast);

  // Vendor balances = registered vendors merged with invoice-derived
  // balances (see mergeVendorRows): a vendor added in onboarding shows
  // here with ₹0.00 even before its first invoice. Invoices supply
  // each vendor's currency, so a USD vendor's balance shows in $.
  const vendorRows = useMemo(
    () =>
      vendorList.data !== null && vendorRegistry.data !== null
        ? mergeVendorRows(vendorRegistry.data, vendorList.data, invList.data ?? [])
        : [],
    [vendorList.data, vendorRegistry.data, invList.data],
  );
  const vendorsLoaded = vendorList.data !== null && vendorRegistry.data !== null;

  const m = metrics.data;
  const realInvoices: ApiInvoice[] = invList.data ?? [];
  const byStatus = m?.by_status ?? {};

  const openInvoices = realInvoices.filter((i) => !["paid", "rejected", "duplicate"].includes(i.status));
  const openCount = openInvoices.length;
  const paidInvoices = realInvoices.filter((i) => i.status === "paid");
  const paidCount = byStatus.paid ?? paidInvoices.length;
  const openValue = openInvoices.reduce((s, i) => s + i.total, 0);
  const paidValue = paidInvoices.reduce((s, i) => s + i.total, 0);

  const pendingTotal = m?.money_in_exceptions_inr ?? 0;
  const pendingCount = m?.exceptions_open ?? 0;

  const payments = paymentList.data ?? [];
  const paidTotal = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const scheduledTotal = payments
    .filter((p) => p.status === "scheduled")
    .reduce((s, p) => s + p.amount, 0);
  // Payments carry no currency of their own — each is its invoice's
  // amount, so the money-movement figures use the invoice currency
  // when every payment in the set shares one, else the workspace INR.
  const invoiceCurrency = new Map(realInvoices.map((i) => [i.id, i.currency]));
  const paidCurrency = commonCurrency(
    payments.filter((p) => p.status === "paid").map((p) => invoiceCurrency.get(p.invoice_id)),
  );
  const scheduledCurrency = commonCurrency(
    payments.filter((p) => p.status === "scheduled").map((p) => invoiceCurrency.get(p.invoice_id)),
  );
  const nextPayment = payments
    .filter((p) => p.status === "scheduled")
    .map((p) => p.scheduled_date)
    .sort()[0];

  const chartLabels = (forecast.data?.weekly_outflows ?? []).map((w) => shortWeekLabel(w.week_start));
  const chartOut = (forecast.data?.weekly_outflows ?? []).map((w) => w.projected_outflow_inr);

  const retryAll = () => {
    metrics.refresh();
    invList.refresh();
    vendorList.refresh();
    vendorRegistry.refresh();
    paymentList.refresh();
    forecast.refresh();
  };
  const anyError =
    metrics.error !== null ||
    invList.error !== null ||
    vendorList.error !== null ||
    vendorRegistry.error !== null ||
    paymentList.error !== null ||
    forecast.error !== null;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Welcome back</h1>
          {metrics.loading ? (
            <Skeleton className="mt-2 h-4 w-72" />
          ) : metrics.error !== null ? (
            <p className="mt-1 text-sm text-amber-700">Summary unavailable — the backend could not be reached.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {pendingCount} invoice{pendingCount === 1 ? "" : "s"} await approval ·{" "}
              <span className="tnum">{money(pendingTotal, m?.money_in_exceptions_currency ?? "INR")}</span> held in exceptions
            </p>
          )}
        </div>
        {metrics.data !== null && <LiveTag />}
      </div>

      {anyError && <BackendBanner onRetry={retryAll} />}

      {/* Action pill row — Mercury: filled primary, flat grey secondaries */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {actionPills.map((p) => (
          <Link
            key={p.label}
            href={p.href}
            className={
              p.primary
                ? "rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
                : "rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-ink transition-colors duration-150 ease-out hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
            }
          >
            {p.label}
          </Link>
        ))}
        <span className="ml-auto text-sm text-muted">Customize</span>
      </div>

      {/* Pending approval | Vendor balances */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Pending approval" action={metrics.data !== null ? <LiveTag /> : undefined} />
          <div className="px-5 pt-2">
            {metrics.loading ? (
              <>
                <Skeleton className="h-9 w-64" />
                <Skeleton className="mt-3 h-4 w-56" />
              </>
            ) : metrics.error !== null ? (
              <p className="py-2 text-sm text-amber-700">
                Pending-approval totals could not be loaded. {metrics.error}
              </p>
            ) : (
              <>
                <p className="text-[32px] font-semibold leading-9 text-ink">
                  <span data-testid="pending-total">
                    <BigMoney amount={pendingTotal} currency={m?.money_in_exceptions_currency ?? "INR"} />
                  </span>
                </p>
                <div className="mt-2 flex items-center gap-4 text-sm">
                  {forecast.loading ? (
                    <Skeleton className="h-4 w-56" />
                  ) : forecast.error !== null ? (
                    <span className="text-muted">Forecast unavailable</span>
                  ) : forecast.data !== null ? (
                    <span className="inline-flex items-center gap-1 font-medium text-money-out tnum">
                      ↘ {inrCompact(forecast.data.total_projected_inr)} projected out · next 4 wks
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
          <div className="px-5 pb-5 pt-4">
            {forecast.loading ? (
              <Skeleton className="h-[180px] w-full" />
            ) : forecast.error !== null ? (
              <p className="py-8 text-center text-sm text-muted">
                Forecast could not be loaded. {forecast.error}
              </p>
            ) : (
              <MoneyChart labels={chartLabels} moneyIn={[]} moneyOut={chartOut} showIn={false} />
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Vendor balances"
            action={
              <span className="flex items-center gap-2">
                {vendorsLoaded && <LiveTag />}
                <Link href="/vendors" className={linkCls}>
                  View all
                </Link>
              </span>
            }
          />
          {vendorList.loading || vendorRegistry.loading ? (
            <ul className="space-y-1 px-2 pb-3 pt-2" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="mt-1.5 h-3 w-24" />
                  </span>
                  <Skeleton className="h-4 w-20" />
                </li>
              ))}
            </ul>
          ) : vendorList.error !== null || vendorRegistry.error !== null ? (
            <p className="px-5 pb-5 pt-3 text-sm text-amber-700">
              Vendor balances could not be loaded. {vendorList.error ?? vendorRegistry.error}
            </p>
          ) : vendorRows.length === 0 ? (
            <EmptyState
              title="No vendors yet"
              body="Vendor balances appear once invoices are uploaded and extracted."
              ctaHref="/inbox"
              ctaLabel="Upload your first invoice"
            />
          ) : (
            <ul data-testid="vendor-balances" className="px-2 pb-3 pt-2">
              {vendorRows.slice(0, 5).map((v) => (
                <li key={v.id}>
                  <Link
                    href="/vendors"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 ease-out hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-dark">
                      {v.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{v.name}</span>
                      <span className="block text-xs text-muted">
                        {v.openCount} open ·{" "}
                        {v.lastInvoiceDate ? `last ${formatDate(v.lastInvoiceDate)}` : "no invoices"}
                      </span>
                    </span>
                    <span data-testid="vendor-balance" className="text-sm font-medium text-ink tnum">
                      {money(v.openBalanceInr, v.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Exceptions | Pipeline | Money movement summary */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <Card>
          <CardHeader title="Exceptions" action={metrics.data !== null ? <LiveTag /> : undefined} />
          {metrics.loading ? (
            <div className="flex gap-6 px-5 pb-5 pt-3">
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-10 w-16" />
            </div>
          ) : metrics.error !== null ? (
            <p className="px-5 pb-5 pt-3 text-sm text-amber-700">Exceptions could not be loaded. {metrics.error}</p>
          ) : (
            <>
              <div className="flex gap-6 px-5 pb-2 pt-3">
                <div>
                  <p className="text-xs text-muted">Outstanding</p>
                  <p className="mt-0.5 text-xl font-semibold text-ink tnum">{m?.exceptions_open ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Overdue</p>
                  <p className="mt-0.5 text-xl font-semibold text-money-out tnum">{m?.overdue_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Due soon</p>
                  <p className="mt-0.5 text-xl font-semibold text-ink tnum">{m?.due_soon_count ?? 0}</p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5">
                <span className="text-sm text-muted">
                  Queue · <span className="font-medium text-ink tnum">{money(pendingTotal, m?.money_in_exceptions_currency ?? "INR")}</span> held
                </span>
                <Link href="/exceptions" className={linkCls}>
                  View →
                </Link>
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Invoice pipeline" action={metrics.data !== null && invList.data !== null ? <LiveTag /> : undefined} />
          {metrics.loading || invList.loading ? (
            <div className="flex gap-6 px-5 pb-5 pt-3">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          ) : metrics.error !== null || invList.error !== null ? (
            <p className="px-5 pb-5 pt-3 text-sm text-amber-700">
              Pipeline could not be loaded. {metrics.error ?? invList.error}
            </p>
          ) : (
            <>
              <div className="flex gap-6 px-5 pb-2 pt-3">
                <div>
                  <p className="text-xs text-muted">Overdue</p>
                  <p className="mt-0.5 text-xl font-semibold text-ink tnum">
                    {m?.overdue_count ?? 0} ·{" "}
                    <span className="text-base">{moneyCompact(m?.overdue_total_inr ?? 0, m?.overdue_total_currency ?? "INR")}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Paid</p>
                  <p className="mt-0.5 text-xl font-semibold text-ink tnum">
                    {paidCount} · <span className="text-base">{moneyCompact(paidValue, commonCurrency(paidInvoices.map((i) => i.currency)))}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5">
                <span className="text-sm text-muted">
                  Open · {openCount} invoice{openCount === 1 ? "" : "s"} ·{" "}
                  <span className="font-medium text-ink tnum">{moneyCompact(openValue, commonCurrency(openInvoices.map((i) => i.currency)))}</span>
                </span>
                <Link href="/inbox" className={linkCls}>
                  View →
                </Link>
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Money movement" action={paymentList.data !== null ? <LiveTag /> : undefined} />
          {paymentList.loading ? (
            <div className="space-y-3 px-5 pb-5 pt-3">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-8 w-40" />
            </div>
          ) : paymentList.error !== null ? (
            <p className="px-5 pb-5 pt-3 text-sm text-amber-700">
              Money movement could not be loaded. {paymentList.error}
            </p>
          ) : (
            <>
              <div className="px-5 pb-2 pt-3">
                <p className="text-xs text-muted">Paid · to date</p>
                <p className="mt-0.5 text-xl font-semibold text-money-in">
                  <BigMoney amount={paidTotal} currency={paidCurrency} />
                </p>
                <p className="mt-3 text-xs text-muted">Scheduled · outstanding</p>
                <p className="mt-0.5 text-xl font-semibold text-money-out">
                  {scheduledTotal > 0 ? "−" : ""}
                  <BigMoney amount={scheduledTotal} currency={scheduledCurrency} />
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5">
                <span className="text-sm text-muted">
                  {payments.length} payment{payments.length === 1 ? "" : "s"}
                  {nextPayment ? (
                    <>
                      {" "}· next <span className="font-medium text-ink tnum">{formatDate(nextPayment)}</span>
                    </>
                  ) : (
                    ""
                  )}
                </span>
                <Link href="/payments" className={linkCls}>
                  View →
                </Link>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Recent invoices */}
      <Card className="mt-5">
        <CardHeader
          title="Recent invoices"
          action={
            <span className="flex items-center gap-2">
              {invList.data !== null && <LiveTag />}
              <Link href="/inbox" className={linkCls}>
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
              {invList.loading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="border-t border-hairline" aria-hidden="true">
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                  </tr>
                ))
              ) : invList.error !== null ? (
                <tr className="border-t border-hairline">
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-amber-700">
                    Invoices could not be loaded. {invList.error}
                  </td>
                </tr>
              ) : realInvoices.length === 0 ? (
                <tr className="border-t border-hairline">
                  <td colSpan={5} className="px-3 py-4">
                    <EmptyState
                      title="No invoices yet"
                      body="Upload your first invoice and the agents will extract, match and queue it."
                      ctaHref="/inbox"
                      ctaLabel="Upload your first invoice"
                    />
                  </td>
                </tr>
              ) : (
                realInvoices.slice(0, 5).map((inv) => (
                  <tr key={inv.id} className="border-t border-hairline transition-colors duration-150 ease-out hover:bg-slate-50 motion-reduce:transition-none">
                    <td className="px-3 py-3">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-medium text-primary transition-colors duration-150 ease-out hover:text-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
                      >
                        {shortId(inv.id)}
                      </Link>
                      <span className="block text-xs text-muted">{inv.invoice_number || "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-ink">{inv.vendor_name || "Unknown vendor"}</td>
                    <td className="px-3 py-3 text-muted tnum">{formatDate(inv.invoice_date)}</td>
                    <td className="px-3 py-3 text-right font-medium text-ink tnum">{money(inv.total, inv.currency)}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={inv.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {invList.data !== null && metrics.data !== null && (
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
