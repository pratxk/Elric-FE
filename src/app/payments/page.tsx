import Link from "next/link";
import { Card, CardHeader, MockTag } from "@/components/ui";
import { scheduledPayments } from "@/lib/mock-data";
import { formatDate, inr } from "@/lib/format";

const payStatus = {
  scheduled: { label: "Scheduled", dot: "bg-primary", text: "text-primary-dark", bg: "bg-primary-soft" },
  paid: { label: "Paid", dot: "bg-money-in", text: "text-green-700", bg: "bg-green-50" },
  overdue: { label: "Overdue", dot: "bg-money-out", text: "text-red-700", bg: "bg-red-50" },
} as const;

export default function PaymentsPage() {
  const totalScheduled = scheduledPayments
    .filter((p) => p.status === "scheduled")
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Payments</h1>
          <p className="mt-1 text-sm text-muted">
            Scheduled payouts · {inr(totalScheduled)} queued · payments are scheduled, never executed, without human approval
          </p>
        </div>
        <MockTag />
      </div>

      <Card className="mt-5">
        <CardHeader title="Payment schedule" />
        <div className="overflow-x-auto px-2 pb-2 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">Scheduled</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {scheduledPayments.map((p) => {
                const s = payStatus[p.status];
                return (
                  <tr key={p.id} className="border-t border-hairline">
                    <td className="px-3 py-3">
                      <Link href={`/invoices/${p.invoiceId}`} className="font-medium text-primary hover:text-primary-dark">
                        {p.invoiceId}
                      </Link>
                      {p.discountNote && <span className="block text-xs text-muted">{p.discountNote}</span>}
                    </td>
                    <td className="px-3 py-3 text-ink">{p.vendor}</td>
                    <td className="px-3 py-3 text-muted tnum">{formatDate(p.scheduledDate)}</td>
                    <td className="px-3 py-3 text-muted">{p.method}</td>
                    <td className="px-3 py-3 text-right font-medium text-ink tnum">{inr(p.amount)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                    </td>
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
