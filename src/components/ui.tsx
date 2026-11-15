import type { ReactNode } from "react";
import Link from "next/link";
import { money } from "@/lib/format";

/**
 * Status vocab, owned here now that the demo-data module is deleted.
 * Values mirror the invoice lifecycle (ARCHITECTURE.md §19i) and the
 * deterministic matcher exception codes (§5). Unknown values from the
 * API render as a neutral pill with the raw code — never crash, never
 * invent a label.
 */
export type InvoiceStatus =
  | "received"
  | "extracted"
  | "validated"
  | "matched"
  | "approved"
  | "flagged"
  | "on_hold"
  | "posted"
  | "scheduled"
  | "paid"
  | "duplicate"
  | "rejected";

export type ExceptionType =
  | "PRICE_VARIANCE"
  | "QTY_SHORT"
  | "DUPLICATE"
  | "MISSING_PO"
  | "TAX_MISMATCH"
  | "TOTAL_MISMATCH";

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

export function StatusPill({ status }: { status: string }) {
  const c = statusConfig[status as InvoiceStatus];
  if (!c) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {status}
      </span>
    );
  }
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

export function ExceptionPill({ type }: { type: string }) {
  const c = exceptionConfig[type as ExceptionType];
  if (!c) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {type}
      </span>
    );
  }
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

/** Small "Live" tag — shown only where data has actually loaded from the API. */
export function LiveTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-money-in" />
      Live
    </span>
  );
}

/**
 * Banner shown when the backend is unreachable. Honest error state —
 * no data is shown behind it, nothing is faked.
 */
export function BackendBanner({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      data-testid="backend-error"
      className="mt-5 flex flex-wrap items-center gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-amber" />
      <p className="min-w-0 flex-1 text-amber-800">
        <span className="font-medium">Backend unavailable.</span>{" "}
        {message ?? "No data is shown — start the backend and retry."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-card ring-1 ring-hairline transition-colors duration-150 ease-out hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Loading skeleton — grey blocks only. Never a number, name or amount.
 * Sizes are fixed to the content they stand in for, so the page does
 * not shift when real data lands. Smooth pulse; no animation at all
 * under prefers-reduced-motion.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={`skeleton animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none ${className}`}
    />
  );
}

/** Honest empty state with a call to action. No numbers, no fake rows. */
export function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div data-testid="empty-state" className="flex flex-col items-center px-5 py-10 text-center">
      <p className="text-[15px] font-semibold tracking-tight text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted">{body}</p>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * Big money figure, Mercury style: the paise render smaller than the
 * rupees (as in the reference balance card), tabular numerals throughout.
 * Renders only a value the caller already loaded from the API.
 * `currency` is the currency of the amount itself (an invoice total is
 * shown in the invoice's currency, never the workspace currency);
 * workspace totals in INR use the default.
 */
export function BigMoney({
  amount,
  currency = "INR",
  className = "",
}: {
  amount: number;
  currency?: string;
  className?: string;
}) {
  const text = money(amount, currency);
  const dot = text.lastIndexOf(".");
  if (dot === -1) {
    return (
      <span data-testid="big-money" className={`tnum ${className}`}>
        {text}
      </span>
    );
  }
  return (
    <span data-testid="big-money" className={`tnum ${className}`}>
      {text.slice(0, dot)}
      <span className="text-[0.55em] font-semibold">{text.slice(dot)}</span>
    </span>
  );
}
