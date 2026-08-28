/**
 * Phase 4 — change-impact analysis.
 *
 * Answers "if I change this, what else is touched?" using only edges the
 * extractor literally observed. Two rules keep this honest:
 *
 * 1. **No causal language.** Impact is *structural reachability*, not a claim
 *    that a change will break something. The vocabulary here is "touches",
 *    "reachable from", "shares a dependency with" — never "causes" or
 *    "breaks". This mirrors the Causal Language Contract enforced on pattern
 *    intelligence.
 * 2. **Confidence follows coverage.** If the extractor did not understand part
 *    of the script, the impact set is explicitly incomplete and says so.
 */

import {
  MIN_TRUSTED_COVERAGE,
  coverageFor,
  type ScriptStructure,
} from "./script-contract";
import { buildDependencyGraph, traverseImpact } from "./dependency-graph";
import type { StructuralDiff } from "./script-diff";

export type ImpactConfidence = "supported" | "partial" | "insufficient";

export interface ImpactedComponent {
  id: string;
  name: string;
  kind: string;
  /** Hops from the changed component. 0 = changed directly. */
  distance: number;
  /** Why it is in the set — reachability, never causation. */
  relation: "changed" | "depends on a changed component" | "is used by a changed component";
}

export interface ChangeImpact {
  /** Components the diff altered directly. */
  seeds: string[];
  impacted: ImpactedComponent[];
  confidence: ImpactConfidence;
  /** Operator-facing caveats. Always rendered next to the result. */
  caveats: string[];
  /** Structural blast radius as a share of the script's components. */
  reachShare: number;
  truncated: boolean;
}

/**
 * @param after The structure being changed *to* — impact is assessed against
 *   the resulting script, since that is what the operator will run.
 */
export function analyzeChangeImpact(
  after: ScriptStructure,
  diff: StructuralDiff,
): ChangeImpact {
  const graph = buildDependencyGraph(after);

  // Seeds: everything the diff added or modified, plus the source side of any
  // dependency edge that appeared or disappeared.
  const seeds = new Set<string>();
  for (const delta of diff.components) {
    if (delta.kind === "added" || delta.kind === "modified") seeds.add(delta.id);
  }
  for (const delta of diff.dependencies) {
    if (delta.kind !== "unchanged") seeds.add(delta.dependency.fromId);
  }
  // Removed components no longer exist in `after`, so they cannot seed a
  // traversal — but whatever used to point at them can, and that is captured
  // by the dependency deltas above.

  const seedIds = [...seeds].filter((id) => graph.nodes.has(id)).sort();

  const upstream = traverseImpact(graph, seedIds, "upstream");
  const downstream = traverseImpact(graph, seedIds, "downstream");

  const impacted: ImpactedComponent[] = [];
  const push = (
    id: string,
    distance: number,
    relation: ImpactedComponent["relation"],
  ): void => {
    const node = graph.nodes.get(id);
    if (!node || impacted.some((i) => i.id === id)) return;
    impacted.push({
      id,
      name: node.component.name,
      kind: node.component.kind,
      distance,
      relation,
    });
  };

  for (const id of seedIds) push(id, 0, "changed");
  for (const hit of upstream) push(hit.id, hit.distance, "is used by a changed component");
  for (const hit of downstream) push(hit.id, hit.distance, "depends on a changed component");

  impacted.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));

  const coverage = coverageFor(after);
  const caveats: string[] = [];
  let confidence: ImpactConfidence = "supported";

  if (coverage < MIN_TRUSTED_COVERAGE) {
    confidence = "insufficient";
    caveats.push(
      `Only ${Math.round(coverage * 100)}% of this script was recognised — the impact set is incomplete.`,
    );
  } else if (after.unknowns.length > 0) {
    confidence = "partial";
    caveats.push(
      `${after.unknowns.length} line(s) could not be classified; components referenced only from those lines are missing here.`,
    );
  }

  const unresolved = after.dependencies.filter((d) => d.resolution === "unresolved").length;
  if (unresolved > 0) {
    if (confidence === "supported") confidence = "partial";
    caveats.push(
      `${unresolved} dependency target(s) do not match any component in this script and could not be followed.`,
    );
  }

  const external = after.dependencies.filter((d) => d.resolution === "external").length;
  if (external > 0) {
    caveats.push(
      `${external} reference(s) point outside this script; impact beyond this script is not assessed.`,
    );
  }

  caveats.push("Structural reachability only — this does not predict runtime behaviour.");

  return {
    seeds: seedIds,
    impacted,
    confidence,
    caveats,
    reachShare:
      after.components.length === 0 ? 0 : impacted.length / after.components.length,
    truncated: upstream.length + downstream.length >= 300,
  };
}
