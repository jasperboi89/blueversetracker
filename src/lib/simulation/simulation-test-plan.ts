/**
 * Phase 7 — PREPARE-only test planning.
 *
 * Turns a simulation comparison into a *recommended* live-test plan. Every item
 * is grounded in a structural fact from the run (a changed path, an affected
 * dependency, an unresolved reference, a mismatching expectation) — nothing is
 * recommended "just in case", and nothing here can mark a test as executed.
 */

import type { SimulationDelta } from "./simulation-engine";
import type { SimulationResult } from "./simulation-contract";
import type { ExpectationComparison } from "./simulation-engine";

export type TestPlanGround =
  | "changed_path"
  | "changed_terminal"
  | "affected_dependency"
  | "unresolved_reference"
  | "unknown_step"
  | "expectation_mismatch"
  | "cycle";

export interface PreparedTestItem {
  id: string;
  title: string;
  ground: TestPlanGround;
  /** Structural evidence for why this test is recommended. */
  evidence: string;
  priority: "high" | "medium" | "low";
}

export interface PreparedTestPlan {
  /** Always "prepared": Phase 7 cannot run or record live tests. */
  state: "prepared";
  liveTestState: "live_test_not_run";
  items: PreparedTestItem[];
  notes: string[];
}

const MAX_ITEMS = 20;

export function prepareTestPlan(input: {
  current: SimulationResult;
  delta?: SimulationDelta | null;
  expectation?: ExpectationComparison | null;
}): PreparedTestPlan {
  const items: PreparedTestItem[] = [];
  const push = (item: Omit<PreparedTestItem, "id">): void => {
    if (items.length >= MAX_ITEMS) return;
    if (items.some((i) => i.title === item.title)) return;
    items.push({ id: `tp_${items.length + 1}`, ...item });
  };

  const { current, delta, expectation } = input;

  if (delta?.pathChanged) {
    push({
      title: `Live-test the route "${delta.proposedPath.join(" → ") || "proposed path"}"`,
      ground: "changed_path",
      evidence: `Simulated path differs from current: ${delta.currentPath.join(" → ") || "—"}`,
      priority: "high",
    });
  }
  if (delta?.terminalChanged) {
    push({
      title: `Confirm the end state changes from "${delta.currentTerminal ?? "—"}" to "${delta.proposedTerminal ?? "—"}"`,
      ground: "changed_terminal",
      evidence: "Simulated terminal component differs between current and proposed.",
      priority: "high",
    });
  }
  for (const key of delta?.newlyUnresolved ?? []) {
    push({
      title: `Verify where "${key}" actually routes in production`,
      ground: "unresolved_reference",
      evidence: "The proposed change introduces a reference this script does not define.",
      priority: "high",
    });
  }
  for (const key of current.unresolvedDependencies) {
    push({
      title: `Confirm the destination of "${key}" by live test`,
      ground: "unresolved_reference",
      evidence: "Target is outside this script version, so the simulator stopped at the boundary.",
      priority: "medium",
    });
  }
  for (const step of current.pathTrace.filter((s) => s.knowledge !== "known").slice(0, 5)) {
    push({
      title: `Observe "${step.name}" during a live test`,
      ground: "unknown_step",
      evidence: `${step.knowledge.toUpperCase()} step: ${step.detail}`,
      priority: step.knowledge === "unknown" ? "high" : "medium",
    });
  }
  if (current.cycleDetected) {
    push({
      title: "Walk the repeating segment with an operator to confirm the real exit condition",
      ground: "cycle",
      evidence: "The structural model loops back on itself; the exit condition is not modelled.",
      priority: "high",
    });
  }
  if (expectation?.state === "simulation_mismatch") {
    push({
      title: "Live-test the expectation the simulation disagreed with",
      ground: "expectation_mismatch",
      evidence: expectation.reasons.join(" "),
      priority: "high",
    });
  }
  for (const dep of (delta ? [] : current.affectedDependencies).slice(0, 3)) {
    push({
      title: `Spot-check the relationship "${dep}"`,
      ground: "affected_dependency",
      evidence: "Traversed by the simulated path.",
      priority: "low",
    });
  }

  const notes = [
    "Recommended only — nothing here has been executed, and a simulation match is not a completed test.",
  ];
  if (items.length === 0) {
    notes.push("No structural change or uncertainty was found that would justify a live test.");
  }

  return { state: "prepared", liveTestState: "live_test_not_run", items, notes };
}
