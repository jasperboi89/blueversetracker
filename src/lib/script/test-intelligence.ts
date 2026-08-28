/**
 * Phase 4 — Test Intelligence & regression suites.
 *
 * Derives *what an operator should re-test* from a structural diff. This is a
 * PREPARE-level capability: it proposes a checklist, records nothing as passed,
 * and never touches a production script.
 *
 * A test case is only proposed when it can name the structural reason it
 * exists. If the extractor did not understand the relevant part of the script,
 * the suite says the coverage is incomplete rather than inventing cases.
 */

import { coverageFor, type ScriptStructure } from "./script-contract";
import { buildDependencyGraph } from "./dependency-graph";
import type { ChangeImpact } from "./change-impact";
import type { StructuralDiff } from "./script-diff";

export type TestPriority = "required" | "recommended" | "optional";

export interface RegressionTestCase {
  id: string;
  title: string;
  /** The structural fact that justifies the test. */
  rationale: string;
  priority: TestPriority;
  /** Component ids this case exercises. */
  componentIds: string[];
}

export interface RegressionSuite {
  cases: RegressionTestCase[];
  /** Share of impacted components covered by at least one case. */
  coverageOfImpact: number;
  /** Gaps the operator must close by hand. */
  gaps: string[];
  generatedAt: string;
}

const MAX_CASES = 40;

export function buildRegressionSuite(
  after: ScriptStructure,
  diff: StructuralDiff,
  impact: ChangeImpact,
  now: Date = new Date(),
): RegressionSuite {
  const graph = buildDependencyGraph(after);
  const cases: RegressionTestCase[] = [];
  const covered = new Set<string>();

  const add = (c: RegressionTestCase): void => {
    if (cases.length >= MAX_CASES || cases.some((x) => x.id === c.id)) return;
    cases.push(c);
    for (const id of c.componentIds) covered.add(id);
  };

  // 1. Directly changed components — always required.
  for (const delta of diff.components) {
    if (delta.kind !== "added" && delta.kind !== "modified") continue;
    add({
      id: `changed:${delta.id}`,
      title: `Exercise "${delta.component.name}"`,
      rationale:
        delta.kind === "added"
          ? `${delta.component.kind} was added in this change`
          : `${delta.component.kind} changed: ${(delta.changes ?? []).join("; ")}`,
      priority: "required",
      componentIds: [delta.id],
    });
  }

  // 2. Removed components — verify nothing still reaches for them.
  for (const delta of diff.components) {
    if (delta.kind !== "removed") continue;
    add({
      id: `removed:${delta.id}`,
      title: `Confirm no path still expects "${delta.component.name}"`,
      rationale: `${delta.component.kind} was removed in this change`,
      priority: "required",
      componentIds: [],
    });
  }

  // 3. New or removed dependency edges — walk the path end to end.
  for (const delta of diff.dependencies) {
    const dep = delta.dependency;
    const from = graph.nodes.get(dep.fromId)?.component;
    add({
      id: `edge:${delta.kind}:${dep.kind}:${dep.fromId}:${dep.toKey}`,
      title: `Walk "${from?.name ?? dep.fromId}" → "${dep.toKey}"`,
      rationale: `${dep.kind.replace(/_/g, " ")} edge was ${delta.kind} in this change`,
      priority: delta.kind === "removed" ? "required" : "recommended",
      componentIds: from ? [from.id] : [],
    });
  }

  // 4. Branch components within the impact set — branches are where scripts
  //    diverge, so both sides deserve a pass.
  for (const hit of impact.impacted) {
    if (hit.kind !== "branch" || hit.distance === 0) continue;
    add({
      id: `branch:${hit.id}`,
      title: `Take both outcomes of "${hit.name}"`,
      rationale: `branch is ${hit.distance} hop(s) from a changed component`,
      priority: hit.distance <= 1 ? "recommended" : "optional",
      componentIds: [hit.id],
    });
  }

  // 5. Unresolved targets — an operator must confirm these by hand because the
  //    extractor could not follow them.
  const unresolved = after.dependencies.filter((d) => d.resolution === "unresolved");
  for (const dep of unresolved.slice(0, 10)) {
    add({
      id: `unresolved:${dep.kind}:${dep.toKey}`,
      title: `Manually verify target "${dep.toKey}"`,
      rationale: `referenced at line ${dep.line} but no matching component was found in this script`,
      priority: "required",
      componentIds: [],
    });
  }

  const impactedIds = impact.impacted.map((i) => i.id);
  const coveredImpacted = impactedIds.filter((id) => covered.has(id));

  const gaps: string[] = [];
  const uncovered = impactedIds.filter((id) => !covered.has(id));
  if (uncovered.length > 0) {
    gaps.push(
      `${uncovered.length} impacted component(s) have no proposed test — reachable from the change but not directly altered.`,
    );
  }
  if (after.unknowns.length > 0) {
    gaps.push(
      `${after.unknowns.length} unrecognised line(s) were not considered; test coverage over them is unknown.`,
    );
  }
  const coverage = coverageFor(after);
  if (coverage < 1) {
    gaps.push(
      `Structural recognition is ${Math.round(coverage * 100)}% — treat this suite as a starting point, not a complete plan.`,
    );
  }
  if (cases.length >= MAX_CASES) {
    gaps.push(`Suite truncated at ${MAX_CASES} cases; re-run per section for full coverage.`);
  }

  const PRIORITY_ORDER: Record<TestPriority, number> = {
    required: 0,
    recommended: 1,
    optional: 2,
  };
  cases.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title),
  );

  return {
    cases,
    coverageOfImpact: impactedIds.length === 0 ? 1 : coveredImpacted.length / impactedIds.length,
    gaps,
    generatedAt: now.toISOString(),
  };
}
