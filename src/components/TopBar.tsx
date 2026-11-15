"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoutUser } from "@/lib/api";
import { Icon } from "@/components/icons";

export default function TopBar({ onMenu }: { onMenu?: () => void }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutUser();
    } catch {
      /* Logout clears the in-memory token regardless; still leave. */
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-page/90 px-4 py-3 backdrop-blur sm:gap-3 sm:px-8 sm:py-4">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onMenu}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink hover:bg-slate-100 lg:hidden"
      >
        <Icon name="menu" size={18} />
      </button>

      <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-hairline bg-white px-3.5 text-sm text-muted">
        <Icon name="search" size={18} />
        <span className="min-w-0 flex-1 truncate leading-5">Search for anything</span>
        <kbd className="hidden rounded border border-hairline bg-page px-1.5 py-0.5 font-sans text-[11px] leading-4 text-muted sm:block">
          ⌘ K
        </kbd>
      </div>

      <Link
        href="/inbox"
        className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-primary px-3.5 text-sm font-medium leading-5 text-white hover:bg-primary-dark sm:px-4"
      >
        <Icon name="upload" size={15} />
        <span className="hidden sm:inline">Upload Invoice</span>
        <span className="sm:hidden">Upload</span>
      </Link>

      <button
        type="button"
        aria-label="Notifications"
        className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-white text-muted hover:text-ink sm:flex"
      >
        <Icon name="bell" size={18} />
      </button>

      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold leading-5 text-primary-dark">
        PS
      </span>

      <button
        type="button"
        onClick={() => void onLogout()}
        disabled={loggingOut}
        className="hidden h-9 shrink-0 items-center rounded-full px-3 text-sm font-medium leading-5 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-60 md:flex"
      >
        {loggingOut ? "Logging out…" : "Log out"}
      </button>
      <button
        type="button"
        aria-label="Log out"
        onClick={() => void onLogout()}
        disabled={loggingOut}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-60 md:hidden"
      >
        <Icon name="log-out" size={18} />
      </button>
    </header>
  );
}
