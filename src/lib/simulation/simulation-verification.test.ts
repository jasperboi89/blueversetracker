/**
 * Phase 7.5 — Digital Twin & Simulation Integrity Verification Gate.
 *
 * Adversarial and regression coverage for the boundaries Phase 7 must hold:
 * determinism, version isolation, structural honesty, bounds, overlay
 * immutability, the simulation/live-test vocabulary boundary, and the absence
 * of forecast/anomaly/LLM influence on the deterministic engine.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coverageFor } from "@/lib/script/script-contract";
import { ingestScript } from "@/lib/script/script-ingest";
import {
  makeScenario,
  scenarioApplicability,
  scenarioBuilderFields,
  validateScenario,
} from "./scenario-model";
import { applyOverlay, isEmptyOverlay, makeOverlay } from "./simulation-overlay";
import {
  compareSimulations,
  compareToExpectation,
  runScenarioBatch,
  runSimulation,
} from "./simulation-engine";
import { prepareTestPlan } from "./simulation-test-plan";
import {
  ASSUMPTION_FIXTURE,
  BRANCH_FIXTURE,
  CYCLE_FIXTURE,
  FIELD_STATE_FIXTURE,
  SIMPLE_PATH_FIXTURE,
  UNKNOWN_CONSTRUCT_FIXTURE,
  UNRESOLVED_FIXTURE,
  ZERO_COVERAGE_FIXTURE,
  deepChainFixture,
} from "./simulation-fixtures";
import {
  SIMULATION_AUTONOMY,
  SIMULATION_LIMITS,
  SIMULATION_MATCH_LABEL,
  SIMULATION_MATCH_STATES,
  SIMULATION_STATUSES,
  SIMULATION_STATUS_LABEL,
  SUPPORTED_CONSTRUCTS,
  LIVE_TEST_LABEL,
} from "./simulation-contract";

const SIM_DIR = join(process.cwd(), "src/lib/simulation");
const sourceFiles = readdirSync(SIM_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);
const readSim = (f: string): string => readFileSync(join(SIM_DIR, f), "utf8");

/* ------------------------------------------------------------------ */
/* 3 — hard semantic gate                                              */
/* ------------------------------------------------------------------ */

describe("simulation / live-test vocabulary boundary", () => {
  it("never exposes pass/fail/success/safe status values or labels", () => {
    const vocabulary = [
      ...SIMULATION_MATCH_STATES,
      ...SIMULATION_STATUSES,
      ...Object.values(SIMULATION_MATCH_LABEL),
      ...Object.values(SIMULATION_STATUS_LABEL),
      ...Object.values(LIVE_TEST_LABEL),
    ].join(" ");
    expect(vocabulary).not.toMatch(/\b(pass|passed|fail|failed|success|succeeded|safe|works|broken)\b/i);
  });

  it("keeps the four canonical comparison states and the live-test separation", () => {
    expect(SIMULATION_MATCH_STATES).toEqual([
      "simulation_match",
      "simulation_mismatch",
      "simulation_partial",
      "simulation_unknown",
    ]);
    expect(LIVE_TEST_LABEL.live_test_not_run).toBe("LIVE TEST NOT RUN");
  });

  it("uses forbidden verdict words only to negate them, never as a verdict", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      readSim(file)
        .split("\n")
        .forEach((line, i) => {
          if (!/\b(passed|failed|succeeded|is safe|it works|is broken)\b/i.test(line)) return;
          if (/\bnot\b|\bnever\b|\bno\b/i.test(line)) return;
          offenders.push(`${file}:${i + 1} ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("attaches a live-test warning to every runnable result", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "s", category: "regression", scriptId: "f" }),
      structure: SIMPLE_PATH_FIXTURE,
    });
    expect(result.warnings.some((w) => w.code === "live_test_required")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 4 — determinism, and no LLM in the canonical path                   */
/* ------------------------------------------------------------------ */

describe("determinism", () => {
  it("produces identical semantics across repeated runs", () => {
    const scenario = makeScenario({
      name: "det",
      category: "regression",
      scriptId: "f",
      inputs: [{ key: "reason", label: "Reason", value: "cancellation" }],
    });
    const runs = Array.from({ length: 5 }, () =>
      runSimulation({ scenario, structure: BRANCH_FIXTURE, structureFingerprint: "fp1" }),
    );
    const semantic = runs.map((r) =>
      JSON.stringify({
        status: r.status,
        confidence: r.confidence,
        coverage: r.coverage,
        path: r.traversedComponentIds,
        trace: r.pathTrace,
        transitions: r.transitions,
        warnings: r.warnings,
        terminal: r.terminalState,
      }),
    );
    expect(new Set(semantic).size).toBe(1);
    // ids/timestamps are the only fields allowed to differ
    expect(new Set(runs.map((r) => r.simulationId)).size).toBe(runs.length);
  });

  it("keeps the deterministic engine free of AI imports", () => {
    for (const file of sourceFiles) {
      const src = readSim(file);
      expect(src).not.toMatch(/from "@\/lib\/ai/);
      expect(src).not.toMatch(/aiScriptReasoning|lovable-ai|openai/i);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 5/6 — version isolation + fingerprint integrity                      */
/* ------------------------------------------------------------------ */

describe("version isolation and fingerprint integrity", () => {
  it("records the fingerprint it actually simulated", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "v", category: "regression", scriptId: "f" }),
      structure: SIMPLE_PATH_FIXTURE,
      scriptVersionId: "ver_1",
      structureFingerprint: "fp_v1",
    });
    expect(result.structureFingerprint).toBe("fp_v1");
    expect(result.scriptVersionId).toBe("ver_1");
  });

  it("warns SCRIPT VERSION UNKNOWN instead of assuming the current version", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "v", category: "historical_replay" as never, scriptId: "f" }),
      structure: SIMPLE_PATH_FIXTURE,
    });
    expect(result.warnings.some((w) => w.code === "script_version_unknown")).toBe(true);
  });

  it("marks a scenario stale when the structure fingerprint moved", () => {
    const scenario = makeScenario({
      name: "old",
      category: "regression",
      scriptId: "f",
      structureFingerprint: "fp_v1",
    });
    expect(scenarioApplicability(scenario, "fp_v2").state).toBe("stale");
    expect(scenarioApplicability(scenario, "fp_v1").state).toBe("unverified_for_version");
  });

  it("resolves components only inside the simulated version", () => {
    // "escalate" exists in v1 only; v2 drops it.
    const v2 = {
      ...SIMPLE_PATH_FIXTURE,
      components: SIMPLE_PATH_FIXTURE.components.filter((c) => c.key !== "verify"),
    };
    const scenario = makeScenario({
      name: "cross",
      category: "regression",
      scriptId: "f",
      startingComponentKey: "verify",
    });
    expect(validateScenario(scenario, v2).valid).toBe(false);
    const result = runSimulation({ scenario, structure: v2, structureFingerprint: "fp_v2" });
    expect(result.status).toBe("invalid_scenario");
  });

  it("does not reinterpret a historical run when a newer structure arrives", () => {
    const scenario = makeScenario({ name: "h", category: "regression", scriptId: "f" });
    const old = runSimulation({
      scenario,
      structure: SIMPLE_PATH_FIXTURE,
      structureFingerprint: "fp_v1",
    });
    const snapshot = JSON.stringify(old);
    runSimulation({ scenario, structure: BRANCH_FIXTURE, structureFingerprint: "fp_v2" });
    expect(JSON.stringify(old)).toBe(snapshot);
  });
});

/* ------------------------------------------------------------------ */
/* 7/8/9 — construct support, unknown handling, zero coverage           */
/* ------------------------------------------------------------------ */

describe("construct support and honest degradation", () => {
  it("documents every construct with an explicit support level", () => {
    for (const entry of SUPPORTED_CONSTRUCTS) {
      expect(["supported", "partially_supported", "unsupported"]).toContain(entry.support);
      expect(entry.note.length).toBeGreaterThan(10);
    }
    expect(SUPPORTED_CONSTRUCTS.some((c) => c.support === "unsupported")).toBe(true);
  });

  it("walks a supported navigation + transfer path to a terminal", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "simple", category: "fixture", scriptId: "f" }),
      structure: SIMPLE_PATH_FIXTURE,
    });
    expect(result.status).toBe("complete");
    expect(result.terminalState?.name).toBe("dispatch");
    expect(result.coverage.structuralCoverage).toBe(1);
  });

  it("records writes and reads as explicit state transitions", () => {
    const result = runSimulation({
      scenario: makeScenario({
        name: "state",
        category: "fixture",
        scriptId: "f",
        inputs: [{ key: "caller name", label: "Caller", value: "recorded value" }],
      }),
      structure: FIELD_STATE_FIXTURE,
    });
    const write = result.transitions.find((t) => t.operation === "set_field");
    const read = result.transitions.find((t) => t.operation === "read_field");
    expect(write?.valueSource).toBe("scenario_input");
    expect(write?.stateAfter["caller name"]).toBe("recorded value");
    expect(read?.value).toBe("recorded value");
    for (const t of result.transitions) {
      expect(t.componentId).toBeTruthy();
      expect(t.operation).toBeTruthy();
      expect(t.valueSource).toBeTruthy();
      expect(t.stateAfter).toBeTypeOf("object");
    }
  });

  it("never traverses an unnamed reference as control flow", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "unk", category: "edge_case", scriptId: "f" }),
      structure: UNKNOWN_CONSTRUCT_FIXTURE,
    });
    expect(result.traversedComponentIds).not.toContain("action:dynamic lookup");
    expect(result.warnings.some((w) => w.code === "unsupported_expression")).toBe(true);
    expect(result.coverage.unsupportedConstructs).toBeGreaterThan(0);
  });

  it("stops at an unresolved reference rather than inventing a destination", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "unres", category: "edge_case", scriptId: "f" }),
      structure: UNRESOLVED_FIXTURE,
    });
    expect(result.status).toBe("partial");
    expect(result.unresolvedDependencies).toContain("shared escalation flow");
    expect(result.terminalState).toBeUndefined();
  });

  it("refuses to simulate a zero-coverage prose entry", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "prose", category: "fixture", scriptId: "f" }),
      structure: ZERO_COVERAGE_FIXTURE,
    });
    expect(result.status).toBe("insufficient_structure");
    expect(result.pathTrace).toEqual([]);
    expect(result.confidence).toBe("insufficient");
  });

  it("refuses a real prose knowledge note ingested through the Phase 4 extractor", () => {
    const prose = [
      "Caller phoned about a same day cancellation for the surgery clinic.",
      "We told them the office would follow up in the morning and left a message.",
      "Nothing else was needed on this call.",
    ].join("\n");
    const analysis = ingestScript(prose);
    const result = runSimulation({
      scenario: makeScenario({ name: "note", category: "fixture", scriptId: "f" }),
      structure: analysis.structure,
    });
    if (coverageFor(analysis.structure) < 0.6) {
      expect(result.status).toBe("insufficient_structure");
    }
    // Whatever the recognition level, prose must never yield a confident path.
    expect(["insufficient_structure", "partial", "unknown_path", "invalid_scenario"]).toContain(
      result.status,
    );
    expect(result.confidence).not.toBe("verified_structure");
  });
});

/* ------------------------------------------------------------------ */
/* 10/11 — assumptions and branching                                    */
/* ------------------------------------------------------------------ */

describe("assumptions and branch determination", () => {
  it("marks assumption-dependent steps and records the assumption", () => {
    const result = runSimulation({
      scenario: makeScenario({
        name: "assumed",
        category: "edge_case",
        scriptId: "f",
        assumptions: [{ key: "on call lookup", value: "Dr. Listed", note: "operator supplied" }],
      }),
      structure: ASSUMPTION_FIXTURE,
    });
    expect(result.assumptionsUsed).toEqual([{ key: "on call lookup", value: "Dr. Listed" }]);
    expect(result.pathTrace.some((s) => s.knowledge === "assumed")).toBe(true);
    expect(result.coverage.assumedSteps).toBeGreaterThan(0);
    expect(result.confidence).not.toBe("verified_structure");
  });

  it("degrades instead of inventing the value when the assumption is removed", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "noassume", category: "edge_case", scriptId: "f" }),
      structure: ASSUMPTION_FIXTURE,
    });
    expect(result.assumptionsUsed).toEqual([]);
    expect(result.warnings.some((w) => w.code === "unsupported_expression")).toBe(true);
    expect(result.coverage.unsupportedConstructs).toBeGreaterThan(0);
  });

  it("follows a branch when the input determines it", () => {
    const result = runSimulation({
      scenario: makeScenario({
        name: "branch",
        category: "regression",
        scriptId: "f",
        inputs: [{ key: "reason", label: "Reason", value: "reschedule" }],
      }),
      structure: BRANCH_FIXTURE,
    });
    expect(result.traversedComponentIds).toContain("section:reschedule");
    expect(result.traversedComponentIds).not.toContain("section:cancellation");
  });

  it("never arbitrarily chooses a branch", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "amb", category: "regression", scriptId: "f" }),
      structure: BRANCH_FIXTURE,
    });
    expect(result.status).toBe("partial");
    expect(result.warnings.map((w) => w.code)).toContain("ambiguous_branch");
    expect(result.warnings.map((w) => w.code)).toContain("assumption_required");
    expect(result.alternatePaths.length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* 13/14 — cycles and bounds                                            */
/* ------------------------------------------------------------------ */

describe("cycles and bounds", () => {
  it("detects a cycle, stops, and exposes the repeated path", () => {
    const started = Date.now();
    const result = runSimulation({
      scenario: makeScenario({
        name: "cycle",
        category: "fixture",
        scriptId: "f",
        startingComponentKey: "loop start",
      }),
      structure: CYCLE_FIXTURE,
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.cycleDetected).toBe(true);
    expect(result.warnings.some((w) => w.code === "cycle_detected")).toBe(true);
    expect(result.pathTrace.at(-1)?.warningCode).toBe("cycle_detected");
  });

  it("reports TRUNCATED at the depth bound instead of silently stopping", () => {
    const result = runSimulation({
      scenario: makeScenario({ name: "deep", category: "fixture", scriptId: "f" }),
      structure: deepChainFixture(SIMULATION_LIMITS.maxDepth + 30),
    });
    expect(result.truncated).toBe(true);
    expect(result.status).toBe("partial");
    expect(result.warnings.some((w) => w.code === "truncated")).toBe(true);
    expect(result.pathTrace.length).toBeLessThanOrEqual(SIMULATION_LIMITS.maxSteps);
  });

  it("bounds scenario batches", () => {
    const scenarios = Array.from({ length: 40 }, (_, i) =>
      makeScenario({ name: `s${i}`, category: "regression", scriptId: "f" }),
    );
    const results = runScenarioBatch(scenarios, { structure: SIMPLE_PATH_FIXTURE }, 10);
    expect(results.length).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/* 15/16/17 — current vs proposed, immutability, invalid overlay        */
/* ------------------------------------------------------------------ */

describe("overlays", () => {
  const scenario = makeScenario({
    name: "overlay",
    category: "proposed_change_verification",
    scriptId: "f",
    inputs: [{ key: "reason", label: "Reason", value: "cancellation" }],
  });

  it("leaves the canonical structure byte-identical after a simulated overlay run", () => {
    const before = JSON.stringify(BRANCH_FIXTURE);
    const overlay = makeOverlay({
      name: "retarget",
      scriptId: "f",
      branchTargetOverrides: [
        { fromKey: "reason", currentToKey: "cancellation", proposedToKey: "reschedule" },
      ],
    });
    runSimulation({ scenario, structure: BRANCH_FIXTURE, overlay });
    expect(JSON.stringify(BRANCH_FIXTURE)).toBe(before);
  });

  it("simulates current and proposed independently and diffs them", () => {
    const overlay = makeOverlay({
      name: "retarget",
      scriptId: "f",
      branchTargetOverrides: [
        { fromKey: "reason", currentToKey: "cancellation", proposedToKey: "reschedule" },
      ],
    });
    const current = runSimulation({ scenario, structure: BRANCH_FIXTURE });
    const proposed = runSimulation({ scenario, structure: BRANCH_FIXTURE, overlay });
    const delta = compareSimulations(current, proposed, BRANCH_FIXTURE);
    expect(current.overlayId).toBeUndefined();
    expect(proposed.overlayId).toBe(overlay.id);
    expect(delta.pathChanged).toBe(true);
    expect(delta.removedComponents).toContain("cancellation");
    expect(delta.addedComponents).toContain("reschedule");
    expect(proposed.warnings.some((w) => w.code === "overlay_applied")).toBe(true);
  });

  it("reports an unchanged path when the overlay does not affect the scenario", () => {
    const overlay = makeOverlay({
      name: "unrelated",
      scriptId: "f",
      disabledComponentKeys: ["reschedule"],
    });
    const current = runSimulation({ scenario, structure: BRANCH_FIXTURE });
    const proposed = runSimulation({ scenario, structure: BRANCH_FIXTURE, overlay });
    const delta = compareSimulations(current, proposed, BRANCH_FIXTURE);
    expect(delta.pathChanged).toBe(false);
    expect(delta.notes.join(" ")).toMatch(/No difference/i);
  });

  it("reports overlay entries that match nothing instead of silently correcting them", () => {
    const overlay = makeOverlay({
      name: "bogus",
      scriptId: "f",
      disabledComponentKeys: ["component that does not exist"],
      addedRelationships: [
        { fromKey: "ghost", toKey: "dispatch", kind: "branches_to" },
      ],
      fieldValueOverrides: [{ key: "unknown field", value: "x" }],
    });
    const applied = applyOverlay(BRANCH_FIXTURE, overlay);
    expect(applied.ineffective.length).toBe(3);
    const result = runSimulation({ scenario, structure: BRANCH_FIXTURE, overlay });
    expect(result.warnings.some((w) => w.code === "unknown_component")).toBe(true);
  });

  it("marks a cross-version overlay target as unresolved rather than resolving it elsewhere", () => {
    const overlay = makeOverlay({
      name: "cross-version",
      scriptId: "f",
      branchTargetOverrides: [
        { fromKey: "reason", currentToKey: "cancellation", proposedToKey: "component from v2" },
      ],
    });
    const result = runSimulation({ scenario, structure: BRANCH_FIXTURE, overlay });
    expect(result.unresolvedDependencies).toContain("component from v2");
    expect(result.status).toBe("partial");
  });

  it("treats an empty overlay as no overlay", () => {
    expect(isEmptyOverlay(makeOverlay({ name: "none", scriptId: "f" }))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 18/19 — batch comparison and expectation semantics                   */
/* ------------------------------------------------------------------ */

describe("multi-scenario comparison and expectations", () => {
  it("keeps unknown scenarios out of the matched set", () => {
    const scenarios = [
      makeScenario({
        name: "matches",
        category: "regression",
        scriptId: "f",
        expected: { terminalKey: "dispatch" },
      }),
      makeScenario({ name: "no expectation", category: "regression", scriptId: "f" }),
      makeScenario({
        name: "mismatches",
        category: "regression",
        scriptId: "f",
        expected: { terminalKey: "somewhere else" },
      }),
    ];
    const states = scenarios.map((s) =>
      compareToExpectation(
        runSimulation({ scenario: s, structure: SIMPLE_PATH_FIXTURE }),
        s,
        SIMPLE_PATH_FIXTURE,
      ).state,
    );
    expect(states).toEqual(["simulation_match", "simulation_unknown", "simulation_mismatch"]);
    expect(states.filter((s) => s === "simulation_match").length).toBe(1);
  });

  it("returns simulation_partial when the run stopped early", () => {
    const scenario = makeScenario({
      name: "partial",
      category: "regression",
      scriptId: "f",
      expected: { mustTraverseKeys: ["dispatch"] },
    });
    const cmp = compareToExpectation(
      runSimulation({ scenario, structure: BRANCH_FIXTURE }),
      scenario,
      BRANCH_FIXTURE,
    );
    expect(cmp.state).toBe("simulation_partial");
    expect(cmp.liveTestStillRequired).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 20 — PREPARE-only test planning                                      */
/* ------------------------------------------------------------------ */

describe("test intelligence integration", () => {
  it("grounds every recommended test in a structural fact and never marks it executed", () => {
    const scenario = makeScenario({
      name: "plan",
      category: "proposed_change_verification",
      scriptId: "f",
      inputs: [{ key: "reason", label: "Reason", value: "cancellation" }],
    });
    const overlay = makeOverlay({
      name: "retarget",
      scriptId: "f",
      branchTargetOverrides: [
        { fromKey: "reason", currentToKey: "cancellation", proposedToKey: "reschedule" },
      ],
    });
    const current = runSimulation({ scenario, structure: BRANCH_FIXTURE });
    const proposed = runSimulation({ scenario, structure: BRANCH_FIXTURE, overlay });
    const plan = prepareTestPlan({
      current: proposed,
      delta: compareSimulations(current, proposed, BRANCH_FIXTURE),
    });
    expect(plan.state).toBe("prepared");
    expect(plan.liveTestState).toBe("live_test_not_run");
    expect(plan.items.length).toBeGreaterThan(0);
    for (const item of plan.items) expect(item.evidence.length).toBeGreaterThan(5);
    expect(JSON.stringify(plan)).not.toMatch(/\bexecuted\b|\bpassed\b/i);
  });
});

/* ------------------------------------------------------------------ */
/* 22/23/24/25 — separation from forecasting, anomalies, memory, time   */
/* ------------------------------------------------------------------ */

describe("separation boundaries", () => {
  it("does not import forecasting, anomaly, resolution-memory or ledger modules", () => {
    for (const file of sourceFiles) {
      const src = readSim(file);
      expect(src).not.toMatch(/forecast|anomaly|resolution-memory|event-spine|event-ledger/i);
    }
  });

  it("depends on no wall-clock or random source for its semantics", () => {
    const scenario = makeScenario({
      name: "time",
      category: "regression",
      scriptId: "f",
      inputs: [{ key: "reason", label: "Reason", value: "cancellation" }],
    });
    const past = runSimulation({
      scenario,
      structure: BRANCH_FIXTURE,
      now: new Date("2020-01-01T00:00:00Z"),
    });
    const future = runSimulation({
      scenario,
      structure: BRANCH_FIXTURE,
      now: new Date("2030-01-01T00:00:00Z"),
    });
    expect(past.traversedComponentIds).toEqual(future.traversedComponentIds);
    expect(past.warnings).toEqual(future.warnings);
    for (const file of sourceFiles) {
      expect(readSim(file)).not.toMatch(/Math\.random|crypto\.randomUUID/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 35 — autonomy ceiling                                                */
/* ------------------------------------------------------------------ */

describe("autonomy ceiling", () => {
  it("exposes no apply/deploy/write capability", () => {
    for (const file of sourceFiles) {
      const src = readSim(file);
      expect(src).not.toMatch(/export function (commit|apply(Change|ToProduction)|deploy|publish)/);
      expect(src).not.toMatch(/supabase|fetch\(/i);
    }
    expect(SIMULATION_AUTONOMY).toEqual(["observe", "explain", "recommend", "prepare"]);
  });
});

/* ------------------------------------------------------------------ */
/* 26/27 — builder inputs and empty states                              */
/* ------------------------------------------------------------------ */

describe("builder and empty states", () => {
  it("derives scenario fields from the script itself", () => {
    const fields = scenarioBuilderFields(BRANCH_FIXTURE);
    const reason = fields.find((f) => f.key === "reason");
    expect(reason?.options).toEqual(["cancellation", "reschedule"]);
  });

  it("produces no fields and no fabricated example for an empty structure", () => {
    expect(scenarioBuilderFields(ZERO_COVERAGE_FIXTURE)).toEqual([]);
    const validation = validateScenario(
      makeScenario({ name: "e", category: "fixture", scriptId: "f" }),
      ZERO_COVERAGE_FIXTURE,
    );
    expect(validation.valid).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 38 — performance bound                                               */
/* ------------------------------------------------------------------ */

describe("performance", () => {
  it("keeps a large batch bounded and fast", () => {
    const scenarios = Array.from({ length: SIMULATION_LIMITS.maxScenarioBatch }, (_, i) =>
      makeScenario({
        name: `perf-${i}`,
        category: "regression",
        scriptId: "f",
        inputs: [{ key: "reason", label: "Reason", value: "cancellation" }],
      }),
    );
    const started = Date.now();
    const results = runScenarioBatch(scenarios, { structure: deepChainFixture(200) });
    const elapsed = Date.now() - started;
    expect(results.length).toBe(SIMULATION_LIMITS.maxScenarioBatch);
    expect(elapsed).toBeLessThan(2000);
  });
});
