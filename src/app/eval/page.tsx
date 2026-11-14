"use client";

import { useState } from "react";
import { BackendBanner, Card, CardHeader, LiveTag, MockTag } from "@/components/ui";
import { evalMetrics } from "@/lib/mock-data";
import { inr } from "@/lib/format";
import { runEval, type EvalResult } from "@/lib/api";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function EvalPage() {
  const [result, setResult] = useState<EvalResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRun = async () => {
    setRunning(true);
    setError(null);
    try {
      // n=2 per scenario: the synthetic matcher eval only — no LLM calls.
      setResult(await runEval(2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eval run failed.");
    } finally {
      setRunning(false);
    }
  };

  // Mock cards the backend eval does not serve yet.
  const mockMetrics = [
    { label: "Extraction accuracy", value: `${evalMetrics.extractionAccuracy}%`, sub: `${evalMetrics.extractionDocs} benchmark docs (HF invoice-extraction-benchmark)`, trend: "▲ 1.2 pts vs last run", good: true },
    { label: "Median cycle time", value: `${evalMetrics.medianCycleHours}h`, sub: "Received → posted, all invoices in the last 30 days", trend: "▼ 1.6h vs last run", good: true },
    { label: "Money caught in exceptions", value: inr(evalMetrics.moneyCaughtInExceptions), sub: "Held for human review instead of auto-paid", trend: "5 open exceptions", good: true },
  ];

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Eval report</h1>
          <p className="mt-1 text-sm text-muted">
            {evalMetrics.evalRun} · no feature ships without a measured number
          </p>
        </div>
        {result ? <LiveTag /> : <MockTag />}
      </div>

      {error !== null && <BackendBanner onRetry={onRun} />}
      {error !== null && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5">
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-40"
        >
          {running ? "Running eval…" : "Run eval (synthetic corpus)"}
        </button>
        <p className="mt-2 text-xs text-muted">
          POST /api/eval/run — scores the deterministic matcher on the seeded synthetic corpus (2 cases per
          scenario). No LLM calls, no Gemini usage; the run is pure code and takes seconds.
        </p>
      </div>

      {result && (
        <>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "3-way match rate", value: pct(result.match_rate), sub: `${result.n_cases} synthetic cases · clean matches / total`, trend: result.match_rate >= 0.9 ? "On target" : "Below 90% — investigate", good: result.match_rate >= 0.9 },
              { label: "Auto-approve rate", value: pct(result.auto_approve_rate), sub: "Clean matches under the auto-approve threshold", trend: "Measured on this run", good: true },
              { label: "False-approve rate", value: pct(result.false_approve_rate), sub: `Target: 0.0% — ${result.false_approves} false approve${result.false_approves === 1 ? "" : "s"} in this run`, trend: result.false_approve_rate === 0 ? "On target" : "Above target — investigate", good: result.false_approve_rate === 0 },
              { label: "Exception-code accuracy", value: pct(result.exception_code_accuracy), sub: "Matcher raised exactly the expected exception codes", trend: "Measured on this run", good: result.exception_code_accuracy >= 0.9 },
              { label: "Cases run", value: String(result.n_cases), sub: `Kind: ${result.kind} · seed 42 · 2 per scenario`, trend: "Deterministic — same seed, same result", good: true },
            ].map((m) => (
              <Card key={m.label}>
                <div className="px-5 py-5">
                  <p className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted">
                    {m.label}
                    <LiveTag />
                  </p>
                  <p className="mt-2 text-[30px] font-semibold leading-9 text-ink tnum">{m.value}</p>
                  <p className="mt-2 text-sm leading-5 text-muted">{m.sub}</p>
                  <p className={`mt-3 text-xs font-medium ${m.good ? "text-money-in" : "text-amber"}`}>{m.trend}</p>
                </div>
              </Card>
            ))}
          </div>

          {Object.keys(result.per_scenario).length > 0 && (
            <Card className="mt-5">
              <CardHeader title="Per-scenario breakdown" action={<LiveTag />} />
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
                    {Object.entries(result.per_scenario).map(([name, s]) => (
                      <tr key={name} className="border-t border-hairline">
                        <td className="px-3 py-3 font-mono text-xs text-ink">{name}</td>
                        <td className="px-3 py-3 text-right tnum">{s.n}</td>
                        <td className="px-3 py-3 text-right tnum">{s.code_correct} / {s.n}</td>
                        <td className="px-3 py-3 text-right tnum">{s.auto_approved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {mockMetrics.map((m) => (
          <Card key={m.label}>
            <div className="px-5 py-5">
              <p className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted">
                {m.label}
                <MockTag />
              </p>
              <p className="mt-2 text-[30px] font-semibold leading-9 text-ink tnum">{m.value}</p>
              <p className="mt-2 text-sm leading-5 text-muted">{m.sub}</p>
              <p className={`mt-3 text-xs font-medium ${m.good ? "text-money-in" : "text-amber"}`}>{m.trend}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <CardHeader title="How these numbers are produced" />
        <div className="space-y-3 px-5 pb-5 pt-3 text-sm leading-6 text-muted">
          <p>
            <span className="font-medium text-ink">Match rate, auto-approve rate, false-approve rate,
            exception-code accuracy</span> — measured live by POST /api/eval/run: the deterministic matcher
            (pure code, no LLM) is run against a synthetic corpus of POs, receipts and invoices with seeded,
            injected mismatches. A perfect invoice must always auto-approve; a duplicate must never auto-approve.
          </p>
          <p>
            <span className="font-medium text-ink">Extraction accuracy</span> — field-level accuracy of the Gemini
            extractor against the HuggingFace invoice-extraction-benchmark (181 documents + answer keys). Not served
            by the backend eval endpoint yet — the figure above is a mock placeholder.
          </p>
          <p>
            <span className="font-medium text-ink">Auto-approve rate &amp; cycle time</span> — measured from the audit log
            (append-only) over the last 30 days of processed invoices. Cycle time and money-caught are not served by
            the backend yet.
          </p>
          <p className="rounded-lg border border-hairline bg-page px-3 py-2 text-xs">
            Figures tagged “Mock data” are placeholders for the frontend scaffold. The eval harness (backend) replaces
            the matcher numbers with measured runs when you press “Run eval”; extraction accuracy, cycle time and
            money-caught still await a backend endpoint.
          </p>
        </div>
      </Card>
    </div>
  );
}
