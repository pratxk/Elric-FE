"use client";

import Link from "next/link";
import {
  API_BASE,
  ensureSession,
  getAccessToken,
  useApi,
} from "@/lib/api";
import {
  BackendBanner,
  Card,
  CardHeader,
  EmptyState,
  LiveTag,
  Skeleton,
} from "@/components/ui";
import { formatDate, inr } from "@/lib/format";

interface LedgerEntry {
  id: string;
  invoice_id: string;
  account: string;
  debit: number;
  credit: number;
  posted_at: string;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** GET /api/ledger — no helper exists in api.ts, so fetch directly here
 * (same Bearer-token pattern as the eval page). */
async function fetchLedger(): Promise<LedgerEntry[]> {
  let token = getAccessToken();
  if (!token) {
    await ensureSession();
    token = getAccessToken();
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/ledger`, { headers, credentials: "include" });
  } catch {
    throw new Error("Backend unreachable — is it running?");
  }
  if (!res.ok) {
    let detail = `Ledger request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep the generic message */
    }
    if (res.status === 401) {
      throw new Error("Ledger needs sign-in (401) — session expired.");
    }
    throw new Error(detail);
  }
  const raw = (await res.json()) as Array<Record<string, unknown>>;
  return raw.map((r) => ({
    id: String(r.id ?? ""),
    invoice_id: String(r.invoice_id ?? ""),
    account: String(r.account ?? ""),
    debit: toNum(r.debit),
    credit: toNum(r.credit),
    posted_at: String(r.posted_at ?? ""),
  }));
}

export default function AccountingPage() {
  const ledger = useApi(fetchLedger);
  const loaded = ledger.data !== null;
  const entries: LedgerEntry[] = loaded ? (ledger.data ?? []) : [];
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Accounting</h1>
          <p className="mt-1 text-sm text-muted">
            Ledger entries posted by the Bookkeeper agent · every entry traceable to an approved invoice
          </p>
        </div>
        {loaded && <LiveTag />}
      </div>

      <Card className="mt-5">
        <CardHeader title="General ledger — recent postings" />
        {ledger.loading ? (
          <div className="space-y-3 px-5 py-4" data-testid="accounting-loading">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : ledger.error ? (
          <div className="px-5 py-4">
            <BackendBanner message={ledger.error} onRetry={ledger.refresh} />
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-4">
            <EmptyState
              title="No ledger entries yet"
              body="The Bookkeeper posts balanced entries when invoices are approved."
              ctaLabel="Review approvals"
              ctaHref="/approvals"
            />
          </div>
        ) : (
          <div className="overflow-x-auto px-2 pb-2 pt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Invoice</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 text-right font-medium">Debit</th>
                  <th className="px-3 py-2 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-hairline">
                    <td className="px-3 py-3 text-muted tnum">{formatDate(e.posted_at.slice(0, 10))}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/invoices/${e.invoice_id}`}
                        className="font-medium text-primary transition-colors duration-150 ease-out hover:text-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
                      >
                        {e.invoice_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted">{e.account}</td>
                    <td className="px-3 py-3 text-right tnum">{e.debit > 0 ? inr(e.debit) : "—"}</td>
                    <td className="px-3 py-3 text-right tnum">{e.credit > 0 ? inr(e.credit) : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-hairline font-semibold">
                  <td colSpan={3} className="px-3 py-3 text-ink">Totals (shown entries)</td>
                  <td className="px-3 py-3 text-right text-ink tnum">{inr(totalDebit)}</td>
                  <td className="px-3 py-3 text-right text-ink tnum">{inr(totalCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
