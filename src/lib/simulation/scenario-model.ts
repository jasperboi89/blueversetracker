/**
 * Phase 7 — canonical scenario model.
 *
 * A scenario is structured operator intent, not prose. It names the script
 * version it was written against, the inputs that select a path, and any
 * assumptions needed to continue past constructs the engine cannot evaluate.
 *
 * A scenario written for one structure fingerprint is never silently assumed
 * valid for another — `scenarioApplicability` reports staleness explicitly.
 */

import {
  SIMULATION_LIMITS,
  SIMULATION_SCHEMA_VERSION,
} from "./simulation-contract";
import { normalizeKey, type ScriptStructure } from "@/lib/script/script-contract";

export const SCENARIO_CATEGORIES = [
  "regression",
  "business_rule",
  "incident_reproduction",
  "edge_case",
  "proposed_change_verification",
  "fixture",
] as const;
export type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

export const SCENARIO_PROVENANCE = [
  "operator",
  "ai_prepared",
  "historical_replay",
  "fixture",
] as const;
export type ScenarioProvenance = (typeof SCENARIO_PROVENANCE)[number];

/**
 * One structured input. `key` is a normalized component key (a branch or field
 * the script actually contains); `value` is the option/target chosen.
 */
export interface ScenarioInput {
  key: string;
  label: string;
  value: string;
}

/** An explicitly-recorded stand-in for something the engine cannot derive. */
export interface ScenarioAssumption {
  key: string;
  value: string;
  note?: string;
}

export interface ScenarioExpectation {
  /** Component key the operator expects the path to terminate at. */
  terminalKey?: string;
  /** Component keys the operator expects to be traversed. */
  mustTraverseKeys?: string[];
  note?: string;
}

export interface OperationalScenario {
  id: string;
  name: string;
  category: ScenarioCategory;
  accountId?: string;
  scriptId: string;
  /** Version this scenario was authored/verified against, when known. */
  scriptVersionId?: string;
  structureFingerprint?: string;
  startingComponentKey?: string;
  inputs: ScenarioInput[];
  assumptions: ScenarioAssumption[];
  expected?: ScenarioExpectation;
  provenance: ScenarioProvenance;
  lastVerifiedAt?: string;
  createdAt: string;
  schemaVersion: number;
}

export interface ScenarioDraft {
  name: string;
  category: ScenarioCategory;
  scriptId: string;
  accountId?: string;
  scriptVersionId?: string;
  structureFingerprint?: string;
  startingComponentKey?: string;
  inputs?: ScenarioInput[];
  assumptions?: ScenarioAssumption[];
  expected?: ScenarioExpectation;
  provenance?: ScenarioProvenance;
}

let seq = 0;

export function makeScenario(draft: ScenarioDraft, now: Date = new Date()): OperationalScenario {
  seq += 1;
  return {
    id: `scn_${now.getTime().toString(36)}_${seq.toString(36)}`,
    name: draft.name.trim().slice(0, 120) || "Untitled scenario",
    category: draft.category,
    ...(draft.accountId ? { accountId: draft.accountId } : {}),
    scriptId: draft.scriptId,
    ...(draft.scriptVersionId ? { scriptVersionId: draft.scriptVersionId } : {}),
    ...(draft.structureFingerprint ? { structureFingerprint: draft.structureFingerprint } : {}),
    ...(draft.startingComponentKey
      ? { startingComponentKey: normalizeKey(draft.startingComponentKey) }
      : {}),
    inputs: (draft.inputs ?? []).slice(0, SIMULATION_LIMITS.maxAssumptions).map((i) => ({
      key: normalizeKey(i.key),
      label: i.label.slice(0, 80),
      value: i.value.slice(0, 120),
    })),
    assumptions: (draft.assumptions ?? [])
      .slice(0, SIMULATION_LIMITS.maxAssumptions)
      .map((a) => ({
        key: normalizeKey(a.key),
        value: a.value.slice(0, 120),
        ...(a.note ? { note: a.note.slice(0, 160) } : {}),
      })),
    ...(draft.expected ? { expected: draft.expected } : {}),
    provenance: draft.provenance ?? "operator",
    createdAt: now.toISOString(),
    schemaVersion: SIMULATION_SCHEMA_VERSION,
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface ScenarioValidation {
  valid: boolean;
  errors: string[];
  notes: string[];
}

/**
 * A scenario is invalid when it cannot be evaluated at all — not merely when it
 * is incomplete. Incompleteness is handled by the engine as PARTIAL plus
 * ASSUMPTION REQUIRED, which is more useful than refusing to run.
 */
export function validateScenario(
  scenario: OperationalScenario,
  structure?: ScriptStructure,
): ScenarioValidation {
  const errors: string[] = [];
  const notes: string[] = [];

  if (!scenario.name.trim()) errors.push("Scenario needs a name.");
  if (!scenario.scriptId) errors.push("Scenario must reference a script.");
  if (scenario.schemaVersion !== SIMULATION_SCHEMA_VERSION) {
    notes.push(
      `Scenario was written against schema v${scenario.schemaVersion}; current is v${SIMULATION_SCHEMA_VERSION}.`,
    );
  }

  if (structure) {
    const keys = new Set(structure.components.map((c) => c.key));
    if (structure.components.length === 0) {
      errors.push("The selected script version has no recognised components to simulate.");
    }
    if (scenario.startingComponentKey && !keys.has(scenario.startingComponentKey)) {
      errors.push(
        `Starting component "${scenario.startingComponentKey}" is not present in this script version.`,
      );
    }
    for (const input of scenario.inputs) {
      if (!keys.has(input.key)) {
        notes.push(
          `Input "${input.label || input.key}" does not match a component in this version — it will be ignored.`,
        );
      }
    }
  }

  if (!scenario.expected) {
    notes.push("No human-verified expected result recorded for this scenario.");
  }

  return { valid: errors.length === 0, errors, notes };
}

/* ------------------------------------------------------------------ */
/* Applicability across versions                                       */
/* ------------------------------------------------------------------ */

export type ScenarioApplicability = "verified_for_version" | "unverified_for_version" | "stale";

/**
 * Never assume an old scenario still describes a new script version. If the
 * structure fingerprint moved, the scenario is `stale` until re-verified.
 */
export function scenarioApplicability(
  scenario: OperationalScenario,
  structureFingerprint?: string,
): { state: ScenarioApplicability; reason: string } {
  if (!structureFingerprint || !scenario.structureFingerprint) {
    return {
      state: "unverified_for_version",
      reason: "No structure fingerprint recorded on one side — applicability cannot be confirmed.",
    };
  }
  if (scenario.structureFingerprint === structureFingerprint) {
    return scenario.lastVerifiedAt
      ? { state: "verified_for_version", reason: "Structure fingerprint matches the verified run." }
      : {
          state: "unverified_for_version",
          reason: "Structure matches, but the scenario has never been verified by an operator.",
        };
  }
  return {
    state: "stale",
    reason: "Script structure changed since this scenario was written; re-verify before trusting it.",
  };
}

/** Structured builder options derived from the script itself — no JSON typing. */
export interface ScenarioFieldOption {
  key: string;
  label: string;
  kind: string;
  /** Recognised outgoing targets for this component, usable as input values. */
  options: string[];
}

export function scenarioBuilderFields(structure: ScriptStructure): ScenarioFieldOption[] {
  const byFrom = new Map<string, string[]>();
  for (const dep of structure.dependencies) {
    if (dep.kind === "references") continue;
    const list = byFrom.get(dep.fromId) ?? [];
    if (!list.includes(dep.toKey)) list.push(dep.toKey);
    byFrom.set(dep.fromId, list);
  }

  return structure.components
    .filter((c) => c.kind === "branch" || c.kind === "field" || c.kind === "variable")
    .map((c) => ({
      key: c.key,
      label: c.name,
      kind: c.kind,
      options: (byFrom.get(c.id) ?? []).slice(0, 20).sort(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 60);
}
