"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { deferOnboarding, markTourPending } from "@/components/tour";
import {
  DEFAULT_SETTINGS,
  completeOnboarding,
  createVendor,
  getSettings,
  updateSettings,
  uploadInvoice,
  type ApiSettings,
} from "@/lib/api";

const inputCls =
  "h-10 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60";
const btnGhost =
  "rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink shadow-card ring-1 ring-hairline hover:bg-slate-50 disabled:opacity-60";

const STEPS = ["Welcome", "Company", "Approval rules", "First vendor", "First invoice"];

function SkipLink({ onSkip }: { onSkip: () => void }) {
  return (
    <button type="button" onClick={onSkip} className="text-sm font-medium text-muted hover:text-ink">
      Skip for now
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState<ApiSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vendorName, setVendorName] = useState("");
  const [vendorGstin, setVendorGstin] = useState("");
  const [vendorState, setVendorState] = useState("");
  const [vendorTerms, setVendorTerms] = useState("Net 30");
  const [vendorEmail, setVendorEmail] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setSettingsLoaded(true);
        }
      })
      .catch(() => {
        // Keep the sane defaults; saving will surface any backend error.
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const skip = () => {
    deferOnboarding();
    router.push("/");
    router.refresh();
  };

  const saveSettingsAndNext = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateSettings(settings);
      setStep(step + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save — check the backend and try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveVendorAndNext = async (e: FormEvent) => {
    e.preventDefault();
    if (vendorName.trim() === "") {
      setError("Vendor name is required — or skip this step and add vendors later.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createVendor({
        name: vendorName.trim(),
        gstin: vendorGstin.trim(),
        state: vendorState.trim(),
        payment_terms: vendorTerms.trim(),
        email: vendorEmail.trim(),
      });
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the vendor.");
    } finally {
      setBusy(false);
    }
  };

  const finishAfterUpload = async (invoiceId: string) => {
    try {
      await completeOnboarding();
    } catch {
      // The invoice is uploaded; onboarding completion is retried from the
      // dashboard banner if this call failed — don't strand the user here.
    }
    try {
      sessionStorage.removeItem("elric_onboarding_deferred");
    } catch {
      /* ignore */
    }
    markTourPending();
    router.push(`/invoices/${invoiceId}`);
    router.refresh();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploading(true);
    setError(null);
    try {
      const inv = await uploadInvoice(file);
      await finishAfterUpload(inv.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const set = <K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
            E
          </span>
          <span className="text-lg font-semibold text-ink">Elric</span>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2" aria-label={`Step ${step} of 5`}>
          {STEPS.map((label, i) => (
            <span key={label} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  i + 1 === step
                    ? "bg-primary text-white"
                    : i + 1 < step
                      ? "bg-primary-soft text-primary-dark"
                      : "bg-white text-muted ring-1 ring-hairline"
                }`}
              >
                {i + 1 < step ? "✓" : i + 1}
              </span>
              {i < STEPS.length - 1 && <span className="h-px w-6 bg-hairline sm:w-10" />}
            </span>
          ))}
        </div>
        <p className="mt-2 text-center text-label text-muted">
          Step {step} of 5 — {STEPS[step - 1]}
        </p>

        <Card className="mt-6 p-6 sm:p-8">
          {error && (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {step === 1 && (
            <div>
              <h1 className="text-page-title text-ink">Welcome to Elric</h1>
              <p className="mt-2 text-sm leading-6 text-muted">
                Elric is your accounts-payable workspace. It checks every supplier invoice against its
                purchase order and goods receipt before anything is paid — and only a person approves
                payment.
              </p>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-ink">
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-dark">1</span>
                  Upload an invoice — Elric extracts the fields and matches them 3-way against the PO
                  and receipt, with a typed reason for every mismatch.
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-dark">2</span>
                  Clean matches under your auto-approve limit post on their own; everything else waits
                  in the exceptions queue for your decision.
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-dark">3</span>
                  Every approval, rejection and payment is written to an audit log — nothing moves money
                  without a person behind it.
                </li>
              </ul>
              <div className="mt-6 flex items-center gap-3">
                <button type="button" onClick={() => setStep(2)} className={btnPrimary}>
                  Set up your company <Icon name="chevron-right" size={15} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={saveSettingsAndNext}>
              <h1 className="text-page-title text-ink">Your company</h1>
              <p className="mt-1 text-sm text-muted">
                These details appear on approvals and drive tax matching. You can change them later in
                Settings.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-company">Company name</label>
                  <input id="ob-company" value={settings.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Your company name" className={inputCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-country">Country</label>
                  <input id="ob-country" value={settings.country} onChange={(e) => set("country", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-state">State</label>
                  <input id="ob-state" value={settings.state} onChange={(e) => set("state", e.target.value)} placeholder="Karnataka" className={inputCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-currency">Currency</label>
                  <input id="ob-currency" value={settings.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button type="submit" disabled={busy || !settingsLoaded} className={btnPrimary}>
                  {busy ? "Saving…" : <>Continue <Icon name="chevron-right" size={15} /></>}
                </button>
                <SkipLink onSkip={skip} />
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={saveSettingsAndNext}>
              <h1 className="text-page-title text-ink">Approval &amp; matching rules</h1>
              <p className="mt-1 text-sm text-muted">
                Sensible defaults are filled in — adjust them to how your team actually works. You can
                change them any time in Settings.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-limit">Auto-approve limit (₹)</label>
                  <input id="ob-limit" type="number" min={0} value={settings.auto_approve_limit_inr} onChange={(e) => set("auto_approve_limit_inr", Number(e.target.value))} className={inputCls} />
                  <p className="mt-1.5 text-xs leading-5 text-muted">Clean matches at or under this amount approve themselves.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-tol-pct">Price tolerance (%)</label>
                  <input id="ob-tol-pct" type="number" min={0} step={0.1} value={settings.tolerance_pct} onChange={(e) => set("tolerance_pct", Number(e.target.value))} className={inputCls} />
                  <p className="mt-1.5 text-xs leading-5 text-muted">Unit prices within this of the PO price still match.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-tol-flat">Tolerance flat amount (₹)</label>
                  <input id="ob-tol-flat" type="number" min={0} value={settings.tolerance_flat_inr} onChange={(e) => set("tolerance_flat_inr", Number(e.target.value))} className={inputCls} />
                  <p className="mt-1.5 text-xs leading-5 text-muted">Or within this flat amount — whichever is larger.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-dup">Duplicate window (days)</label>
                  <input id="ob-dup" type="number" min={0} value={settings.duplicate_window_days} onChange={(e) => set("duplicate_window_days", Number(e.target.value))} className={inputCls} />
                  <p className="mt-1.5 text-xs leading-5 text-muted">Same vendor, number and amount inside this window is flagged as a possible duplicate.</p>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy ? "Saving…" : <>Continue <Icon name="chevron-right" size={15} /></>}
                </button>
                <SkipLink onSkip={skip} />
              </div>
            </form>
          )}

          {step === 4 && (
            <form onSubmit={saveVendorAndNext}>
              <h1 className="text-page-title text-ink">Add your first vendor</h1>
              <p className="mt-1 text-sm text-muted">
                Invoices match against vendors you know. Add one now — or skip and add vendors later
                from Settings.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-v-name">Vendor name</label>
                  <input id="ob-v-name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" className={inputCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-v-gstin">GSTIN</label>
                  <input id="ob-v-gstin" value={vendorGstin} onChange={(e) => setVendorGstin(e.target.value)} placeholder="29ABCDE1234F1Z5" className={inputCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-v-state">State</label>
                  <input id="ob-v-state" value={vendorState} onChange={(e) => setVendorState(e.target.value)} placeholder="Karnataka" className={inputCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-v-terms">Payment terms</label>
                  <input id="ob-v-terms" value={vendorTerms} onChange={(e) => setVendorTerms(e.target.value)} placeholder="Net 30" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-label text-ink" htmlFor="ob-v-email">Email</label>
                  <input id="ob-v-email" type="email" value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} placeholder="billing@vendor.com" className={inputCls} />
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy ? "Saving…" : <>Add vendor & continue <Icon name="chevron-right" size={15} /></>}
                </button>
                <button
                  type="button"
                  onClick={skip}
                  className="text-sm font-medium text-muted hover:text-ink"
                >
                  Skip — I&rsquo;ll add vendors later
                </button>
              </div>
            </form>
          )}

          {step === 5 && (
            <div>
              <h1 className="text-page-title text-ink">Upload your first invoice</h1>
              <p className="mt-1 text-sm text-muted">
                This is the real upload — the same one in the Inbox. Elric extracts the fields and runs
                the 3-way match, then takes you to the result.
              </p>
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void onFiles(e.dataTransfer.files);
                }}
                className={`mt-5 flex flex-col items-center justify-center rounded-card border border-dashed px-6 py-12 text-center ${
                  dragOver ? "border-primary bg-primary-soft" : "border-hairline bg-page"
                } cursor-pointer`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary-dark">
                  <Icon name="upload" size={20} />
                </span>
                <p className="mt-3 text-sm font-medium text-ink">Drop an invoice PDF here, or click to browse</p>
                <p className="mt-1 text-xs text-muted">PDF, PNG or JPG · up to 20 MB · goes to POST /api/invoices/upload</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => void onFiles(e.target.files)}
                />
              </div>
              {uploading && <p className="mt-3 text-sm text-muted">Uploading — the backend pipeline runs in the background…</p>}
              <div className="mt-6 flex items-center gap-3">
                <a href="/inbox" className={btnGhost}>
                  Go to Inbox instead
                </a>
                <SkipLink onSkip={skip} />
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
