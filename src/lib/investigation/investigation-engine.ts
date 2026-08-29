/**
 * Phase 8 — investigation orchestration (Parts 5, 8, 25, 30, 31, 33, 35–37, 48, 49, 51).
 *
 * Pure functions over an `Investigation` record: every operation returns a new
 * investigation plus the timeline entries it produced. Nothing here writes,
 * emits or calls an AI; the store handles persistence and ledger emission.
 *
 * Two behaviours are deliberate and load-bearing:
 *   - CONTRADICTION-FIRST. `recomputeInvestigation` re-derives strength from all
 *     evidence every time, so contradictory evidence can never be shadowed by
 *     accumulating support.
 *   - HISTORY IS APPEND-ONLY. Recomputation never edits earlier timeline
 *     entries, and a hypothesis version increments rather than being rewritten.
 */

import {
  INVESTIGATION_AUTONOMY_CAP,
  INVESTIGATION_SCHEMA_VERSION,
  HYPOTHESIS_CALC_VERSION,
  type DiscriminatingTest,
  type Hypothesis,
  type HypothesisEvidenceLink,
  type Investigation,
  type InvestigationConclusion,
  type InvestigationObservation,
  type InvestigationTimelineEntry,
  type InvestigationTimelineKind,
} from "./hypothesis-contract";
import { assessStrength, evaluateVerification, rankHypotheses } from "./hypothesis-strength";
import { buildDiscriminatingTests } from "./discriminating-tests";
import { effectOfResult } from "./discriminating-tests";

export interface EngineResult {
  investigation: Investigation;
  entries: InvestigationTimelineEntry[];
}

let entrySeq = 0;
function entry(
  kind: InvestigationTimelineKind,
  summary: string,
  at: string,
  extra: Partial<InvestigationTimelineEntry> = {},
): InvestigationTimelineEntry {
  entrySeq += 1;
  return { id: `${at}:${kind}:${entrySeq}`, kind, at, summary, ...extra };
}

export interface CreateInvestigationInput {
  id: string;
  accountId: string;
  title: string;
  observations: InvestigationObservation[];
  contextRef?: Investigation["contextRef"];
  scriptContext?: Investigation["scriptContext"];
  openedBy?: "operator" | "system";
  now?: Date;
}

export function createInvestigation(input: CreateInvestigationInput): EngineResult {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  const investigation: Investigation = {
    id: input.id,
    accountId: input.accountId,
    contextRef: input.contextRef,
    title: input.title,
    status: "open",
    observations: input.observations,
    hypotheses: [],
    evidence: [],
    tests: [],
    timeline: [],
    conclusion: {
      kind: "insufficient_evidence",
      summary: "No supported causal explanation yet. No hypotheses have been proposed.",
      nextStep: "Propose competing explanations, then prepare a discriminating test.",
      evaluatedAt: iso,
    },
    scriptContext: input.scriptContext,
    openedBy: input.openedBy ?? "operator",
    createdAt: iso,
    updatedAt: iso,
    autonomy: INVESTIGATION_AUTONOMY_CAP,
    calcVersion: HYPOTHESIS_CALC_VERSION,
    schemaVersion: INVESTIGATION_SCHEMA_VERSION,
  };
  const entries = [
    entry("investigation_created", `Investigation opened: ${input.title}`, iso),
    ...input.observations.map((o) =>
      entry("observation_added", o.statement, iso, { evidenceId: o.id }),
    ),
  ];
  return { investigation: { ...investigation, timeline: entries }, entries };
}

export function addHypotheses(
  inv: Investigation,
  hypotheses: Hypothesis[],
  now: Date = new Date(),
): EngineResult {
  const iso = now.toISOString();
  const fresh = hypotheses.filter((h) => !inv.hypotheses.some((x) => x.id === h.id));
  const entries = fresh.map((h) =>
    entry("hypothesis_proposed", `${h.title} (${h.origin.replace(/_/g, " ")})`, iso, {
      hypothesisId: h.id,
      context: { scriptFingerprint: inv.scriptContext?.fingerprint, scriptVersionId: inv.scriptContext?.versionId },
    }),
  );
  return recompute(
    { ...inv, hypotheses: [...inv.hypotheses, ...fresh], updatedAt: iso },
    entries,
    now,
  );
}

export function linkEvidence(
  inv: Investigation,
  links: HypothesisEvidenceLink[],
  now: Date = new Date(),
): EngineResult {
  const iso = now.toISOString();
  const fresh = links.filter((l) => !inv.evidence.some((x) => x.id === l.id));
  const entries = fresh.map((l) =>
    entry(
      "evidence_linked",
      `${l.stance.toUpperCase()} (${l.strength}): ${l.statement}`.slice(0, 240),
      iso,
      { hypothesisId: l.hypothesisId, evidenceId: l.id },
    ),
  );
  return recompute({ ...inv, evidence: [...inv.evidence, ...fresh], updatedAt: iso }, entries, now);
}

export function prepareTests(
  inv: Investigation,
  options: { structuralCoverage?: number; prerequisites?: { label: string; available: boolean }[] } = {},
  now: Date = new Date(),
): EngineResult {
  const iso = now.toISOString();
  const built = buildDiscriminatingTests({
    investigationId: inv.id,
    hypotheses: inv.hypotheses,
    prerequisites: options.prerequisites,
    structuralCoverage: options.structuralCoverage,
    now,
  });
  // Recorded results are never discarded by re-preparation (append-only history).
  const recorded = inv.tests.filter((t) => t.status === "recorded");
  const recordedIds = new Set(recorded.map((t) => t.id));
  const next = [...recorded, ...built.filter((t) => !recordedIds.has(t.id))];
  const entries = built
    .filter((t) => !inv.tests.some((x) => x.id === t.id))
    .map((t) =>
      entry("test_prepared", `${t.title} — ${t.utility.klass.replace(/_/g, " ")}`, iso, { testId: t.id }),
    );
  return recompute({ ...inv, tests: next, updatedAt: iso }, entries, now);
}

/**
 * Ingest a real test outcome (Parts 35 & 36). The mapping was fixed when the
 * test was prepared, so no interpretation happens here — including when the
 * result refutes the leading explanation.
 */
export function recordTestResult(
  inv: Investigation,
  testId: string,
  outcomeKey: string,
  options: { notes?: string; now?: Date } = {},
): EngineResult {
  const now = options.now ?? new Date();
  const iso = now.toISOString();
  const test = inv.tests.find((t) => t.id === testId);
  if (!test) return { investigation: inv, entries: [] };

  const effect = effectOfResult(test, outcomeKey);
  const recordedTest: DiscriminatingTest = {
    ...test,
    status: "recorded",
    result: {
      outcomeKey,
      outcome: effect.strengthened.length > 0 ? "match" : effect.weakened.length > 0 ? "mismatch" : "inconclusive",
      notes: options.notes?.slice(0, 400),
      recordedAt: iso,
      recordedBy: "operator",
    },
  };

  const hypotheses = inv.hypotheses.map((h) => {
    const outcome = effect.predictionOutcomes.find((p) => p.hypothesisId === h.id)?.outcome;
    if (!outcome) return h;
    return {
      ...h,
      predictions: h.predictions.map((p) =>
        test.predictionIds.includes(p.id) && p.outcome === "unobserved"
          ? { ...p, outcome, testId, recordedAt: iso }
          : p,
      ),
      hypothesisVersion: h.hypothesisVersion + 1,
      updatedAt: iso,
    };
  });

  const entries = [
    entry("test_result_recorded", `${test.title} → ${outcomeKey}`, iso, { testId }),
    ...effect.strengthened.map((id) =>
      entry("hypothesis_strengthened", "Test result points toward this explanation.", iso, { hypothesisId: id, testId }),
    ),
    ...effect.weakened.map((id) =>
      entry("hypothesis_weakened", "Test result points away from this explanation.", iso, { hypothesisId: id, testId }),
    ),
  ];

  return recompute(
    {
      ...inv,
      hypotheses,
      tests: inv.tests.map((t) => (t.id === testId ? recordedTest : t)),
      updatedAt: iso,
    },
    entries,
    now,
  );
}

export function rejectHypothesis(
  inv: Investigation,
  hypothesisId: string,
  reason: string,
  now: Date = new Date(),
): EngineResult {
  const iso = now.toISOString();
  const entries = [
    entry("hypothesis_rejected", reason.slice(0, 240), iso, { hypothesisId }),
  ];
  return recompute(
    {
      ...inv,
      hypotheses: inv.hypotheses.map((h) =>
        h.id === hypothesisId
          ? { ...h, status: "rejected", updatedAt: iso, hypothesisVersion: h.hypothesisVersion + 1 }
          : h,
      ),
      updatedAt: iso,
    },
    entries,
    now,
  );
}

/**
 * Attempt the canonical verification rule for one hypothesis. Only this path
 * can set VERIFIED, and it refuses unless every requirement is met.
 */
export function attemptVerification(
  inv: Investigation,
  hypothesisId: string,
  options: { operatorConfirmed?: boolean; now?: Date } = {},
): EngineResult & { unmet: string[] } {
  const now = options.now ?? new Date();
  const iso = now.toISOString();
  const h = inv.hypotheses.find((x) => x.id === hypothesisId);
  if (!h) return { investigation: inv, entries: [], unmet: ["Hypothesis not found"] };

  const evaluation = evaluateVerification(h, inv.hypotheses, inv.evidence, inv.tests, {
    operatorConfirmed: options.operatorConfirmed,
    structuralCoverage: inv.scriptContext?.recognition,
  });
  if (!evaluation.verified) {
    return { investigation: inv, entries: [], unmet: evaluation.unmet };
  }

  const entries = [
    entry("hypothesis_verified", "All canonical verification requirements met.", iso, { hypothesisId }),
  ];
  const next = recompute(
    {
      ...inv,
      hypotheses: inv.hypotheses.map((x) =>
        x.id === hypothesisId
          ? {
              ...x,
              status: "verified" as const,
              strength: "verified" as const,
              relationClaim: "sufficient_under_tested_conditions" as const,
              updatedAt: iso,
              hypothesisVersion: x.hypothesisVersion + 1,
            }
          : x,
      ),
      updatedAt: iso,
    },
    entries,
    now,
  );
  return { ...next, unmet: [] };
}

/* ------------------------------------------------------------------ */
/* Recompute + conclusion                                              */
/* ------------------------------------------------------------------ */

/**
 * Re-derive strengths, statuses and the conclusion from ALL current evidence.
 * Incremental by construction — it is only ever called after a change, never on
 * a timer, so the portal is never doing background hypothesis work (Part 51).
 */
export function recomputeInvestigation(inv: Investigation, now: Date = new Date()): EngineResult {
  return recompute(inv, [], now);
}

function recompute(
  inv: Investigation,
  pending: InvestigationTimelineEntry[],
  now: Date,
): EngineResult {
  const iso = now.toISOString();
  const entries = [...pending];

  const hypotheses = inv.hypotheses.map((h) => {
    if (h.status === "verified") return h;
    const a = assessStrength(h, inv.evidence, inv.tests);
    if (a.strength === h.strength && a.status === h.status) {
      return { ...h, strengthRationale: a.rationale, confidence: a.confidence };
    }
    entries.push(
      entry(
        "hypothesis_updated",
        `${h.title}: ${h.strength} → ${a.strength} (${a.status.replace(/_/g, " ")})`,
        iso,
        { hypothesisId: h.id },
      ),
    );
    return {
      ...h,
      strength: a.strength,
      status: a.status,
      confidence: a.confidence,
      strengthRationale: a.rationale,
      relationClaim:
        a.strength === "strongly_supported" ? ("possibly_contributing" as const) : h.relationClaim,
      hypothesisVersion: h.hypothesisVersion + 1,
      updatedAt: iso,
    };
  });

  const conclusion = concludeInvestigation({ ...inv, hypotheses }, now);
  if (conclusion.kind !== inv.conclusion.kind) {
    entries.push(entry("conclusion_updated", conclusion.summary, iso));
  }

  return {
    investigation: {
      ...inv,
      hypotheses,
      conclusion,
      timeline: [...inv.timeline, ...entries],
      updatedAt: iso,
    },
    entries,
  };
}

/** Part 37 — the conclusion is never collapsed into "root cause found". */
export function concludeInvestigation(inv: Investigation, now: Date = new Date()): InvestigationConclusion {
  const iso = now.toISOString();
  const live = inv.hypotheses.filter((h) => h.status !== "rejected" && h.status !== "expired");
  const verified = live.find((h) => h.status === "verified");
  if (verified) {
    return {
      kind: "cause_verified",
      leadingHypothesisId: verified.id,
      summary: `Verified under the canonical rule: ${verified.title}. Verification is bounded by the conditions actually tested.`,
      evaluatedAt: iso,
    };
  }
  if (inv.hypotheses.length > 0 && live.length === 0) {
    return {
      kind: "hypotheses_rejected",
      summary: "Every proposed explanation has been rejected. New evidence or a new mechanism is needed.",
      nextStep: "Collect a fresh observation, then propose a distinct mechanism.",
      evaluatedAt: iso,
    };
  }

  const ranked = rankHypotheses(live);
  const strong = ranked.filter(
    (h) => h.strength === "supported" || h.strength === "strongly_supported",
  );
  const plausible = ranked.filter((h) => h.strength === "plausible");
  const nextTest = inv.tests.find((t) => t.status === "prepared" && t.utility.klass === "high_value");
  const nextStep = nextTest
    ? `Run the prepared discriminating test: ${nextTest.title}.`
    : "Prepare a discriminating test — more general data will not separate these explanations.";

  if (strong.length === 1 && plausible.length === 0) {
    return {
      kind: "most_supported_explanation",
      leadingHypothesisId: strong[0]!.id,
      summary: `${strong[0]!.title} is currently the most supported explanation. Most supported is not verified.`,
      nextStep,
      evaluatedAt: iso,
    };
  }
  if (strong.length + plausible.length >= 2) {
    return {
      kind: "multiple_plausible_explanations",
      leadingHypothesisId: ranked[0]?.id,
      summary: `${strong.length + plausible.length} explanations currently fit the available evidence. None is established.`,
      nextStep,
      evaluatedAt: iso,
    };
  }
  return {
    kind: "insufficient_evidence",
    summary:
      "No supported causal explanation yet. The available evidence does not distinguish any mechanism.",
    nextStep,
    evaluatedAt: iso,
  };
}

/* ------------------------------------------------------------------ */
/* Part 31 — alternative explanation search                             */
/* ------------------------------------------------------------------ */

export interface AlternativeSearchResult {
  hypothesisId: string;
  /** Questions the operator must be able to answer before trusting the lead. */
  challenges: string[];
  /** Contradictions and counterexamples already on file. */
  openContradictions: string[];
  counterexamples: string[];
  /** Distinct mechanisms currently competing. */
  alternativeMechanisms: string[];
}

/**
 * For the leading hypothesis, actively look for the evidence that would break
 * it. This runs against the FAVOURITE by design — the system's job is to fight
 * confirmation bias, not to build a case.
 */
export function searchAlternatives(inv: Investigation): AlternativeSearchResult | null {
  const live = inv.hypotheses.filter((h) => h.status !== "rejected" && h.status !== "expired");
  const lead = rankHypotheses(live)[0];
  if (!lead) return null;
  const mine = inv.evidence.filter((e) => e.hypothesisId === lead.id);
  return {
    hypothesisId: lead.id,
    challenges: [
      "Is there a recorded case where the symptom occurred WITHOUT the proposed mechanism?",
      "Is there a recorded case where the proposed mechanism occurred WITHOUT the symptom?",
      "Which observation does this explanation fail to account for?",
      "What result would refute it, and has that test been run?",
    ],
    openContradictions: mine.filter((e) => e.stance === "contradicts").map((e) => e.statement),
    counterexamples: mine.filter((e) => e.counterexample).map((e) => e.statement),
    alternativeMechanisms: live.filter((h) => h.id !== lead.id).map((h) => h.mechanism),
  };
}

/* ------------------------------------------------------------------ */
/* Part 49 — temporal integrity                                         */
/* ------------------------------------------------------------------ */

/**
 * Retrospective view of an investigation as it stood at `at`. Later evidence
 * and later test results are excluded, so historical evaluation of hypothesis
 * quality cannot leak information that was unavailable at the time.
 */
export function investigationAsOf(inv: Investigation, at: number): Investigation {
  const before = (iso?: string) => (iso ? Date.parse(iso) <= at : true);
  const evidence = inv.evidence.filter((e) => before(e.recordedAt));
  const tests = inv.tests
    .filter((t) => before(t.preparedAt))
    .map((t) => (t.result && !before(t.result.recordedAt) ? { ...t, status: "prepared" as const, result: undefined } : t));
  const hypotheses = inv.hypotheses
    .filter((h) => before(h.createdAt))
    .map((h) => ({
      ...h,
      predictions: h.predictions.map((p) =>
        p.recordedAt && !before(p.recordedAt)
          ? { ...p, outcome: "unobserved" as const, testId: undefined, recordedAt: undefined }
          : p,
      ),
    }));
  const snapshot: Investigation = {
    ...inv,
    hypotheses,
    evidence,
    tests,
    timeline: inv.timeline.filter((t) => before(t.at)),
  };
  return recompute(snapshot, [], new Date(at)).investigation;
}
