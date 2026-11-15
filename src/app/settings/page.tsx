"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui";
import { requestTourReplay } from "@/components/tour";
import {
  ApiError,
  PASSWORD_RULES,
  changePassword,
  createVendor,
  deleteVendor,
  getSettings,
  listVendors,
  passwordIsValid,
  updateSettings,
  updateVendor,
  type ApiSettings,
  type ApiVendor,
} from "@/lib/api";

const inputCls =
  "h-10 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const btnPrimary =
  "rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60";
const btnGhost =
  "rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow-card ring-1 ring-hairline hover:bg-slate-50 disabled:opacity-60";

type VendorDraft = Omit<ApiVendor, "id">;

const EMPTY_VENDOR: VendorDraft = { name: "", gstin: "", state: "", payment_terms: "Net 30", email: "" };

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-label text-ink">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [vendors, setVendors] = useState<ApiVendor[]>([]);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VendorDraft>(EMPTY_VENDOR);
  const [vendorBusy, setVendorBusy] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwState, setPwState] = useState<"idle" | "saving" | "error">("idle");
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, v] = await Promise.all([getSettings(), listVendors()]);
        if (cancelled) return;
        setSettings(s);
        setVendors(v);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    setSaveState("idle");
  };

  const onSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const saved = await updateSettings(settings);
      setSettings(saved);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Could not save settings.");
    }
  };

  const startAddVendor = () => {
    setEditingId("new");
    setDraft(EMPTY_VENDOR);
    setVendorError(null);
  };

  const startEditVendor = (v: ApiVendor) => {
    setEditingId(v.id);
    setDraft({ name: v.name, gstin: v.gstin, state: v.state, payment_terms: v.payment_terms, email: v.email });
    setVendorError(null);
  };

  const saveVendor = async () => {
    if (draft.name.trim() === "") {
      setVendorError("Vendor name is required.");
      return;
    }
    setVendorBusy(true);
    setVendorError(null);
    try {
      if (editingId === "new") {
        const created = await createVendor(draft);
        setVendors((vs) => [...vs, created]);
      } else if (editingId) {
        const updated = await updateVendor(editingId, draft);
        setVendors((vs) => vs.map((v) => (v.id === editingId ? updated : v)));
      }
      setEditingId(null);
      setDraft(EMPTY_VENDOR);
    } catch (e) {
      setVendorError(e instanceof Error ? e.message : "Could not save vendor.");
    } finally {
      setVendorBusy(false);
    }
  };

  const removeVendor = async (id: string, name: string) => {
    if (!window.confirm(`Remove vendor "${name}"? Invoices already matched to it are not affected.`)) return;
    setVendorBusy(true);
    setVendorError(null);
    try {
      await deleteVendor(id);
      setVendors((vs) => vs.filter((v) => v.id !== id));
    } catch (e) {
      setVendorError(e instanceof Error ? e.message : "Could not remove vendor.");
    } finally {
      setVendorBusy(false);
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwError("New passwords do not match.");
      setPwState("error");
      return;
    }
    if (!passwordIsValid(newPw)) {
      setPwError("The new password does not meet the requirements below.");
      setPwState("error");
      return;
    }
    setPwState("saving");
    setPwError(null);
    try {
      await changePassword(currentPw, newPw);
      // Success revokes ALL sessions: log in again with the new password.
      router.push("/login?notice=" + encodeURIComponent("Please log in again with your new password."));
      router.refresh();
    } catch (err) {
      setPwState("error");
      setPwError(
        err instanceof ApiError && err.status === 401
          ? "Your current password is incorrect."
          : err instanceof Error
            ? err.message
            : "Could not change password.",
      );
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-page-title text-ink">Settings</h1>
        <div className="mt-5 space-y-5">
          <div className="skeleton h-64 w-full" />
          <div className="skeleton h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-page-title text-ink">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Company profile, approval rules, vendors, and your account — everything here is saved to the
            backend, nothing is hard-coded.
          </p>
        </div>
        <button type="button" onClick={requestTourReplay} className={btnGhost}>
          Replay tour
        </button>
      </div>

      {loadError && (
        <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      <form onSubmit={onSaveSettings}>
        <Card className="mt-5">
          <CardHeader title="Company profile" />
          <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
            <Field label="Company name" htmlFor="set-company">
              <input
                id="set-company"                value={settings?.company_name ?? ""}
                onChange={(e) => set("company_name", e.target.value)}
                placeholder="Your company name"
                className={inputCls}
              />
            </Field>
            <Field label="Country" htmlFor="set-country">
              <input id="set-country" value={settings?.country ?? ""} onChange={(e) => set("country", e.target.value)} className={inputCls} />
            </Field>
            <Field label="State" htmlFor="set-state">
              <input
                id="set-state"                value={settings?.state ?? ""}
                onChange={(e) => set("state", e.target.value)}
                placeholder="Karnataka"
                className={inputCls}
              />
            </Field>
            <Field label="Currency" htmlFor="set-currency" hint="Invoices and approvals are shown in this currency.">
              <input id="set-currency" value={settings?.currency ?? ""} onChange={(e) => set("currency", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </Card>

        <Card className="mt-5">
          <CardHeader title="Approval rules" />
          <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
            <Field
              label="Auto-approve limit (₹)"
              htmlFor="set-limit"
              hint="Clean 3-way matches at or under this amount are approved automatically, with no human step."
            >
              <input
                id="set-limit"
                type="number"
                min={0}
                value={settings?.auto_approve_limit_inr ?? 0}
                onChange={(e) => set("auto_approve_limit_inr", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field
              label="Price tolerance (%)"
              htmlFor="set-tol-pct"
              hint="A unit price within this percentage of the PO price still counts as a match."
            >
              <input
                id="set-tol-pct"
                type="number"
                min={0}
                step={0.1}
                value={settings?.tolerance_pct ?? 0}
                onChange={(e) => set("tolerance_pct", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field
              label="Tolerance flat amount (₹)"
              htmlFor="set-tol-flat"
              hint="Or within this flat amount — whichever is larger, the price still matches."
            >
              <input
                id="set-tol-flat"
                type="number"
                min={0}
                value={settings?.tolerance_flat_inr ?? 0}
                onChange={(e) => set("tolerance_flat_inr", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field
              label="Duplicate window (days)"
              htmlFor="set-dup"
              hint="Same vendor, invoice number and amount within this many days is flagged as a duplicate payment risk."
            >
              <input
                id="set-dup"
                type="number"
                min={0}
                value={settings?.duplicate_window_days ?? 0}
                onChange={(e) => set("duplicate_window_days", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3 border-t border-hairline px-5 py-4">
            <button type="submit" disabled={saveState === "saving" || !settings} className={btnPrimary}>
              {saveState === "saving" ? "Saving…" : "Save settings"}
            </button>
            {saveState === "saved" && <span className="text-sm font-medium text-green-700">Saved.</span>}
            {saveState === "error" && (
              <span role="alert" className="text-sm text-red-700">
                {saveError ?? "Could not save settings."}
              </span>
            )}
          </div>
        </Card>
      </form>

      <Card className="mt-5">
        <CardHeader
          title="Vendors"
          action={
            <button type="button" onClick={startAddVendor} className={btnGhost}>
              Add vendor
            </button>
          }
        />
        {vendorError && (
          <p role="alert" className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {vendorError}
          </p>
        )}
        <div className="overflow-x-auto px-2 pb-2 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">GSTIN</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Payment terms</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-t border-hairline">
                  <td className="px-3 py-3 font-medium text-ink">{v.name}</td>
                  <td className="px-3 py-3 font-mono text-xs text-muted">{v.gstin || "—"}</td>
                  <td className="px-3 py-3 text-ink">{v.state || "—"}</td>
                  <td className="px-3 py-3 text-ink">{v.payment_terms || "—"}</td>
                  <td className="px-3 py-3 text-muted">{v.email || "—"}</td>
                  <td className="px-3 py-3 text-right">
                    <button type="button" onClick={() => startEditVendor(v)} className="mr-3 text-sm font-medium text-primary hover:text-primary-dark">
                      Edit
                    </button>
                    <button type="button" onClick={() => void removeVendor(v.id, v.name)} className="text-sm font-medium text-money-out hover:text-red-800">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr className="border-t border-hairline">
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                    No vendors yet — add your first vendor above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {editingId !== null && (
          <div className="border-t border-hairline px-5 py-5">
            <h3 className="text-section-title text-ink">{editingId === "new" ? "Add vendor" : "Edit vendor"}</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Vendor name" htmlFor="set-v-name">
                <input id="set-v-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Vendor name" className={inputCls} />
              </Field>
              <Field label="GSTIN" htmlFor="set-v-gstin">
                <input id="set-v-gstin" value={draft.gstin} onChange={(e) => setDraft({ ...draft, gstin: e.target.value })} placeholder="29ABCDE1234F1Z5" className={inputCls} />
              </Field>
              <Field label="State" htmlFor="set-v-state">
                <input id="set-v-state" value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} placeholder="Karnataka" className={inputCls} />
              </Field>
              <Field label="Payment terms" htmlFor="set-v-terms">
                <input id="set-v-terms" value={draft.payment_terms} onChange={(e) => setDraft({ ...draft, payment_terms: e.target.value })} placeholder="Net 30" className={inputCls} />
              </Field>
              <Field label="Email" htmlFor="set-v-email">
                <input id="set-v-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="billing@vendor.com" className={inputCls} />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void saveVendor()} disabled={vendorBusy} className={btnPrimary}>
                {vendorBusy ? "Saving…" : "Save vendor"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft(EMPTY_VENDOR);
                }}
                className={btnGhost}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Change password" />
        <form onSubmit={onChangePassword} className="px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Current password" htmlFor="set-cur-pw">
              <input
                id="set-cur-pw"                type="password"
                autoComplete="current-password"
                required
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="New password" htmlFor="set-new-pw">
              <input
                id="set-new-pw"                type="password"
                autoComplete="new-password"
                required
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Confirm new password" htmlFor="set-confirm-pw">
              <input
                id="set-confirm-pw"                type="password"
                autoComplete="new-password"
                required
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <ul className="mt-3 space-y-1" aria-label="Password requirements">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(newPw);
              return (
                <li key={r.key} className={`flex items-center gap-2 text-xs ${ok ? "text-green-700" : "text-muted"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${ok ? "bg-green-100 text-green-700" : "bg-slate-100 text-muted"}`}>
                    {ok ? "✓" : "·"}
                  </span>
                  {r.label}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted">
            Changing your password signs you out everywhere — you will need to log in again with the new
            password on every device.
          </p>
          {pwState === "error" && pwError && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {pwError}
            </p>
          )}
          <button type="submit" disabled={pwState === "saving"} className={`${btnPrimary} mt-4`}>
            {pwState === "saving" ? "Changing…" : "Change password"}
          </button>
        </form>
      </Card>
    </div>
  );
}
