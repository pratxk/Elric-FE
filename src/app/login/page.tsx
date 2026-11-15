"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, loginUser } from "@/lib/api";

const inputCls =
  "h-10 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await loginUser(email.trim(), password);
      router.push(user.onboarding_completed ? "/" : "/onboarding");
      router.refresh();
    } catch (err) {
      // Display the server's message verbatim: 401 is the generic
      // "Invalid email or password", 429 is the lockout message.
      setError(err instanceof Error ? err.message : "Login failed.");
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
          <h1 className="text-page-title text-ink">Log in</h1>
          <p className="mt-1 text-sm text-muted">
            Sign in to your AP workspace — invoices, matching, approvals.
          </p>

          {notice && (
            <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {notice}
            </p>
          )}
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 w-full rounded-full bg-primary text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            New to Elric?{" "}
            <Link href="/register" className="font-medium text-primary hover:text-primary-dark">
              Create an account
            </Link>
          </p>
        </div>

        <p className="mt-4 text-center text-label text-muted">
          Equivalent Exchange — what you pay must equal what you received.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
