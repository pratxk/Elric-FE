import Link from "next/link";

export default function TopBar() {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-page/90 px-8 py-4 backdrop-blur">
      <div className="flex h-10 flex-1 items-center gap-2.5 rounded-lg border border-hairline bg-white px-3.5 text-sm text-muted shadow-card">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="flex-1">Search for anything</span>
        <kbd className="rounded border border-hairline bg-page px-1.5 py-0.5 font-sans text-[11px] text-muted">⌘ K</kbd>
      </div>

      <Link
        href="/inbox"
        className="flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
      >
        Upload Invoice
      </Link>

      <button
        type="button"
        aria-label="Notifications"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-white text-muted shadow-card hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      </button>

      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-dark">
        PS
      </span>
    </header>
  );
}
