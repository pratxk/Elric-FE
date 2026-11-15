"use client";

import { useMemo } from "react";
import { BackendBanner, Card, CardHeader, EmptyState, LiveTag, Skeleton } from "@/components/ui";
import { formatDate, money } from "@/lib/format";
import { getVendorSummaries, listInvoices, listVendors, mergeVendorRows, useApi, type VendorRow } from "@/lib/api";

/**
 * Vendors — live API only, two sources merged (see mergeVendorRows):
 * registry vendors show even with no invoices yet; invoice-only vendors
 * still show with their balance. The backend serves no reliability /
 * on-time / accuracy history, so those columns are gone rather than
 * faked. Loading shows grey skeleton rows; an empty backend shows an
 * honest empty state.
 */
export default function VendorsPage() {
  const registry = useApi(listVendors);
  const summaries = useApi(getVendorSummaries);
  // Invoices supply each vendor's currency (see mergeVendorRows): the
  // backend sums open totals without conversion, so the balance is
  // only meaningful in the currency of the vendor's open invoices.
  const invList = useApi(listInvoices);
  const loading = registry.loading || summaries.loading;
  const error = registry.error ?? summaries.error;
  const loaded = registry.data !== null && summaries.data !== null;

  const vendors: VendorRow[] = useMemo(
    () => (loaded ? mergeVendorRows(registry.data ?? [], summaries.data ?? [], invList.data ?? []) : []),
    [loaded, registry.data, summaries.data, invList.data],
  );

  const refresh = () => {
    registry.refresh();
    summaries.refresh();
    invList.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-semibold leading-[34px] text-ink">Vendors</h1>
          {loading ? (
            <Skeleton className="mt-2 h-4 w-72" />
          ) : error !== null ? (
            <p className="mt-1 text-sm text-amber-700">Vendors unavailable — the backend could not be reached.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {vendors.length} vendor{vendors.length === 1 ? "" : "s"} · balances are open
              (unpaid) invoice totals from the backend; registered vendors show even before their first invoice
            </p>
          )}
        </div>
        {loaded && <LiveTag />}
      </div>

      {error !== null && (
        <BackendBanner message={`Vendors could not be loaded. ${error}`} onRetry={refresh} />
      )}

      <Card className="mt-5">
        <CardHeader title="All vendors" />
        <div className="overflow-x-auto px-2 pb-2 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 text-right font-medium">Open invoices</th>
                <th className="px-3 py-2 text-right font-medium">Balance owed</th>
                <th className="px-3 py-2 font-medium">Last invoice</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="border-t border-hairline" aria-hidden="true">
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="ml-auto h-4 w-8" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="ml-auto h-4 w-24" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  </tr>
                ))
              ) : error !== null ? (
                <tr className="border-t border-hairline">
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-amber-700">
                    Vendors could not be loaded. {error}
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr className="border-t border-hairline">
                  <td colSpan={4} className="px-3 py-4">
                    <EmptyState
                      title="No vendors yet"
                      body="Add a vendor during setup, or upload an invoice — vendor balances appear once invoices are uploaded and extracted."
                      ctaHref="/inbox"
                      ctaLabel="Upload your first invoice"
                    />
                  </td>
                </tr>
              ) : (
                vendors.map((v) => (
                  <tr
                    key={v.id}
                    className="border-t border-hairline transition-colors duration-150 ease-out hover:bg-slate-50 motion-reduce:transition-none"
                  >
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-dark">
                          {v.name.slice(0, 1)}
                        </span>
                        <span>
                          <span className="block font-medium text-ink">{v.name}</span>
                          {!v.registered && (
                            <span className="block text-xs text-muted">From uploaded invoices</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-ink tnum">{v.openCount}</td>
                    <td className="px-3 py-3 text-right font-medium text-ink tnum">
                      <span data-testid="vendor-balance">{money(v.openBalanceInr, v.currency)}</span>
                    </td>
                    <td className="px-3 py-3 text-muted tnum">
                      {v.lastInvoiceDate ? formatDate(v.lastInvoiceDate) : "—"}
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
