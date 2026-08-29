/**
 * Phase 8 — simulation & counterfactual integration (Parts 13, 14, 34).
 *
 * Phase 7 simulation is deterministic and authoritative ONLY for structure it
 * actually recognises. So it can answer "is this mechanism structurally
 * possible?" — never "did this cause the incident?".
 *
 *   STRUCTURAL PLAUSIBILITY   a path exists / does not exist in the model
 *   CAUSAL VERIFICATION       an entirely separate standard (see hypothesis-strength)
 *
 * A structural match therefore yields SUPPORTING evidence at most, and never
 * DIRECT causal evidence.
 */

import { buildDependencyGraph, traverseImpact } from "@/lib/script/dependency-graph";
import { coverageFor, MIN_TRUSTED_COVERAGE, type ScriptStructure } from "@/lib/script/script-contract";
import type { EvidenceStrength, HypothesisEvidenceLink } from "./hypothesis-contract";

export type PlausibilityVerdict =
  | "supports_plausibility"
  | "weakens_plausibility"
  | "indeterminate";

export interface PlausibilityAssessment {
  verdict: PlausibilityVerdict;
  /** Deterministic reading of the structure. Never causal wording. */
  statement: string;
  evidenceStrength: EvidenceStrength;
  coverage: number;
  pathLength?: number;
  warnings: string[];
}

/**
 * Does a structural path exist from `fromComponentId` to `toComponentId`?
 * Below trusted coverage the answer is INDETERMINATE — a partial reading of a
 * script cannot rule a path in or out.
 */
export function assessStructuralPlausibility(
  structure: ScriptStructure,
  fromComponentId: string,
  toComponentId: string,
): PlausibilityAssessment {
  const coverage = coverageFor(structure);
  const warnings: string[] = [];
  if (coverage < MIN_TRUSTED_COVERAGE) {
    warnings.push(
      `Structural recognition is ${Math.round(coverage * 100)}%, below the ${Math.round(MIN_TRUSTED_COVERAGE * 100)}% threshold for a trusted structural reading.`,
    );
    return {
      verdict: "indeterminate",
      statement:
        "The script model is too partial to say whether this path exists. No structural conclusion is drawn.",
      evidenceStrength: "unknown",
      coverage,
      warnings,
    };
  }

  const graph = buildDependencyGraph(structure);
  if (!graph.nodes.has(fromComponentId) || !graph.nodes.has(toComponentId)) {
    return {
      verdict: "indeterminate",
      statement: "One or both components are not present in this script version.",
      evidenceStrength: "unknown",
      coverage,
      warnings: ["SCRIPT VERSION UNKNOWN for at least one referenced component."],
    };
  }

  const hit = traverseImpact(graph, [fromComponentId], "downstream").find(
    (h) => h.id === toComponentId,
  );
  if (hit) {
    return {
      verdict: "supports_plausibility",
      statement:
        `A structural path of ${hit.distance} hop(s) connects these components in this script version. ` +
        "This shows the mechanism is structurally possible; it does not establish that it produced the observed behaviour.",
      evidenceStrength: "supporting",
      coverage,
      pathLength: hit.distance,
      warnings,
    };
  }

  const unresolved = structure.dependencies.filter((d) => d.resolution === "unresolved").length;
  if (unresolved > 0) {
    warnings.push(
      `${unresolved} unresolved reference(s) mean a path could exist through structure the extractor could not follow.`,
    );
    return {
      verdict: "indeterminate",
      statement:
        "No recognised path connects these components, but unresolved references leave the question open.",
      evidenceStrength: "unknown",
      coverage,
      warnings,
    };
  }

  return {
    verdict: "weakens_plausibility",
    statement:
      "No structural path connects these components in this fully recognised script version, so the proposed mechanism is not represented here.",
    evidenceStrength: "strong",
    coverage,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Part 14 — bounded counterfactual                                     */
/* ------------------------------------------------------------------ */

export interface CounterfactualQuery {
  structure: ScriptStructure;
  /** Component the hypothesis says participates in the mechanism. */
  componentId: string;
  /** Structural condition being reached, expressed as a component id. */
  conditionComponentId: string;
  /** Counterfactual: remove the component from the model and re-ask. */
  removeComponent?: boolean;
}

export interface CounterfactualResult extends PlausibilityAssessment {
  /** Reading with the observed configuration. */
  observed: PlausibilityVerdict;
  /** Reading under the counterfactual overlay. */
  counterfactual: PlausibilityVerdict;
}

/**
 * Bounded counterfactual: derive an in-memory overlay of the structure and
 * re-run the same deterministic reachability question. Production structure is
 * never mutated — the overlay is a derivation, discarded when the call returns.
 */
export function runCounterfactual(query: CounterfactualQuery): CounterfactualResult {
  const observed = assessStructuralPlausibility(
    query.structure,
    query.componentId,
    query.conditionComponentId,
  );

  const overlay: ScriptStructure = {
    ...query.structure,
    components: query.structure.components.filter(
      (c) => !query.removeComponent || c.id !== query.componentId,
    ),
    dependencies: query.structure.dependencies.filter(
      (d) => !query.removeComponent || (d.fromId !== query.componentId && d.toId !== query.componentId),
    ),
  };

  const roots = overlay.components.filter((c) => c.id !== query.componentId).map((c) => c.id);
  const alternate =
    roots.length === 0
      ? { verdict: "indeterminate" as PlausibilityVerdict, statement: "", warnings: [] as string[] }
      : assessStructuralPlausibility(overlay, roots[0]!, query.conditionComponentId);

  let verdict: PlausibilityVerdict;
  let statement: string;
  if (observed.verdict === "supports_plausibility" && alternate.verdict !== "supports_plausibility") {
    verdict = "supports_plausibility";
    statement =
      "The structural condition is reachable with the observed configuration and not without it. " +
      "That is structural plausibility under the stated overlay, not causal proof.";
  } else if (
    observed.verdict === "supports_plausibility" &&
    alternate.verdict === "supports_plausibility"
  ) {
    verdict = "weakens_plausibility";
    statement =
      "The structural condition remains reachable without the proposed component, so the component is not required by the model for this outcome.";
  } else {
    verdict = "indeterminate";
    statement = "The counterfactual reading is indeterminate; no structural conclusion is drawn.";
  }

  return {
    ...observed,
    verdict,
    statement,
    evidenceStrength: verdict === "indeterminate" ? "unknown" : "supporting",
    observed: observed.verdict,
    counterfactual: alternate.verdict,
    warnings: [...observed.warnings, ...alternate.warnings],
  };
}

/** Project a plausibility reading into an investigation evidence link. */
export function plausibilityToEvidence(
  assessment: PlausibilityAssessment,
  hypothesisId: string,
  now: Date = new Date(),
  source: "simulation" | "counterfactual_simulation" = "simulation",
): HypothesisEvidenceLink {
  const stance =
    assessment.verdict === "supports_plausibility"
      ? "supports"
      : assessment.verdict === "weakens_plausibility"
        ? "contradicts"
        : "unresolved";
  return {
    id: `${hypothesisId}:${source}:${assessment.verdict}`,
    hypothesisId,
    stance,
    // Structural plausibility never becomes DIRECT causal evidence.
    strength: stance === "unresolved" ? "unknown" : assessment.evidenceStrength,
    source,
    statement: assessment.statement,
    refs: [],
    recordedAt: now.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Part 34 — natural comparisons                                        */
/* ------------------------------------------------------------------ */

export interface NaturalComparison {
  /** Groups that differ in the condition of interest. */
  withCondition: { count: number; withSymptom: number };
  withoutCondition: { count: number; withSymptom: number };
}

/**
 * Read a naturally occurring split in historical data. This is a NATURAL
 * COMPARISON, explicitly not an experiment and explicitly not causal proof; its
 * value is in suggesting a stronger discriminating test.
 */
export function readNaturalComparison(c: NaturalComparison): {
  informative: boolean;
  statement: string;
  strength: EvidenceStrength;
} {
  const min = Math.min(c.withCondition.count, c.withoutCondition.count);
  if (min < 3) {
    return {
      informative: false,
      statement:
        "Too few records on one side of the comparison to read anything from the natural split.",
      strength: "unknown",
    };
  }
  const a = c.withCondition.withSymptom / c.withCondition.count;
  const b = c.withoutCondition.withSymptom / c.withoutCondition.count;
  const diff = a - b;
  if (Math.abs(diff) < 0.2) {
    return {
      informative: true,
      statement:
        "Records with and without the condition show a similar rate of the symptom — a natural comparison that does not favour the explanation.",
      strength: "weak",
    };
  }
  return {
    informative: true,
    statement:
      `Records with the condition show the symptom more often (${c.withCondition.withSymptom}/${c.withCondition.count}) than records without it (${c.withoutCondition.withSymptom}/${c.withoutCondition.count}). ` +
      "This is a natural comparison, not an experiment, and remains association only.",
    strength: diff > 0 ? "supporting" : "weak",
  };
}
