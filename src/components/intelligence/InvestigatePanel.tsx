import { useMemo, useState } from "react";
import { Beaker, Search, ShieldAlert, X } from "lucide-react";
import type { AnomalySignal } from "@/lib/core/anomaly-contract";
import type { PatternObservation } from "@/lib/core/pattern-intelligence";
import {
  HYPOTHESIS_STATUS_LABEL,
  HYPOTHESIS_STRENGTH_LABEL,
  HYPOTHESIS_TYPE_LABEL,
  INVESTIGATION_CONCLUSION_LABEL,
  RELATION_CLAIM_LABEL,
  TEST_UTILITY_LABEL,
  type DiscriminatingTest,
  type Hypothesis,
  type Investigation,
} from "@/lib/investigation/hypothesis-contract";
import { generateCandidates } from "@/lib/investigation/hypothesis-generation";
import { rankHypotheses } from "@/lib/investigation/hypothesis-strength";
import { searchAlternatives } from "@/lib/investigation/investigation-engine";
import { investigationStore, useInvestigations } from "@/lib/investigation/investigation-store";

/**
 * INVESTIGATE (Phase 8) — the causal reasoning surface.
 *
 * CONTRADICTION-FIRST by construction: every hypothesis card renders the
 * evidence AGAINST it above the evidence for it, and the panel leads with the
 * conclusion state rather than with the leading candidate. Nothing here is
 * presented as a cause unless it is VERIFIED, and the panel always shows what
 * would change the answer.
 */

function StrengthChip({ h }: { h: Hypothesis }) {
  const tone =
    h.status === "verified"
      ? { color: "var(--status-success, var(--intel-accent))", pct: "16%" }
      : h.status === "rejected"
        ? { color: "var(--muted-foreground)", pct: "10%" }
        : h.strength === "weak" || h.strength === "insufficient"
          ? { color: "var(--status-warning)", pct: "14%" }
          : { color: "var(--intel-accent)", pct: "12%" };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{
        color: tone.color,
        background: `color-mix(in oklab, ${tone.color} ${tone.pct}, transparent)`,
      }}
    >
      {HYPOTHESIS_STRENGTH_LABEL[h.strength]}
    </span>
  );
}

function HypothesisCard({
  investigation,
  hypothesis: h,
  onReject,
}: {
  investigation: Investigation;
  hypothesis: Hypothesis;
  onReject: () => void;
}) {
  const against = investigation.evidence.filter(
    (e) => e.hypothesisId === h.id && e.stance === "contradicts",
  );
  const forIt = investigation.evidence.filter(
    (e) => e.hypothesisId === h.id && e.stance === "supports",
  );

  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--surface-border)", background: "var(--surface-1)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StrengthChip h={h} />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {HYPOTHESIS_TYPE_LABEL[h.hypothesisType]} · {HYPOTHESIS_STATUS_LABEL[h.status]}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{h.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{h.statement}</p>
        </div>
        {h.status !== "rejected" && h.status !== "verified" && (
          <button
            type="button"
            onClick={onReject}
            title="Rule this explanation out"
            className="shrink-0 rounded-md border border-border/50 p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* CONTRADICTIONS FIRST — never buried under supporting evidence. */}
      {against.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--status-danger, var(--destructive))" }}>
            Evidence against ({against.length})
          </p>
          <ul className="mt-1 space-y-0.5">
            {against.map((e) => (
              <li key={e.id} className="text-[11px] text-muted-foreground">
                • {e.statement}
                {e.counterexample && " (counterexample)"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {forIt.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Evidence for ({forIt.length})
          </p>
          <ul className="mt-1 space-y-0.5">
            {forIt.map((e) => (
              <li key={e.id} className="text-[11px] text-muted-foreground">
                • {e.statement}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground/80">
        <span className="uppercase tracking-wide">Mechanism:</span> {h.mechanism}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground/70">
        {RELATION_CLAIM_LABEL[h.relationClaim]} · {h.strengthRationale.join(" ")}
      </p>
      {h.predictions.length > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          Predicts: {h.predictions.map((p) => p.statement).join(" · ")}
        </p>
      )}
    </div>
  );
}

function TestCard({
  test,
  onRecord,
}: {
  test: DiscriminatingTest;
  onRecord: (outcomeKey: string) => void;
}) {
  const low = test.utility.klass === "low_discrimination" || test.utility.klass === "blocked";
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: low ? "var(--surface-border)" : "color-mix(in oklab, var(--intel-accent) 40%, var(--surface-border))",
        background: "var(--surface-1)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{test.title}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {TEST_UTILITY_LABEL[test.utility.klass]}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{test.utility.rationale.join(" ")}</p>
      <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
        {test.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="mt-2 text-[10px] text-muted-foreground/70">{test.safetyBoundary}</p>
      {test.status === "recorded" ? (
        <p className="mt-2 text-[11px] text-foreground">
          Recorded outcome: <span className="font-medium">{test.result?.outcomeKey}</span>
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1">
          {test.outcomes.map((o) => (
            <button
              key={o.key}
              type="button"
              title={o.description}
              onClick={() => onRecord(o.key)}
              className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Record: {o.key.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function InvestigatePanel({
  accountNumber,
  patterns,
  anomalies,
}: {
  accountNumber: string;
  patterns: PatternObservation[];
  anomalies: AnomalySignal[];
}) {
  const investigations = useInvestigations(accountNumber);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = investigations.find((i) => i.id === activeId) ?? investigations[0];

  const alternatives = useMemo(() => (active ? searchAlternatives(active) : null), [active]);
  const ranked = useMemo(
    () => (active ? rankHypotheses(active.hypotheses) : []),
    [active],
  );

  const openInvestigation = () => {
    const now = new Date();
    const id = `inv:${accountNumber}:${now.getTime()}`;
    const observations = [
      ...anomalies.slice(0, 3).map((a, i) => ({
        id: `${id}:o${i + 1}`,
        statement: a.title,
        source: "anomaly" as const,
        refs: [],
        recordedAt: now.toISOString(),
      })),
      ...patterns.slice(0, 3).map((p, i) => ({
        id: `${id}:op${i + 1}`,
        statement: p.title,
        source: "pattern_intelligence" as const,
        refs: [],
        recordedAt: now.toISOString(),
      })),
    ];
    const inv = investigationStore.open({
      id,
      accountId: accountNumber,
      title: `Investigation — account ${accountNumber}`,
      observations,
      now,
    });
    const candidates = generateCandidates({
      investigationId: id,
      accountId: accountNumber,
      observations,
      patterns,
      anomalies,
      now,
    });
    investigationStore.proposeHypotheses(inv.id, candidates);
    investigationStore.prepareTests(inv.id);
    setActiveId(inv.id);
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Investigate (causal hypotheses)
          </h3>
        </div>
        <button
          type="button"
          onClick={openInvestigation}
          className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Open investigation
        </button>
      </div>

      {!active ? (
        <p className="text-sm text-muted-foreground">
          No open investigation. Opening one proposes competing explanations from the observations
          and anomalies already on file — candidates to test, never causes.
        </p>
      ) : (
        <div className="space-y-3">
          {investigations.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {investigations.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setActiveId(i.id)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    i.id === active.id
                      ? "border-transparent text-foreground"
                      : "border-border/50 text-muted-foreground hover:text-foreground"
                  }`}
                  style={
                    i.id === active.id
                      ? { background: "color-mix(in oklab, var(--intel-accent) 16%, transparent)" }
                      : undefined
                  }
                >
                  {new Date(i.createdAt).toLocaleDateString()}
                </button>
              ))}
            </div>
          )}

          {/* CONCLUSION STATE — leads the panel, so "we don't know yet" is the
              headline whenever that is the honest answer. */}
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--surface-border)", background: "var(--surface-2, var(--surface-1))" }}
          >
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {INVESTIGATION_CONCLUSION_LABEL[active.conclusion.kind]}
            </p>
            <p className="mt-1 text-sm text-foreground">{active.conclusion.summary}</p>
            {active.conclusion.nextStep && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Next: {active.conclusion.nextStep}
              </p>
            )}
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">
              Autonomy: {active.autonomy} — explain, compare and prepare only
            </p>
          </div>

          {alternatives && (
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--surface-border)", background: "var(--surface-1)" }}
            >
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" style={{ color: "var(--status-warning)" }} aria-hidden />
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  What would prove the leading explanation wrong?
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {alternatives.challenges.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            {ranked.map((h) => (
              <HypothesisCard
                key={h.id}
                investigation={active}
                hypothesis={h}
                onReject={() =>
                  investigationStore.reject(active.id, h.id, "Ruled out by operator review.")
                }
              />
            ))}
          </div>

          {active.tests.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <Beaker className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Prepared discriminating tests
                </span>
              </div>
              <div className="space-y-2">
                {active.tests.map((t) => (
                  <TestCard
                    key={t.id}
                    test={t}
                    onRecord={(outcomeKey) =>
                      investigationStore.recordTestResult(active.id, t.id, outcomeKey)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
