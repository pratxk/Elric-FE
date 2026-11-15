"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getMetrics, useApi } from "@/lib/api";
import { Icon, type IconName } from "@/components/icons";

interface NavItem {
  label: string;
  href?: string;
  badge?: number;
  soon?: boolean;
  /** Stable hook for the FTUE guided tour (tour.tsx). */
  nav?: string;
  /** Mercury-style icon key — one 18px stroke glyph per item. */
  icon: IconName;
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

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const inner = (
    <>
      <span className={active ? "text-ink" : "text-muted"}>
        <Icon name={item.icon} size={18} />
      </span>
      <span className="flex-1 text-left leading-5">{item.label}</span>
      {item.badge !== undefined && (
        <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-xs font-medium text-ink tnum">
          {item.badge}
        </span>
      )}
      {item.soon && <span className="text-[11px] font-medium text-muted">Soon</span>}
    </>
  );
  // Mercury nav: 12px icon↔label gap, 40px rows, active row is a
  // neutral grey pill (not blue) with dark text.
  const cls = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
    active ? "bg-slate-100 font-medium text-ink" : "text-ink hover:bg-slate-100"
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
    <Link href={item.href} className={cls} onClick={onNavigate} {...navProps}>
      {inner}
    </Link>
  );
}

export default function Sidebar({
  open = false,
  onClose,
}: {
  /** Mobile drawer state — on lg+ the sidebar is always visible. */
  open?: boolean;
  onClose?: () => void;
}) {
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

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-hairline bg-white transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-lg font-bold text-white">
          E
        </span>
        <span className="text-[15px] font-semibold leading-5 text-ink">Elric</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <NavRow key={item.label} item={withLiveBadge(item)} active={isActive(item.href)} onNavigate={onClose} />
          ))}
        </div>

        <p className="px-3 pb-1.5 pt-6 text-xs font-medium text-muted">Workflows</p>
        <div className="space-y-0.5">
          {workflowNav.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(item.href)} onNavigate={onClose} />
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
    </>
  );
}
