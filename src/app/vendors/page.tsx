import { Card, CardHeader, MockTag } from "@/components/ui";
import { vendors } from "@/lib/mock-data";
import { formatDate, inr } from "@/lib/format";

function reliabilityStyle(score: number): { bar: string; label: string; text: string } {
  if (score >= 90) return { bar: "bg-money-in", label: "Trusted", text: "text-green-700" };
  if (score >= 80) return { bar: "bg-primary", label: "Good", text: "text-primary-dark" };
  return { bar: "bg-amber", label: "Watch", text: "text-amber-700" };
}

export default function VendorsPage() {
  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Vendors</h1>
          <p className="mt-1 text-sm text-muted">
            {vendors.length} active vendors · reliability feeds auto-approve thresholds — trusted vendors get higher limits
            · no vendor endpoint in the API yet, so this table is demo data
          </p>
        </div>
        <MockTag />
      </div>

      <Card className="mt-5">
        <CardHeader title="All vendors" />
        <div className="overflow-x-auto px-2 pb-2 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">GSTIN</th>
                <th className="px-3 py-2 font-medium">Reliability</th>
                <th className="px-3 py-2 text-right font-medium">On-time</th>
                <th className="px-3 py-2 text-right font-medium">Accuracy</th>
                <th className="px-3 py-2 text-right font-medium">Open</th>
                <th className="px-3 py-2 text-right font-medium">Balance owed</th>
                <th className="px-3 py-2 font-medium">Last invoice</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const r = reliabilityStyle(v.reliability);
                return (
                  <tr key={v.id} className="border-t border-hairline">
                    <td className="px-3 py-3">
                      <span className="font-medium text-ink">{v.name}</span>
                      <span className="block text-xs text-muted">{v.state}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted">{v.gstin}</td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <span className={`block h-full rounded-full ${r.bar}`} style={{ width: `${v.reliability}%` }} />
                        </span>
                        <span className={`text-xs font-medium ${r.text}`}>{v.reliability}% · {r.label}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-ink tnum">{v.onTimePct}%</td>
                    <td className="px-3 py-3 text-right text-ink tnum">{v.accuracyPct}%</td>
                    <td className="px-3 py-3 text-right text-ink tnum">{v.openInvoices}</td>
                    <td className="px-3 py-3 text-right font-medium text-ink tnum">{inr(v.balance)}</td>
                    <td className="px-3 py-3 text-muted tnum">{formatDate(v.lastInvoice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
