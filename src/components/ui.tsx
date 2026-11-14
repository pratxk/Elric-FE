import type { ReactNode } from "react";
import type { ExceptionStatus, ExceptionType, InvoiceStatus } from "@/lib/mock-data";

const statusConfig: Record<InvoiceStatus, { label: string; dot: string; text: string; bg: string }> = {
  received: { label: "Received", dot: "bg-slate-400", text: "text-slate-700", bg: "bg-slate-100" },
  extracted: { label: "Extracted", dot: "bg-sky-500", text: "text-sky-700", bg: "bg-sky-50" },
  validated: { label: "Validated", dot: "bg-sky-500", text: "text-sky-700", bg: "bg-sky-50" },
  matched: { label: "Matched", dot: "bg-primary", text: "text-primary-dark", bg: "bg-primary-soft" },
  approved: { label: "Approved", dot: "bg-money-in", text: "text-green-700", bg: "bg-green-50" },
  flagged: { label: "Flagged", dot: "bg-amber", text: "text-amber-700", bg: "bg-amber-50" },
  on_hold: { label: "On hold", dot: "bg-slate-400", text: "text-slate-700", bg: "bg-slate-100" },
  posted: { label: "Posted", dot: "bg-primary", text: "text-primary-dark", bg: "bg-primary-soft" },
  scheduled: { label: "Scheduled", dot: "bg-primary", text: "text-primary-dark", bg: "bg-primary-soft" },
  paid: { label: "Paid", dot: "bg-money-in", text: "text-green-700", bg: "bg-green-50" },
  duplicate: { label: "Duplicate", dot: "bg-money-out", text: "text-red-700", bg: "bg-red-50" },
  rejected: { label: "Rejected", dot: "bg-money-out", text: "text-red-700", bg: "bg-red-50" },
};

export function StatusPill({ status }: { status: InvoiceStatus }) {
  const c = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

const exceptionConfig: Record<ExceptionType, { label: string; dot: string; text: string; bg: string }> = {
  PRICE_VARIANCE: { label: "Price variance", dot: "bg-amber", text: "text-amber-700", bg: "bg-amber-50" },
  QTY_SHORT: { label: "Qty short", dot: "bg-amber", text: "text-amber-700", bg: "bg-amber-50" },
  DUPLICATE: { label: "Duplicate", dot: "bg-money-out", text: "text-red-700", bg: "bg-red-50" },
  MISSING_PO: { label: "Missing PO", dot: "bg-sky-500", text: "text-sky-700", bg: "bg-sky-50" },
  TAX_MISMATCH: { label: "Tax mismatch", dot: "bg-amber", text: "text-amber-700", bg: "bg-amber-50" },
  TOTAL_MISMATCH: { label: "Total mismatch", dot: "bg-money-out", text: "text-red-700", bg: "bg-red-50" },
};

export function ExceptionPill({ type }: { type: ExceptionType }) {
  const c = exceptionConfig[type];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

const exceptionStatusConfig: Record<ExceptionStatus, { label: string; dot: string; text: string; bg: string }> = {
  open: { label: "Open", dot: "bg-money-out", text: "text-red-700", bg: "bg-red-50" },
  in_review: { label: "In review", dot: "bg-amber", text: "text-amber-700", bg: "bg-amber-50" },
  resolved: { label: "Resolved", dot: "bg-money-in", text: "text-green-700", bg: "bg-green-50" },
};

export function ExceptionStatusPill({ status }: { status: ExceptionStatus }) {
  const c = exceptionStatusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

/** White card with 1px hairline border — the Mercury panel. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-hairline bg-white shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

/** Small "Mock data" tag shown on every mock-driven surface. */
export function MockTag() {
  return (
    <span className="rounded-full border border-hairline bg-page px-2 py-0.5 text-[11px] font-medium text-muted">
      Mock data
    </span>
  );
}

/** Small "Live" tag shown where real API data flows (opposite of MockTag). */
export function LiveTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-money-in" />
      Live
    </span>
  );
}

/** Banner shown when the backend is unreachable — never silently fake data. */
export function BackendBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <span className="h-2 w-2 shrink-0 rounded-full bg-amber" />
      <p className="min-w-0 flex-1 text-amber-800">
        <span className="font-medium">Backend unavailable.</span> Showing demo data instead — start the
        backend (<code className="rounded bg-amber-100 px-1 py-0.5 text-xs">uvicorn app.main:app --port 8000</code>)
        and reload to see live data.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-card ring-1 ring-hairline hover:bg-slate-50"
        >
          Retry
        </button>
      )}
    </div>
  );
}
