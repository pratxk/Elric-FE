"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMetrics, useApi } from "@/lib/api";

interface NavItem {
  label: string;
  href?: string;
  badge?: number;
  soon?: boolean;
  /** Stable hook for the FTUE guided tour (tour.tsx). */
  nav?: string;
  /** Mercury-style icon key (16px stroke icon, one per item). */
  icon: string;
}

/** Simple 16px stroke icons matching Mercury's sidebar set (house,
 * clipboard, list, swap arrows, card, chart, bank, envelope, receipt,
 * cash, book, gear). Inline SVG, currentColor, no icon dependency. */
function NavIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4.5V3h6v1.5" />
          <path d="m9 13 2 2 4-4" />
        </svg>
      );
    case "transactions":
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
        </svg>
      );
    case "payments":
      return (
        <svg {...common}>
          <path d="M4 7h13l-3-3M20 17H7l3 3" />
        </svg>
      );
    case "cards":
      return (
        <svg {...common}>
          <rect x="2.5" y="5" width="19" height="14" rx="2" />
          <path d="M2.5 10h19" />
          <path d="M6 15h4" />
        </svg>
      );
    case "capital":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="m7 14 4-4 3 3 5-6" />
        </svg>
      );
    case "accounts":
      return (
        <svg {...common}>
          <path d="M3 9.5 12 4l9 5.5" />
          <path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9" />
          <path d="M3 21h18" />
        </svg>
      );
    case "billpay":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3.5 7 8.5 6 8.5-6" />
        </svg>
      );
    case "invoicing":
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
      );
    case "reimbursements":
      return (
        <svg {...common}>
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M5.5 9.5h.01M18.5 14.5h.01" />
        </svg>
      );
    case "accounting":
      return (
        <svg {...common}>
          <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13" />
          <path d="M9 7h6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.36.95a7 7 0 0 0-2.42-1.4L13.7 2.6h-3.4l-.38 2.54a7 7 0 0 0-2.42 1.4l-2.36-.95-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .48.05.94.14 1.4l-2 1.55 2 3.46 2.36-.95a7 7 0 0 0 2.42 1.4l.38 2.54h3.4l.38-2.54a7 7 0 0 0 2.42-1.4l2.36.95 2-3.46-2-1.55c.09-.46.14-.92.14-1.4Z" />
        </svg>
      );
    default:
      return null;
  }
}

const mainNav: NavItem[] = [
  { label: "Home", href: "/", nav: "dashboard", icon: "home" },
  { label: "Tasks", href: "/approvals", nav: "approvals", icon: "tasks" },
  { label: "Transactions", href: "/inbox", nav: "inbox", icon: "transactions" },
  { label: "Payments", href: "/payments", icon: "payments" },
  { label: "Cards", soon: true, icon: "cards" },
  { label: "Capital", soon: true, icon: "capital" },
  { label: "Accounts", href: "/vendors", icon: "accounts" },
  { label: "Settings", href: "/settings", nav: "settings", icon: "settings" },
];

const workflowNav: NavItem[] = [
  { label: "Bill Pay", href: "/exceptions", nav: "exceptions", icon: "billpay" },
  { label: "Invoicing", href: "/inbox", icon: "invoicing" },
  { label: "Reimbursements", soon: true, icon: "reimbursements" },
  { label: "Accounting", href: "/accounting", icon: "accounting" },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const inner = (
    <>
      <span className="shrink-0 text-muted">
        <NavIcon name={item.icon} />
      </span>
      <span className="flex-1 text-left">{item.label}</span>
      {item.badge !== undefined && (
        <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary-dark tnum">
          {item.badge}
        </span>
      )}
      {item.soon && <span className="text-[11px] font-medium text-muted">Soon</span>}
    </>
  );
  const cls = `flex w-full items-center rounded-lg px-3 py-2 text-sm ${
    active
      ? "bg-primary-soft font-medium text-primary-dark"
      : "text-ink hover:bg-slate-100"
  } ${item.soon ? "cursor-default text-muted" : ""}`;
  const navProps = item.nav ? { "data-nav": item.nav } : {};
  if (item.soon || !item.href) {
    return (
      <span className={cls} {...navProps}>
        {inner}
      </span>
    );
  }
  return (
    <Link href={item.href} className={cls} {...navProps}>
      {inner}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  // Tasks badge = real open-exception count from the API. No badge while
  // loading or on error — never a placeholder number.
  const metrics = useApi(getMetrics);
  const tasksCount =
    metrics.data !== null && !metrics.loading ? metrics.data.exceptions_open : null;
  const withLiveBadge = (item: NavItem): NavItem =>
    item.label === "Tasks" && tasksCount !== null && tasksCount > 0
      ? { ...item, badge: tasksCount }
      : { ...item, badge: undefined };
  const isActive = (href?: string) =>
    !!href && (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-hairline bg-white">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
          E
        </span>
        <span className="text-[15px] font-semibold text-ink">Elric</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <NavRow key={item.label} item={withLiveBadge(item)} active={isActive(item.href)} />
          ))}
        </div>

        <p className="px-3 pb-1.5 pt-6 text-xs font-medium text-muted">Workflows</p>
        <div className="space-y-0.5">
          {workflowNav.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(item.href)} />
          ))}
        </div>

        <div className="mt-6 rounded-card border border-hairline bg-page p-3.5">
          <p className="text-xs font-semibold text-ink">Equivalent Exchange</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            What you pay must equal what you received — every invoice matched 3-way before it posts.
          </p>
        </div>
      </nav>

      <div className="border-t border-hairline px-5 py-3.5">
        <p className="text-xs text-muted">AP workspace · FY 2026–27</p>
      </div>
    </aside>
  );
}
