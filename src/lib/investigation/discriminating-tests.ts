/**
 * Phase 8 — the discriminating-test engine (Parts 10, 11, 12, 35, 36).
 *
 * Given competing hypotheses, propose tests whose OUTCOMES DIFFER between them.
 * A test that every hypothesis predicts identically eliminates nothing and is
 * marked LOW DISCRIMINATION rather than dressed up as progress.
 *
 * Every outcome branch carries a DETERMINISTIC mapping of which hypotheses it
 * strengthens and which it weakens. Recording a result never asks an AI what
 * the result meant — the mapping was fixed when the test was prepared.
 *
 * Tests are PREPARED, never executed. Execution stays with the operator, and
 * the prepared case is handed to the existing Test Intelligence surface rather
 * than to a second test framework.
 */

import type { RegressionTestCase } from "@/lib/script/test-intelligence";
import {
  type DiscriminatingOutcome,
  type DiscriminatingTest,
  type Hypothesis,
  type TestUtility,
} from "./hypothesis-contract";
import { mechanismKey } from "./hypothesis-generation";

const MAX_TESTS = 8;

/** Tokenised prediction signature — two hypotheses "agree" when these overlap. */
function predictionSignature(h: Hypothesis): Set<string> {
  return new Set(h.predictions.flatMap((p) => mechanismKey(p.statement).split(" ").filter(Boolean)));
}

function disagree(a: Hypothesis, b: Hypothesis): boolean {
  const A = predictionSignature(a);
  const B = predictionSignature(b);
  if (A.size === 0 || B.size === 0) return false;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return shared / Math.min(A.size, B.size) < 0.7;
}

export interface TestPrerequisite {
  label: string;
  available: boolean;
}

export interface DiscriminatingTestInput {
  investigationId: string;
  hypotheses: readonly Hypothesis[];
  /** Environment facts that gate a test, e.g. a sandbox account. */
  prerequisites?: readonly TestPrerequisite[];
  /** Structural recognition of the script in context, when there is one. */
  structuralCoverage?: number;
  now?: Date;
}

function classifyUtility(
  distinguished: number,
  missing: string[],
  cost: TestUtility["cost"],
): TestUtility {
  const rationale: string[] = [];
  let klass: TestUtility["klass"];
  if (missing.length > 0) {
    klass = "blocked";
    rationale.push(`Missing prerequisite(s): ${missing.join(", ")}.`);
  } else if (distinguished < 2) {
    klass = "low_discrimination";
    rationale.push("Every current hypothesis predicts the same outcome, so the result separates nothing.");
  } else if (distinguished >= 2 && cost === "low") {
    klass = "high_value";
    rationale.push(`Separates ${distinguished} hypotheses at low operational cost.`);
  } else {
    klass = "useful";
    rationale.push(`Separates ${distinguished} hypotheses, but costs more to run.`);
  }
  return {
    klass,
    hypothesesDistinguished: distinguished,
    informationGain: distinguished >= 3 ? "high" : distinguished === 2 ? "moderate" : "none",
    cost,
    safety: "safe",
    reversible: true,
    productionRisk: "none",
    missingPrerequisites: missing,
    rationale,
  };
}

/**
 * Build the bounded set of discriminating tests. Pairwise over hypotheses whose
 * predictions actually differ, ordered by utility so the cheapest test that
 * eliminates the most uncertainty comes first.
 */
export function buildDiscriminatingTests(input: DiscriminatingTestInput): DiscriminatingTest[] {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  const live = input.hypotheses.filter(
    (h) => h.status !== "rejected" && h.status !== "expired" && h.hypothesisType !== "unknown",
  );
  const missing = (input.prerequisites ?? []).filter((p) => !p.available).map((p) => p.label);
  const tests: DiscriminatingTest[] = [];

  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i]!;
      const b = live[j]!;
      if (tests.length >= MAX_TESTS) break;
      const separates = disagree(a, b);

      const outcomes: DiscriminatingOutcome[] = [
        {
          key: "matches_a",
          description: `Observed result matches what "${a.title}" predicts and not "${b.title}".`,
          strengthens: [a.id],
          weakens: [b.id],
        },
        {
          key: "matches_b",
          description: `Observed result matches what "${b.title}" predicts and not "${a.title}".`,
          strengthens: [b.id],
          weakens: [a.id],
        },
        {
          key: "both",
          description: "Both predicted signatures appear — a shared or third mechanism is in play.",
          strengthens: [],
          weakens: [a.id, b.id],
        },
        {
          key: "neither",
          description: "Neither predicted signature appears; both explanations lose support.",
          strengthens: [],
          weakens: [a.id, b.id],
        },
      ];

      const utility = classifyUtility(separates ? 2 : 1, missing, "low");

      tests.push({
        id: `${input.investigationId}:t${tests.length + 1}`,
        investigationId: input.investigationId,
        title: `Distinguish "${a.title}" from "${b.title}"`,
        hypothesisIds: [a.id, b.id],
        predictionIds: [...a.predictions.map((p) => p.id), ...b.predictions.map((p) => p.id)],
        steps: [
          "Record the starting state and inputs before the flow is exercised.",
          `Run the flow in the condition "${a.title}" predicts as failing.`,
          `Run the same inputs in the condition "${b.title}" predicts as failing.`,
          "Record which run reproduced the observation, and which did not.",
        ],
        requiredInputs: [
          "The same inputs in both runs — only the condition under test may vary.",
          "A recorded before/after state for the value in question.",
        ],
        safetyBoundary:
          "Preparation only. Run against a test account or a non-live path; this engine never executes the test and never changes production.",
        utility,
        outcomes,
        status: "prepared",
        preparedAt: iso,
      });
    }
  }

  if (live.length === 1) {
    const only = live[0]!;
    tests.push({
      id: `${input.investigationId}:t${tests.length + 1}`,
      investigationId: input.investigationId,
      title: `Attempt to refute "${only.title}"`,
      hypothesisIds: [only.id],
      predictionIds: only.predictions.map((p) => p.id),
      steps: [
        "Identify a condition under which this explanation predicts the behaviour must NOT occur.",
        "Exercise that condition and record whether the behaviour still occurs.",
      ],
      requiredInputs: ["A case the explanation says should be clean."],
      safetyBoundary: "Preparation only; run against a non-live path.",
      utility: classifyUtility(1, missing, "low"),
      outcomes: [
        {
          key: "refuted",
          description: "The behaviour occurred where this explanation says it must not.",
          strengthens: [],
          weakens: [only.id],
        },
        {
          key: "held",
          description: "The behaviour was absent, as this explanation predicts.",
          strengthens: [only.id],
          weakens: [],
        },
      ],
      status: "prepared",
      preparedAt: iso,
    });
  }

  const ORDER: Record<TestUtility["klass"], number> = {
    high_value: 0,
    useful: 1,
    low_discrimination: 2,
    blocked: 3,
  };
  return tests
    .sort((x, y) => ORDER[x.utility.klass] - ORDER[y.utility.klass] || x.title.localeCompare(y.title))
    .slice(0, MAX_TESTS);
}

/* ------------------------------------------------------------------ */
/* Part 12 — Test Intelligence reuse                                    */
/* ------------------------------------------------------------------ */

/** Project a discriminating test into the existing Test Intelligence shape. */
export function toRegressionCase(test: DiscriminatingTest): RegressionTestCase {
  return {
    id: `investigation:${test.id}`,
    title: test.title,
    rationale:
      `Prepared to distinguish ${test.hypothesisIds.length} competing explanation(s); ` +
      `utility ${test.utility.klass.replace(/_/g, " ")}. ${test.utility.rationale.join(" ")}`,
    priority: test.utility.klass === "high_value" ? "required" : "recommended",
    componentIds: [],
  };
}

/* ------------------------------------------------------------------ */
/* Parts 35 & 36 — deterministic result ingestion                       */
/* ------------------------------------------------------------------ */

export interface TestResultEffect {
  strengthened: string[];
  weakened: string[];
  /** Predictions whose outcome the result determines. */
  predictionOutcomes: Array<{ hypothesisId: string; outcome: "confirmed" | "refuted" }>;
}

/**
 * Map a recorded outcome onto hypothesis effects using ONLY the mapping fixed
 * at preparation time. An unknown outcome key changes nothing — it never falls
 * back to interpretation.
 */
export function effectOfResult(test: DiscriminatingTest, outcomeKey: string): TestResultEffect {
  const branch = test.outcomes.find((o) => o.key === outcomeKey);
  if (!branch) return { strengthened: [], weakened: [], predictionOutcomes: [] };
  return {
    strengthened: [...branch.strengthens],
    weakened: [...branch.weakens],
    predictionOutcomes: [
      ...branch.strengthens.map((hypothesisId) => ({ hypothesisId, outcome: "confirmed" as const })),
      ...branch.weakens.map((hypothesisId) => ({ hypothesisId, outcome: "refuted" as const })),
    ],
  };
}
