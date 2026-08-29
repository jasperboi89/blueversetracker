/**
 * Phase 8 — bounded candidate generation (Parts 4, 5, 27, 29, 30).
 *
 * Candidates come from canonical signals the portal already owns. Generation is
 * DETERMINISTIC and bounded: it never runs continuously, never enumerates the
 * whole ledger, and never invents a mechanism it cannot point at.
 *
 * AI and operators may also PROPOSE; both are normalised into the same
 * canonical structure by `structureProposal`, and both are deduplicated by
 * mechanism, not by wording (Part 29). Origin never confers strength (Part 27):
 * an operator hypothesis and a machine hypothesis start identical.
 */

import type { AnomalySignal } from "@/lib/core/anomaly-contract";
import type { PatternObservation } from "@/lib/core/pattern-intelligence";
import type { ScriptStructure } from "@/lib/script/script-contract";
import { coverageFor } from "@/lib/script/script-contract";
import {
  HYPOTHESIS_CALC_VERSION,
  INVESTIGATION_AUTONOMY_CAP,
  INVESTIGATION_SCHEMA_VERSION,
  type Hypothesis,
  type HypothesisOrigin,
  type HypothesisPrediction,
  type HypothesisType,
  type InvestigationObservation,
} from "./hypothesis-contract";

const MAX_CANDIDATES = 6;

export interface CandidateInput {
  investigationId: string;
  accountId: string;
  observations: readonly InvestigationObservation[];
  patterns?: readonly PatternObservation[];
  anomalies?: readonly AnomalySignal[];
  /** Structure of the script currently in context, when one is. */
  structure?: ScriptStructure;
  /** Short mechanism labels drawn from prior verified resolutions. */
  resolutionMechanisms?: readonly { id: string; label: string }[];
  now?: Date;
}

interface Seed {
  type: HypothesisType;
  title: string;
  statement: string;
  mechanism: string;
  origin: HypothesisOrigin;
  predictions: string[];
  assumptions?: string[];
}

function predictionsFrom(base: string, statements: string[]): HypothesisPrediction[] {
  return statements.map((statement, i) => ({
    id: `${base}:p${i + 1}`,
    statement,
    observable: "Compare the stated expectation against a recorded run of the flow.",
    outcome: "unobserved" as const,
  }));
}

/** Mechanism fingerprint used for semantic dedupe (Part 29). */
export function mechanismKey(text: string): string {
  const stop = new Set([
    "the","a","an","is","are","was","were","of","to","in","on","for","and","or","that","this",
    "it","be","been","may","might","could","value","field","because","when","after","before",
    "not","no","its","by","with","from","at","during","under","incorrect","wrong",
  ]);
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stop.has(w)),
    ),
  ]
    .sort()
    .join(" ");
}

function similar(a: string, b: string): boolean {
  const A = new Set(mechanismKey(a).split(" ").filter(Boolean));
  const B = new Set(mechanismKey(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return false;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  const jaccard = shared / (A.size + B.size - shared);
  return jaccard >= 0.6;
}

/**
 * Drop semantically redundant hypotheses, keeping the first occurrence. Two
 * hypotheses that restate one mechanism are one hypothesis, not competition.
 */
export function dedupeHypotheses<T extends { title: string; mechanism: string }>(items: T[]): T[] {
  const kept: T[] = [];
  for (const item of items) {
    // Mechanism is identity here: two cards with different labels that name the
    // same mechanism are one explanation, not two competitors.
    const dup = kept.some((k) => similar(k.mechanism, item.mechanism));
    if (!dup) kept.push(item);
  }
  return kept;
}

function toHypothesis(seed: Seed, input: CandidateInput, index: number, now: Date): Hypothesis {
  const id = `${input.investigationId}:h${index + 1}`;
  const iso = now.toISOString();
  return {
    id,
    investigationId: input.investigationId,
    accountId: input.accountId,
    hypothesisType: seed.type,
    title: seed.title,
    statement: seed.statement,
    explains: input.observations.map((o) => o.id),
    mechanism: seed.mechanism,
    relationClaim: "associated",
    assumptions: (seed.assumptions ?? []).map((statement, i) => ({
      id: `${id}:a${i + 1}`,
      statement,
      verified: false,
    })),
    predictions: predictionsFrom(id, seed.predictions),
    status: "proposed",
    strength: "insufficient",
    confidence: "low",
    origin: seed.origin,
    strengthRationale: ["Newly proposed; no evidence has been linked yet."],
    autonomy: INVESTIGATION_AUTONOMY_CAP,
    createdAt: iso,
    updatedAt: iso,
    hypothesisVersion: 1,
    calcVersion: HYPOTHESIS_CALC_VERSION,
    schemaVersion: INVESTIGATION_SCHEMA_VERSION,
  };
}

/**
 * Bounded deterministic candidate generation. Returns [] rather than filling
 * the workspace with speculation when nothing canonical supports a mechanism —
 * "no supported causal explanation yet" is a respectable outcome (Part 30).
 */
export function generateCandidates(input: CandidateInput): Hypothesis[] {
  const now = input.now ?? new Date();
  const seeds: Seed[] = [];

  const structure = input.structure;
  if (structure) {
    const coverage = coverageFor(structure);
    const unresolved = structure.dependencies.filter((d) => d.resolution === "unresolved");
    if (unresolved.length > 0 && coverage >= 0.4) {
      seeds.push({
        type: "configuration_script_path",
        title: "A script path reaches an unresolved target",
        statement:
          "The observed behaviour may follow a script path whose target could not be resolved in this version.",
        mechanism:
          "A dependency edge references a target with no matching component in this script version, so the path taken at runtime is not represented structurally.",
        origin: "script_intelligence",
        predictions: [
          "The behaviour appears only on flows that traverse the unresolved reference.",
          "Flows that avoid the reference complete normally.",
        ],
        assumptions: [
          `Structural recognition of ${Math.round(coverage * 100)}% covers the relevant part of the script.`,
        ],
      });
    }
    const branchy = structure.components.filter((c) => c.kind === "branch").length;
    if (branchy >= 2) {
      seeds.push({
        type: "routing_business_rule",
        title: "A conditional branch routes this case differently",
        statement:
          "A conditional rule in the script may send this case down a different path than the operator expects.",
        mechanism:
          "One of the recorded branch components evaluates differently for this input, selecting an alternative path.",
        origin: "script_intelligence",
        predictions: [
          "Inputs that avoid the branch condition behave as expected.",
          "The behaviour reproduces consistently for inputs that satisfy the condition.",
        ],
      });
    }
  }

  for (const a of input.anomalies ?? []) {
    if (a.state !== "anomaly") continue;
    if (a.anomalyType === "post_change_activity") {
      seeds.push({
        type: "configuration_script_path",
        title: "Recent programmed change is temporally associated with the behaviour",
        statement:
          "A recent change to this account's programming is temporally associated with the observed activity.",
        mechanism:
          "A change record landed shortly before the observed activity, so the changed components are candidates for inspection.",
        origin: "anomaly",
        predictions: [
          "The behaviour is absent in flows that do not touch the changed components.",
          "Records from before the change do not show the behaviour.",
        ],
        assumptions: ["Temporal association is not evidence of a causal link."],
      });
    }
    if (a.anomalyType === "issue_concentration" || a.anomalyType === "recurrence_acceleration") {
      seeds.push({
        type: "data_state",
        title: "A recurring input or state shape drives the concentration",
        statement:
          "A repeated input or stored state shape may account for the concentration of similar work.",
        mechanism:
          "The same category of input reaches the same handling path repeatedly, producing clustered outcomes.",
        origin: "anomaly",
        predictions: [
          "Cases in the cluster share an identifiable input characteristic.",
          "Cases outside the cluster do not share it.",
        ],
      });
    }
    if (a.anomalyType === "duration_anomaly") {
      seeds.push({
        type: "integration_system",
        title: "An external dependency slows the flow",
        statement:
          "An external integration or system may account for the longer handling durations.",
        mechanism:
          "A step that waits on an external system takes longer than usual, extending overall duration.",
        origin: "anomaly",
        predictions: [
          "Durations recover when the external step is skipped or stubbed.",
          "Steps not touching the integration keep their usual duration.",
        ],
      });
    }
    if (a.anomalyType === "quiet_to_active") {
      seeds.push({
        type: "timing_schedule",
        title: "Time-of-day or schedule state changes handling",
        statement:
          "Business-hour, holiday or schedule state may account for the behaviour differing by time.",
        mechanism:
          "A schedule-driven condition selects different handling depending on the time the case arrives.",
        origin: "anomaly",
        predictions: [
          "The behaviour reproduces inside one schedule window and not another.",
          "Identical inputs at a different time behave differently.",
        ],
      });
    }
  }

  for (const p of input.patterns ?? []) {
    if (p.severity === "info") continue;
    seeds.push({
      type: "workflow_process",
      title: "A workflow sequence reproduces the situation",
      statement:
        "A recurring sequence of operator and system steps may account for the repeated observations.",
      mechanism:
        "The same ordering of steps recurs across the related records, producing the same end state.",
      origin: "pattern_intelligence",
      predictions: [
        "Following the sequence reproduces the observation.",
        "A different ordering does not reproduce it.",
      ],
    });
    break;
  }

  for (const r of (input.resolutionMechanisms ?? []).slice(0, 2)) {
    seeds.push({
      type: "data_state",
      title: `A previously repaired mechanism may apply again: ${r.label}`.slice(0, 120),
      statement: `A mechanism recorded in a prior verified resolution (${r.label}) may also account for this behaviour.`,
      mechanism:
        "A prior verified fix on this account addressed a similar mechanism; the same mechanism is a candidate here. A previous fix does not establish the current explanation.",
      origin: "resolution_memory",
      predictions: [
        "The conditions that triggered the earlier issue are present again.",
        "Applying the earlier check reproduces the earlier signature.",
      ],
      assumptions: ["The earlier resolution's conditions still hold for this account."],
    });
  }

  if (seeds.length === 0 && input.observations.length > 0) {
    seeds.push({
      type: "unknown",
      title: "No mechanism is supported by the available evidence yet",
      statement:
        "The available canonical evidence does not yet support a specific mechanism for this observation.",
      mechanism:
        "Insufficient structural or historical evidence to name a mechanism. Collecting a discriminating observation is the next step.",
      origin: "deterministic_rule",
      predictions: [],
    });
  }

  const deduped = dedupeHypotheses(seeds).slice(0, MAX_CANDIDATES);
  return deduped.map((s, i) => toHypothesis(s, input, i, now));
}

/* ------------------------------------------------------------------ */
/* Parts 27 & 28 — operator / AI proposals                              */
/* ------------------------------------------------------------------ */

export interface HypothesisProposal {
  title: string;
  statement: string;
  mechanism?: string;
  hypothesisType?: HypothesisType;
  predictions?: string[];
  assumptions?: string[];
  explains?: string[];
}

/**
 * Normalise a free-form proposal (operator typed, or AI drafted) into the
 * canonical structure. An AI proposal enters the engine ONLY through here, and
 * enters it as PROPOSED with no evidence and no strength.
 */
export function structureProposal(
  proposal: HypothesisProposal,
  ctx: { investigationId: string; accountId: string; index: number; origin: "operator" | "ai_proposed" },
  now: Date = new Date(),
): Hypothesis {
  const seed: Seed = {
    type: proposal.hypothesisType ?? "unknown",
    title: proposal.title.trim().slice(0, 140),
    statement: proposal.statement.trim().slice(0, 400),
    mechanism:
      (proposal.mechanism ?? "").trim().slice(0, 600) ||
      "No mechanism supplied; the explanation is not yet testable until one is stated.",
    origin: ctx.origin,
    predictions: (proposal.predictions ?? []).map((p) => p.trim().slice(0, 240)).filter(Boolean),
    assumptions: proposal.assumptions,
  };
  return toHypothesis(
    seed,
    {
      investigationId: ctx.investigationId,
      accountId: ctx.accountId,
      observations: (proposal.explains ?? []).map((id) => ({
        id,
        statement: "",
        source: "operator_input",
        refs: [],
        recordedAt: now.toISOString(),
      })),
    },
    ctx.index,
    now,
  );
}
