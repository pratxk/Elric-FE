import { Card, CardHeader, MockTag } from "@/components/ui";
import { ledgerEntries } from "@/lib/mock-data";
import { formatDate, inr } from "@/lib/format";

export default function AccountingPage() {
  const totalDebit = ledgerEntries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = ledgerEntries.reduce((s, e) => s + e.credit, 0);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Accounting</h1>
          <p className="mt-1 text-sm text-muted">
            Ledger entries posted by the Bookkeeper agent · every entry traceable to an approved invoice
          </p>
        </div>
        <MockTag />
      </div>

      <Card className="mt-5">
        <CardHeader title="General ledger — recent postings" />
        <div className="overflow-x-auto px-2 pb-2 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Debit</th>
                <th className="px-3 py-2 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {ledgerEntries.map((e) => (
                <tr key={e.id} className="border-t border-hairline">
                  <td className="px-3 py-3 text-muted tnum">{formatDate(e.date)}</td>
                  <td className="px-3 py-3 text-ink">{e.description}</td>
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
      </Card>
    </div>
  );
}
