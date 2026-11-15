"use client";

import { useCallback, useEffect, useState } from "react";
import { BackendBanner, Card, CardHeader, EmptyState, LiveTag, Skeleton } from "@/components/ui";
import { ApiError, ensureSession, getAccessToken, runEval } from "@/lib/api";

/**
 * Eval report — live API only.
 *
 * GET /api/eval/summary (pinned contract): { synthetic, graph, generated_at, cached }.
 * Each of synthetic/graph is either null or { kind, n_cases, match_rate,
 * auto_approve_rate, false_approve_rate, false_approves,
 * exception_code_accuracy, per_scenario } — measured by running the
 * deterministic matcher / full graph pipeline over the seeded synthetic
 * corpus. Zero LLM calls; these scores are NOT live-extraction accuracy.
 *
 * There is no getEvalSummary helper in src/lib/api.ts yet (another
 * builder owns it), so this page fetches the endpoint directly with the
 * same same-origin + Bearer-token pattern api.ts uses (token from
 * getAccessToken(), refreshed silently via ensureSession() when absent).
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function toNum(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

interface EvalSummaryEntry {
  kind: string;
  n_cases: number;
  match_rate: number;
  auto_approve_rate: number;
  false_approve_rate: number;
  false_approves: number;
  exception_code_accuracy: number;
  per_scenario: Record<string, { n: number; code_correct: number; auto_approved: number }>;
}

interface EvalSummary {
  synthetic: EvalSummaryEntry | null;
  graph: EvalSummaryEntry | null;
  generated_at: string | null;
  cached: boolean;
}

function normalizeEntry(raw: Record<string, unknown> | null): EvalSummaryEntry | null {
  if (!raw) return null;
  const perRaw = (raw.per_scenario as Record<string, Record<string, unknown>>) ?? {};
  const perScenario: EvalSummaryEntry["per_scenario"] = {};
  for (const [k, v] of Object.entries(perRaw)) {
    perScenario[k] = { n: toNum(v.n), code_correct: toNum(v.code_correct), auto_approved: toNum(v.auto_approved) };
  }
  return {
    kind: String(raw.kind ?? ""),
    n_cases: toNum(raw.n_cases),
    match_rate: toNum(raw.match_rate),
    auto_approve_rate: toNum(raw.auto_approve_rate),
    false_approve_rate: toNum(raw.false_approve_rate),
    false_approves: toNum(raw.false_approves),
    exception_code_accuracy: toNum(raw.exception_code_accuracy),
    per_scenario: perScenario,
  };
}

async function fetchSummary(refresh = false): Promise<EvalSummary> {
  const q = refresh ? "?refresh=true" : "";
  // Pinned contract: auth-required, Bearer access token. The token lives
  // in memory in api.ts — refresh it silently if this is the first call.
  let token = getAccessToken();
  if (!token) {
    await ensureSession();
    token = getAccessToken();
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/eval/summary${q}`, {
      headers,
      credentials: "include",
    });
  } catch {
    throw new Error("Backend unreachable — is it running?");
  }
  if (!res.ok) {
    let detail = `Eval summary request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep the generic message */
    }
    if (res.status === 404) {
      throw new Error("Eval summary endpoint is not available on this backend yet (404).");
    }
    if (res.status === 401) {
      throw new Error("Eval summary needs sign-in (401) — session expired.");
    }
    throw new Error(detail);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  return {
    synthetic: normalizeEntry((raw.synthetic as Record<string, unknown> | null) ?? null),
    graph: normalizeEntry((raw.graph as Record<string, unknown> | null) ?? null),
    generated_at: typeof raw.generated_at === "string" ? raw.generated_at : null,
    cached: Boolean(raw.cached),
  };
}

function MetricCards({ entry, tag }: { entry: EvalSummaryEntry; tag: string }) {
  const cards = [
    {
      label: "3-way match rate",
      value: pct(entry.match_rate),
      sub: `${entry.n_cases} synthetic cases · clean matches / total`,
      trend: entry.match_rate >= 0.9 ? "On target" : "Below 90% — investigate",
      good: entry.match_rate >= 0.9,
    },
    {
      label: "Auto-approve rate",
      value: pct(entry.auto_approve_rate),
      sub: "Clean matches under the auto-approve threshold",
      trend: "Measured on this run",
      good: true,
    },
    {
      label: "False-approve rate",
      value: pct(entry.false_approve_rate),
      sub: `Target: 0.0% — ${entry.false_approves} false approve${entry.false_approves === 1 ? "" : "s"} in this run`,
      trend: entry.false_approve_rate === 0 ? "On target" : "Above target — investigate",
      good: entry.false_approve_rate === 0,
    },
    {
      label: "Exception-code accuracy",
      value: pct(entry.exception_code_accuracy),
      sub: "Matcher raised exactly the expected exception codes",
      trend: "Measured on this run",
      good: entry.exception_code_accuracy >= 0.9,
    },
    {
      label: "Cases run",
      value: String(entry.n_cases),
      sub: `Kind: ${entry.kind || "synthetic"} · deterministic seed`,
      trend: "Deterministic — same seed, same result",
      good: true,
    },
  ];
  return (
    <>
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((m) => (
          <Card key={`${tag}-${m.label}`}>
            <div className="px-5 py-5">
              <p className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted">
                {m.label}
                <span className="text-[11px] font-medium normal-case tracking-normal text-muted">{tag}</span>
              </p>
              <p data-testid={`eval-${tag}-${m.label}`} className="mt-2 text-[30px] font-semibold leading-9 text-ink tnum">
                {m.value}
              </p>
              <p className="mt-2 text-sm leading-5 text-muted">{m.sub}</p>
              <p className={`mt-3 text-xs font-medium ${m.good ? "text-money-in" : "text-amber"}`}>{m.trend}</p>
            </div>
          </Card>
        ))}
      </div>
      {Object.keys(entry.per_scenario).length > 0 && (
        <Card className="mt-5">
          <CardHeader title={`Per-scenario breakdown — ${tag}`} />
          <div className="overflow-x-auto px-2 pb-2 pt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Scenario</th>
                  <th className="px-3 py-2 text-right font-medium">Cases</th>
                  <th className="px-3 py-2 text-right font-medium">Codes correct</th>
                  <th className="px-3 py-2 text-right font-medium">Auto-approved</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(entry.per_scenario).map(([name, s]) => (
                  <tr
                    key={name}
                    className="border-t border-hairline transition-colors duration-150 ease-out hover:bg-slate-50 motion-reduce:transition-none"
                  >
                    <td className="px-3 py-3 font-mono text-xs text-ink">{name}</td>
                    <td className="px-3 py-3 text-right tnum">{s.n}</td>
                    <td className="px-3 py-3 text-right tnum">
                      {s.code_correct} / {s.n}
                    </td>
                    <td className="px-3 py-3 text-right tnum">{s.auto_approved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

export default function EvalPage() {
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await fetchSummary(refresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eval summary failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const onRun = async () => {
    setRunning(true);
    setRunError(null);
    try {
      // n=2 per scenario: the synthetic matcher + graph eval — no LLM calls.
      await runEval(2);
      await load(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Eval run failed.";
      setRunError(msg);
    } finally {
      setRunning(false);
    }
  };

  const hasData = summary !== null && (summary.synthetic !== null || summary.graph !== null);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-semibold leading-[34px] text-ink">Eval report</h1>
          {loading ? (
            <Skeleton className="mt-2 h-4 w-96" />
          ) : error !== null ? (
            <p className="mt-1 text-sm text-amber-700">Eval summary unavailable — the backend could not be reached.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                Measured on the seeded synthetic corpus — deterministic matcher and full graph pipeline, zero
                live LLM calls. These scores are not live-extraction accuracy.
              </p>
              {summary?.generated_at && (
                <p className="mt-0.5 text-xs text-muted">
                  Generated {new Date(summary.generated_at).toLocaleString("en-IN")}
                  {summary.cached ? " · cached" : ""}
                </p>
              )}
            </>
          )}
        </div>
        {hasData && <LiveTag />}
      </div>

      {error !== null && (
        <BackendBanner message={`Eval summary could not be loaded. ${error}`} onRetry={() => void load(false)} />
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={onRun}
          disabled={running || loading}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 motion-reduce:transition-none"
        >
          {running ? "Running eval…" : "Run eval (synthetic corpus)"}
        </button>
        <p className="mt-2 text-xs text-muted">
          POST /api/eval/run — scores the deterministic matcher and the full graph pipeline on the seeded
          synthetic corpus (2 cases per scenario). No LLM calls, no Gemini usage; the run is pure code and takes
          seconds. The summary above refreshes from GET /api/eval/summary after the run.
        </p>
        {runError !== null && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{runError}</p>
        )}
      </div>

      {loading ? (
        <div data-testid="eval-loading" className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <div className="px-5 py-5" aria-hidden="true">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-3 h-9 w-28" />
                <Skeleton className="mt-3 h-4 w-56" />
                <Skeleton className="mt-3 h-3 w-40" />
              </div>
            </Card>
          ))}
        </div>
      ) : error !== null ? (
        <Card className="mt-5">
          <p className="px-5 py-8 text-center text-sm text-amber-700">
            Eval summary could not be loaded. {error}
          </p>
        </Card>
      ) : !hasData ? (
        <Card className="mt-5">
          <EmptyState
            title="No eval run yet"
            body="No eval scores have been measured on this backend. Run the synthetic-corpus eval to measure the matcher and the full graph pipeline."
          />
          <div className="flex justify-center pb-8">
            <button
              type="button"
              onClick={onRun}
              disabled={running}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 motion-reduce:transition-none"
            >
              {running ? "Running eval…" : "Run eval"}
            </button>
          </div>
        </Card>
      ) : (
        <>
          {summary?.synthetic && (
            <div data-testid="eval-synthetic">
              <h2 className="mt-6 text-[15px] font-semibold text-ink">Synthetic matcher eval</h2>
              <MetricCards entry={summary.synthetic} tag="synthetic" />
            </div>
          )}
          {summary?.graph && (
            <div data-testid="eval-graph">
              <h2 className="mt-6 text-[15px] font-semibold text-ink">Full graph pipeline eval</h2>
              <MetricCards entry={summary.graph} tag="graph" />
            </div>
          )}
        </>
      )}

      <Card className="mt-5">
        <CardHeader title="How these numbers are produced" />
        <div className="space-y-3 px-5 pb-5 pt-3 text-sm leading-6 text-muted">
          <p>
            <span className="font-medium text-ink">Match rate, auto-approve rate, false-approve rate,
            exception-code accuracy</span> — measured by GET /api/eval/summary (first call runs the evals on
            demand, later calls return the cached result; ?refresh=true forces a re-run): the deterministic matcher
            (pure code, no LLM) and the full graph pipeline are run against a synthetic corpus of POs, receipts
            and invoices with seeded, injected mismatches. A perfect invoice must always auto-approve; a duplicate
            must never auto-approve.
          </p>
          <p>
            <span className="font-medium text-ink">What these scores are not</span> — they say nothing about
            live extraction accuracy. Field-level accuracy of the Gemini extractor against the HuggingFace
            invoice-extraction-benchmark (181 documents) is not served by any backend endpoint, so no figure for
            it is shown here. Cycle time and money caught in exceptions are likewise not served by the backend
            yet, so they are not shown either.
          </p>
        </div>
      </Card>
    </div>
  );
}
