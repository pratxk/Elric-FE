"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href?: string;
  badge?: number;
  soon?: boolean;
}

const mainNav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Tasks", href: "/approvals", badge: 4 },
  { label: "Transactions", href: "/inbox" },
  { label: "Payments", href: "/payments" },
  { label: "Cards", soon: true },
  { label: "Capital", soon: true },
  { label: "Accounts", href: "/vendors" },
];

const workflowNav: NavItem[] = [
  { label: "Bill Pay", href: "/exceptions" },
  { label: "Invoicing", href: "/inbox" },
  { label: "Reimbursements", soon: true },
  { label: "Accounting", href: "/accounting" },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const inner = (
    <>
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
  if (item.soon || !item.href) {
    return <span className={cls}>{inner}</span>;
  }
  return (
    <Link href={item.href} className={cls}>
      {inner}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href?: string) =>
    !!href && (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-hairline bg-white">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
          E
        </span>
        <span className="text-[15px] font-semibold text-ink">Elric</span>
        <span className="ml-auto rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-muted">
          Demo
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          {mainNav.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(item.href)} />
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
