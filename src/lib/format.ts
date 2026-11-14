/** Indian Rupee formatting. All money uses tabular numerals via the `.tnum` class. */

export function inr(amount: number, showPaise = true): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(amount);
}

/** Compact form for big figures, e.g. ₹12.4L / ₹1.2Cr */
export function inrCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(amount / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(amount / 1e3).toFixed(1)}K`;
  return inr(amount, false);
}

export function inrSigned(amount: number): string {
  const sign = amount < 0 ? "−" : amount > 0 ? "+" : "";
  return `${sign}${inr(Math.abs(amount))}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Whole days between an ISO date and today (for exception age). */
export function ageDays(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}
