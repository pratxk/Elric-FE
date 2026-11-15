"use client";

import { Icon } from "@/components/icons";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { ApiError, completeOnboarding, ensureSession, getMe, type ApiUser } from "@/lib/api";

/* ------------------------------------------------------------------ keys */

const DEFERRED_KEY = "elric_onboarding_deferred";
const TOUR_PENDING_KEY = "elric_tour_pending";
const TOUR_SEEN_KEY = "elric_tour_seen";
export const TOUR_REPLAY_EVENT = "elric:replay-tour";

/** Called by the onboarding wizard when the user skips steps 2–4. */
export function deferOnboarding(): void {
  try {
    sessionStorage.setItem(DEFERRED_KEY, "1");
  } catch {
    /* storage unavailable — the guard will re-route to onboarding instead */
  }
}

/** Called when onboarding finishes, so the tour starts on the dashboard. */
export function markTourPending(): void {
  try {
    localStorage.setItem(TOUR_PENDING_KEY, "1");
  } catch {
    /* storage unavailable — no tour, nothing breaks */
  }
}

/** Called from Settings ("Replay tour"). */
export function requestTourReplay(): void {
  try {
    localStorage.removeItem(TOUR_SEEN_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(TOUR_REPLAY_EVENT));
}

/* ------------------------------------------------------------------ tour */

const TOUR_STEPS: Array<{ nav: string; title: string; body: string }> = [
  {
    nav: "dashboard",
    title: "Dashboard",
    body: "Pending approvals and exceptions at a glance — start here each morning.",
  },
  {
    nav: "inbox",
    title: "Inbox",
    body: "Upload invoices, POs and receipts here — agents extract the fields and match them 3-way.",
  },
  {
    nav: "exceptions",
    title: "Exceptions",
    body: "Invoices that didn't match cleanly land here, with the reason and a suggested fix.",
  },
  {
    nav: "approvals",
    title: "Approvals",
    body: "Clean matches waiting for your sign-off — approve, reject, or ask the vendor.",
  },
];

function TourOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-nav="${TOUR_STEPS[step].nav}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const finish = () => {
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "1");
      localStorage.removeItem(TOUR_PENDING_KEY);
    } catch {
      /* ignore */
    }
    onDone();
  };

  const current = TOUR_STEPS[step];
  const tipTop = rect ? Math.max(16, Math.min(rect.top - 8, window.innerHeight - 190)) : 120;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Elric guided tour">
      {/* Dim everything except the highlighted nav item. */}
      <div className="absolute inset-0 bg-ink/40 transition-opacity duration-200" onClick={finish} />
      {rect && (
        <div
          className="absolute rounded-lg bg-transparent ring-2 ring-primary transition-all duration-200"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div
        className="absolute w-80 rounded-card border border-hairline bg-white p-5 shadow-card transition-all duration-200"
        style={{ top: tipTop, left: 272 }}
      >
        <p className="text-label uppercase tracking-wide text-muted">
          Step {step + 1} of {TOUR_STEPS.length}
        </p>
        <h3 className="mt-1 text-section-title text-ink">{current.title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted">{current.body}</p>
        <div className="mt-4 flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="rounded-full bg-white px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-hairline hover:bg-slate-50"
            >
              Back
            </button>
          )}
          {step < TOUR_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Done
            </button>
          )}
          <button type="button" onClick={finish} className="ml-auto text-sm font-medium text-muted hover:text-ink">
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- skeleton */

/** Neutral loading skeleton while the session is being checked — no numbers, no data. */
function AuthSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-60 shrink-0 border-r border-hairline bg-white px-3 py-5 lg:block">
        <div className="skeleton h-9 w-32" />
        <div className="mt-8 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 px-4 py-4 sm:px-8">
        <div className="skeleton h-10 w-full" />
        <div className="mx-auto mt-6 max-w-6xl space-y-5">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-40 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- auth shell */

const PUBLIC_ROUTES = ["/login", "/register"];

export function AuthShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "authed" | "public">("checking");
  const [user, setUser] = useState<ApiUser | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  // Mobile nav drawer — the sidebar is a slide-over below lg.
  const [navOpen, setNavOpen] = useState(false);
  const checkedFor = useRef<string>("");

  useEffect(() => {
    if (checkedFor.current === pathname && status !== "checking") return;
    checkedFor.current = pathname;
    let cancelled = false;

    const isPublic = PUBLIC_ROUTES.includes(pathname);
    (async () => {
      // Silent refresh first when there is no access token in memory —
      // this is how a session survives a page reload.
      const hasSession = await ensureSession();
      if (!hasSession) {
        if (cancelled) return;
        if (isPublic) {
          setStatus("public");
        } else {
          router.replace("/login");
        }
        return;
      }
      let me: ApiUser;
      try {
        me = await getMe();
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          if (isPublic) setStatus("public");
          else router.replace("/login");
        } else {
          // Backend unreachable etc. — show the app shell; pages surface
          // the backend error honestly instead of trapping the user.
          setStatus(isPublic ? "public" : "authed");
        }
        return;
      }
      if (cancelled) return;
      setUser(me);
      if (isPublic) {
        router.replace(me.onboarding_completed ? "/" : "/onboarding");
        return;
      }
      if (!me.onboarding_completed && pathname !== "/onboarding") {
        let deferred = false;
        try {
          deferred = sessionStorage.getItem(DEFERRED_KEY) === "1";
        } catch {
          deferred = false;
        }
        if (!deferred) {
          router.replace("/onboarding");
          return;
        }
        setShowBanner(true);
      }
      if (me.onboarding_completed && pathname === "/onboarding") {
        router.replace("/");
        return;
      }
      setStatus("authed");
      // Tour: queued by onboarding completion, once; replayable from Settings.
      if (pathname === "/") {
        try {
          if (
            localStorage.getItem(TOUR_PENDING_KEY) === "1" &&
            localStorage.getItem(TOUR_SEEN_KEY) !== "1"
          ) {
            setShowTour(true);
          }
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // "Replay tour" from Settings.
  useEffect(() => {
    const onReplay = () => setShowTour(true);
    window.addEventListener(TOUR_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, onReplay);
  }, []);

  const dismissBanner = async () => {
    setBannerBusy(true);
    try {
      await completeOnboarding();
      try {
        sessionStorage.removeItem(DEFERRED_KEY);
      } catch {
        /* ignore */
      }
      setShowBanner(false);
      setUser((u) => (u ? { ...u, onboarding_completed: true } : u));
    } catch {
      // If the call fails, keep the banner — never pretend setup is done.
      setBannerBusy(false);
    }
  };

  // The guided tour highlights nav items — keep the drawer open while
  // it runs so the targets are visible on mobile too.
  useEffect(() => {
    if (showTour) setNavOpen(true);
  }, [showTour]);

  if (status === "checking") return <AuthSkeleton />;
  if (status === "public") return <>{children}</>;

  // Onboarding wizard: bare centred layout, no app chrome.
  if (pathname === "/onboarding") return <>{children}</>;

  return (
    <div>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="pl-0 lg:pl-60">
        <TopBar onMenu={() => setNavOpen(true)} />
        {showBanner && (
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 pt-5 sm:px-8">
            <div className="flex flex-1 items-center gap-3 rounded-card border border-primary/30 bg-primary-soft px-4 py-3 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              <p className="flex-1 text-ink">
                <span className="font-medium">Finish setup</span> — a few details left before Elric is
                fully configured for your company.
              </p>
              <a href="/onboarding" className="inline-flex items-center gap-0.5 font-medium text-primary hover:text-primary-dark">
                Finish setup <Icon name="chevron-right" size={14} />
              </a>
              <button
                type="button"
                onClick={() => void dismissBanner()}
                disabled={bannerBusy}
                className="font-medium text-muted hover:text-ink disabled:opacity-60"
              >
                {bannerBusy ? "Saving…" : "Dismiss"}
              </button>
            </div>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-8">{children}</main>
      </div>
      {showTour && <TourOverlay onDone={() => setShowTour(false)} />}
    </div>
  );
}
