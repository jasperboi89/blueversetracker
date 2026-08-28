/**
 * Phase 4 — interpretable change complexity.
 *
 * The rule this module exists to honour: an operator must be able to *argue*
 * with the number. So complexity is a set of plain counts plus a band derived
 * from those counts by a table anyone can read — never an opaque weighted score
 * that cannot be checked by hand.
 *
 * `drivers` explains which counts pushed the band up, highest first, so the
 * explanation always matches the arithmetic.
 */

import {
  coverageFor,
  type ScriptComplexity,
  type ScriptComplexityBand,
  type ScriptStructure,
} from "./script-contract";
import { buildDependencyGraph, findCycles, maxDepth } from "./dependency-graph";

/**
 * Thresholds at which each measure starts contributing. Chosen to match how
 * operators already talk about scripts ("a couple of branches" vs "a maze").
 */
const THRESHOLDS = {
  components: [10, 25, 60],
  branches: [3, 8, 20],
  dependencies: [15, 40, 100],
  depth: [3, 5, 8],
} as const;

const BANDS: ScriptComplexityBand[] = ["simple", "moderate", "involved", "intricate"];

/** How many thresholds a value has crossed: 0–3. */
function steps(value: number, thresholds: readonly number[]): number {
  let n = 0;
  for (const t of thresholds) if (value >= t) n += 1;
  return n;
}

export function computeComplexity(structure: ScriptStructure): ScriptComplexity {
  const graph = buildDependencyGraph(structure);
  const cycles = findCycles(graph);
  const depth = maxDepth(graph);

  const componentCount = structure.components.length;
  const branchCount = structure.components.filter((c) => c.kind === "branch").length;
  const dependencyCount = structure.dependencies.length;
  const unresolvedCount = structure.dependencies.filter(
    (d) => d.resolution === "unresolved",
  ).length;
  const unknownCount = structure.unknowns.length;
  const coverage = coverageFor(structure);

  const contributions: Array<{ label: string; steps: number }> = [
    { label: `${componentCount} components`, steps: steps(componentCount, THRESHOLDS.components) },
    { label: `${branchCount} branches`, steps: steps(branchCount, THRESHOLDS.branches) },
    {
      label: `${dependencyCount} dependencies`,
      steps: steps(dependencyCount, THRESHOLDS.dependencies),
    },
    { label: `${depth} levels deep`, steps: steps(depth, THRESHOLDS.depth) },
  ];

  // Cycles and unresolved targets each add one step — they make a script harder
  // to reason about out of proportion to their count.
  if (cycles.length > 0) {
    contributions.push({ label: `${cycles.length} dependency loop(s)`, steps: 1 });
  }
  if (unresolvedCount > 0) {
    contributions.push({ label: `${unresolvedCount} unresolved target(s)`, steps: 1 });
  }

  const total = contributions.reduce((sum, c) => sum + c.steps, 0);
  // Band by average pressure across the measures that actually contributed.
  const bandIndex = total === 0 ? 0 : Math.min(BANDS.length - 1, Math.ceil(total / 3));

  const drivers = contributions
    .filter((c) => c.steps > 0)
    .sort((a, b) => b.steps - a.steps || a.label.localeCompare(b.label))
    .map((c) => c.label);

  return {
    componentCount,
    branchCount,
    dependencyCount,
    unresolvedCount,
    maxDepth: depth,
    cycleCount: cycles.length,
    unknownCount,
    coverage,
    band: BANDS[bandIndex]!,
    drivers: drivers.length > 0 ? drivers : ["no complexity drivers above threshold"],
  };
}
