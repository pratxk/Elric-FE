/** Indian Rupee formatting. All money uses tabular numerals via the `.tnum` class. */

export function inr(amount: number, showPaise = true): string {
  // Intl formats -0 as "-₹0.00" — normalize negative zero to zero so a
  // zero total never renders with a phantom minus sign.
  if (amount === 0) amount = 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(amount);
}

/** Locale per currency for Intl formatting (INR stays en-IN via inr()). */
const CURRENCY_LOCALES: Record<string, string> = {
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
};

/**
 * Symbols the extractor sometimes stores verbatim (the model returns
 * "$", not "USD" — see the eval report's "currency stored
 * un-normalised" note). Map every known symbol/alias to its ISO code
 * so display code never has to guess; unknown codes pass through
 * untouched and `money()` falls back to "CODE 1,234.56" instead of
 * silently relabelling the amount.
 */
const CURRENCY_ALIASES: Record<string, string> = {
  $: "USD",
  "US$": "USD",
  USD: "USD",
  "₹": "INR",
  RS: "INR",
  "RS.": "INR",
  INR: "INR",
  "£": "GBP",
  GBP: "GBP",
  "€": "EUR",
  EUR: "EUR",
};

export function normalizeCurrency(currency: string | undefined | null): string {
  const raw = (currency || "").trim().toUpperCase();
  if (raw === "") return "INR";
  return CURRENCY_ALIASES[raw] ?? raw;
}

/**
 * Currency-aware money formatting. Invoice-linked amounts must use the
 * invoice's own currency (USD → $, GBP → £, INR → ₹) — never the
 * workspace currency. Unknown codes fall back to "CODE 1,234.56"
 * rather than silently relabelling the amount in another currency.
 */
export function money(amount: number, currency = "INR", showPaise = true): string {
  const cur = normalizeCurrency(currency);
  if (cur === "INR") return inr(amount, showPaise);
  if (amount === 0) amount = 0;
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALES[cur] ?? "en-US", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: showPaise ? 2 : 0,
      maximumFractionDigits: showPaise ? 2 : 0,
    }).format(amount);
  } catch {
    return `${cur} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: showPaise ? 2 : 0,
      maximumFractionDigits: showPaise ? 2 : 0,
    })}`;
  }
}

/**
 * The single currency shared by a set of amounts, or `fallback` when
 * they span more than one (or none). Used for sums: a total is only
 * shown in a currency when every amount in it shares that currency —
 * otherwise the workspace currency applies.
 */
export function commonCurrency(
  currencies: Array<string | undefined | null>,
  fallback = "INR",
): string {
  const distinct = [...new Set(currencies.map((c) => normalizeCurrency(c)).filter((c) => c !== ""))];
  return distinct.length === 1 ? distinct[0] : fallback;
}

/**
 * Tax label for an invoice, from its currency — the tax on a US
 * invoice is sales tax, on an Indian invoice GST, on a UK/EU invoice
 * VAT. Never hardcode "Tax (GST)" on invoice-derived views.
 */
export function taxLabel(currency: string): string {
  switch (normalizeCurrency(currency)) {
    case "USD":
      return "Tax (Sales Tax)";
    case "GBP":
    case "EUR":
      return "Tax (VAT)";
    case "INR":
      return "Tax (GST)";
    default:
      return "Tax";
  }
}

/** Compact form for big figures, e.g. ₹12.4L / ₹1.2Cr */
export function inrCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(amount / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(amount / 1e3).toFixed(1)}K`;
  return inr(amount, false);
}

/** Compact form in the amount's own currency, e.g. $12.4K / £1.2M. */
export function moneyCompact(amount: number, currency = "INR"): string {
  const cur = normalizeCurrency(currency);
  if (cur === "INR") return inrCompact(amount);
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALES[cur] ?? "en-US", {
      style: "currency",
      currency: cur,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return money(amount, cur, false);
  }
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
