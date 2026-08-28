import { describe, expect, it } from "vitest";
import type { ScriptStructure } from "@/lib/script/script-contract";
import { makeScenario } from "./scenario-model";
import { makeOverlay, applyOverlay } from "./simulation-overlay";
import { compareSimulations, compareToExpectation, runSimulation } from "./simulation-engine";
import { MIN_SIMULATABLE_RECOGNITION, SIMULATION_AUTONOMY } from "./simulation-contract";

function comp(kind: string, name: string, line: number) {
  return {
    id: `${kind}:${name}`,
    kind: kind as never,
    name,
    key: name,
    line,
    occurrences: 1,
  };
}

function dep(kind: string, fromId: string, toKey: string, toId: string | undefined, line: number) {
  return {
    id: `${fromId}->${toKey}`,
    kind: kind as never,
    fromId,
    toKey,
    ...(toId ? { toId } : {}),
    resolution: (toId ? "internal" : "unresolved") as "internal" | "unresolved",
    line,
  };
}

/** start → branch → (a | b), a → transfer */
function structure(recognized = 20): ScriptStructure {
  return {
    components: [
      comp("section", "start", 1),
      comp("branch", "reason", 2),
      comp("section", "a", 3),
      comp("section", "b", 4),
      comp("transfer", "dispatch", 5),
    ],
    dependencies: [
      dep("branches_to", "section:start", "reason", "branch:reason", 1),
      dep("branches_to", "branch:reason", "a", "section:a", 2),
      dep("branches_to", "branch:reason", "b", "section:b", 2),
      dep("transfers_to", "section:a", "dispatch", "transfer:dispatch", 3),
    ],
    unknowns: [],
    lineCount: 20,
    recognizedLines: recognized,
  };
}

describe("phase 7 simulation", () => {
  it("caps autonomy at prepare", () => {
    expect(SIMULATION_AUTONOMY).not.toContain("execute");
    expect(SIMULATION_AUTONOMY[SIMULATION_AUTONOMY.length - 1]).toBe("prepare");
  });

  it("withholds simulation when script recognition is below the gate", () => {
    const s = structure(5); // 25% recognised
    expect(5 / 20).toBeLessThan(MIN_SIMULATABLE_RECOGNITION);
    const result = runSimulation({
      scenario: makeScenario({ name: "x", category: "regression", scriptId: "s1" }),
      structure: s,
    });
    expect(result.status).toBe("insufficient_structure");
    expect(result.confidence).toBe("insufficient");
    expect(result.warnings.some((w) => w.code === "insufficient_script_coverage")).toBe(true);
  });

  it("stops at an ambiguous branch instead of guessing", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "amb", category: "edge_case", scriptId: "s1" }),
      structure: structure(),
    });
    expect(result.status).toBe("partial");
    expect(result.warnings.some((w) => w.code === "ambiguous_branch")).toBe(true);
    expect(result.alternatePaths.length).toBe(2);
    expect(result.terminalState).toBeUndefined();
  });

  it("follows a branch selected by scenario input and reaches the dispatch terminal", () => {
    const result = runSimulation({
      scenario: makeScenario({
        name: "picked",
        category: "regression",
        scriptId: "s1",
        inputs: [{ key: "reason", label: "Reason", value: "a" }],
      }),
      structure: structure(),
    });
    expect(result.status).toBe("complete");
    expect(result.terminalState?.name).toBe("dispatch");
    expect(result.traversedComponentIds).toEqual([
      "section:start",
      "branch:reason",
      "section:a",
      "transfer:dispatch",
    ]);
  });

  it("is deterministic across runs", () => {
    const scenario = makeScenario({
      name: "det",
      category: "regression",
      scriptId: "s1",
      inputs: [{ key: "reason", label: "Reason", value: "a" }],
    });
    const a = runSimulation({ scenario, structure: structure() });
    const b = runSimulation({ scenario, structure: structure() });
    expect(a.traversedComponentIds).toEqual(b.traversedComponentIds);
    expect(a.pathTrace.map((s) => s.detail)).toEqual(b.pathTrace.map((s) => s.detail));
  });

  it("always requires a live test and never reports pass/fail", () => {
    const scenario = makeScenario({
      name: "expects",
      category: "regression",
      scriptId: "s1",
      inputs: [{ key: "reason", label: "Reason", value: "a" }],
      expected: { terminalKey: "dispatch" },
    });
    const s = structure();
    const result = runSimulation({ scenario, structure: s });
    const cmp = compareToExpectation(result, scenario, s);
    expect(cmp.state).toBe("simulation_match");
    expect(cmp.liveTestStillRequired).toBe(true);
    expect(JSON.stringify(cmp)).not.toMatch(/\bpass(ed)?\b|\bfail(ed)?\b/i);
    expect(result.warnings.some((w) => w.code === "live_test_required")).toBe(true);
  });

  it("reports simulation_unknown when no expectation was recorded", () => {
    const scenario = makeScenario({ name: "noexp", category: "regression", scriptId: "s1" });
    const s = structure();
    const cmp = compareToExpectation(runSimulation({ scenario, structure: s }), scenario, s);
    expect(cmp.state).toBe("simulation_unknown");
  });

  it("applies an overlay without mutating the canonical structure", () => {
    const base = structure();
    const before = JSON.stringify(base);
    const overlay = makeOverlay({
      name: "retarget",
      scriptId: "s1",
      branchTargetOverrides: [{ fromKey: "reason", currentToKey: "a", proposedToKey: "b" }],
    });
    const applied = applyOverlay(base, overlay);
    expect(JSON.stringify(base)).toBe(before);
    expect(applied.structure).not.toBe(base);
    expect(applied.notes.length).toBeGreaterThan(0);
  });

  it("diffs current vs proposed paths", () => {
    const s = structure();
    const scenario = makeScenario({
      name: "delta",
      category: "proposed_change_verification",
      scriptId: "s1",
      inputs: [{ key: "reason", label: "Reason", value: "a" }],
    });
    const overlay = makeOverlay({
      name: "retarget",
      scriptId: "s1",
      branchTargetOverrides: [{ fromKey: "reason", currentToKey: "a", proposedToKey: "b" }],
    });
    const current = runSimulation({ scenario, structure: s });
    const proposed = runSimulation({ scenario, structure: s, overlay });
    const delta = compareSimulations(current, proposed, s);
    expect(delta.pathChanged).toBe(true);
    expect(delta.removedComponents).toContain("a");
    expect(proposed.overlayId).toBe(overlay.id);
  });

  it("reports unresolved dependencies instead of inventing a target", () => {
    const s = structure();
    s.dependencies.push(dep("branches_to", "section:b", "external_flow", undefined, 6));
    const scenario = makeScenario({
      name: "unresolved",
      category: "edge_case",
      scriptId: "s1",
      inputs: [{ key: "reason", label: "Reason", value: "b" }],
    });
    const result = runSimulation({ scenario, structure: s });
    expect(result.status).toBe("partial");
    expect(result.unresolvedDependencies).toContain("external_flow");
    expect(result.warnings.some((w) => w.code === "unresolved_dependency")).toBe(true);
  });

  it("detects cycles and stops", () => {
    const s = structure();
    s.dependencies.push(dep("branches_to", "section:b", "start", "section:start", 6));
    const scenario = makeScenario({
      name: "cycle",
      category: "edge_case",
      scriptId: "s1",
      inputs: [{ key: "reason", label: "Reason", value: "b" }],
    });
    const result = runSimulation({ scenario, structure: s });
    expect(result.cycleDetected).toBe(true);
    expect(result.status).toBe("partial");
  });

  it("rejects a scenario whose starting component is absent", () => {
    const result = runSimulation({
      scenario: makeScenario({
        name: "bad start",
        category: "regression",
        scriptId: "s1",
        startingComponentKey: "nope",
      }),
      structure: structure(),
    });
    expect(result.status).toBe("invalid_scenario");
  });
});
