"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PASSWORD_RULES, passwordIsValid, registerUser } from "@/lib/api";

const inputCls =
  "h-10 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = useMemo(() => PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(password) })), [password]);
  const confirmMatches = confirm.length === 0 || password === confirm;
  const canSubmit = email.trim() !== "" && passwordIsValid(password) && password === confirm && !submitting;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await registerUser(email.trim(), password);
      // New users always go through the FTUE onboarding wizard.
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
            E
          </span>
          <span className="text-lg font-semibold text-ink">Elric</span>
        </div>

        <div className="mt-8 rounded-card border border-hairline bg-white p-6 shadow-card sm:p-8">
          <h1 className="text-page-title text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-muted">
            One account for your AP workspace — set it up in under a minute.
          </p>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-label text-ink">
                Work email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-label text-ink">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                className={inputCls}
              />
              <ul className="mt-2 space-y-1" aria-label="Password requirements">
                {rules.map((r) => (
                  <li key={r.key} className={`flex items-center gap-2 text-xs ${r.ok ? "text-green-700" : "text-muted"}`}>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                        r.ok ? "bg-green-100 text-green-700" : "bg-slate-100 text-muted"
                      }`}
                    >
                      {r.ok ? "✓" : "·"}
                    </span>
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-label text-ink">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                className={inputCls}
              />
              {!confirmMatches && (
                <p className="mt-1.5 text-xs text-red-700">Passwords do not match.</p>
              )}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-10 w-full rounded-full bg-primary text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:text-primary-dark">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
