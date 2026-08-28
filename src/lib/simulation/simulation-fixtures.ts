/**
 * Phase 7.5 — deterministic simulation fixtures.
 *
 * These structures exist ONLY for verification and demonstrations. They are
 * synthetic: no account, caller, patient or production script content appears
 * here, and nothing in this module is ever persisted as a script version.
 *
 * Each fixture isolates one behaviour the verification gate has to prove:
 * supported path, deterministic branch, assumption-required, unknown
 * construct, unresolved reference, cycle, overlay difference, depth bound.
 */

import type {
  ScriptComponent,
  ScriptComponentKind,
  ScriptDependency,
  ScriptDependencyKind,
  ScriptStructure,
} from "@/lib/script/script-contract";

export function fixtureComponent(
  kind: ScriptComponentKind,
  name: string,
  line: number,
): ScriptComponent {
  return { id: `${kind}:${name}`, kind, name, key: name, line, occurrences: 1 };
}

export function fixtureDependency(
  kind: ScriptDependencyKind,
  fromId: string,
  toKey: string,
  toId: string | undefined,
  line: number,
): ScriptDependency {
  return {
    id: `${fromId}->${kind}->${toKey}`,
    kind,
    fromId,
    toKey,
    ...(toId ? { toId } : {}),
    resolution: toId ? "internal" : "unresolved",
    line,
  };
}

function structure(
  components: ScriptComponent[],
  dependencies: ScriptDependency[],
  opts: Partial<Pick<ScriptStructure, "unknowns" | "lineCount" | "recognizedLines">> = {},
): ScriptStructure {
  const lineCount = opts.lineCount ?? components.length + dependencies.length;
  return {
    components,
    dependencies,
    unknowns: opts.unknowns ?? [],
    lineCount,
    recognizedLines: opts.recognizedLines ?? lineCount,
  };
}

/** intake → verify → dispatch. One recognised route, no choices. */
export const SIMPLE_PATH_FIXTURE: ScriptStructure = structure(
  [
    fixtureComponent("section", "intake", 1),
    fixtureComponent("section", "verify", 2),
    fixtureComponent("transfer", "dispatch", 3),
  ],
  [
    fixtureDependency("branches_to", "section:intake", "verify", "section:verify", 1),
    fixtureDependency("transfers_to", "section:verify", "dispatch", "transfer:dispatch", 2),
  ],
);

/** intake → reason branch → (cancellation | reschedule) → dispatch. */
export const BRANCH_FIXTURE: ScriptStructure = structure(
  [
    fixtureComponent("section", "intake", 1),
    fixtureComponent("branch", "reason", 2),
    fixtureComponent("section", "cancellation", 3),
    fixtureComponent("section", "reschedule", 4),
    fixtureComponent("transfer", "dispatch", 5),
  ],
  [
    fixtureDependency("branches_to", "section:intake", "reason", "branch:reason", 1),
    fixtureDependency("branches_to", "branch:reason", "cancellation", "section:cancellation", 2),
    fixtureDependency("branches_to", "branch:reason", "reschedule", "section:reschedule", 3),
    fixtureDependency("transfers_to", "section:cancellation", "dispatch", "transfer:dispatch", 4),
    fixtureDependency("transfers_to", "section:reschedule", "dispatch", "transfer:dispatch", 5),
  ],
);

/** intake writes caller_name, then reads it; needs a supplied value. */
export const FIELD_STATE_FIXTURE: ScriptStructure = structure(
  [
    fixtureComponent("section", "intake", 1),
    fixtureComponent("field", "caller name", 2),
    fixtureComponent("section", "confirm", 3),
  ],
  [
    fixtureDependency("writes", "section:intake", "caller name", "field:caller name", 1),
    fixtureDependency("branches_to", "section:intake", "confirm", "section:confirm", 2),
    fixtureDependency("reads", "section:confirm", "caller name", "field:caller name", 3),
  ],
);

/** A calculation the engine will not evaluate without an assumption. */
export const ASSUMPTION_FIXTURE: ScriptStructure = structure(
  [
    fixtureComponent("section", "intake", 1),
    fixtureComponent("calculation", "on call lookup", 2),
    fixtureComponent("transfer", "dispatch", 3),
  ],
  [
    fixtureDependency("branches_to", "section:intake", "on call lookup", "calculation:on call lookup", 1),
    fixtureDependency("transfers_to", "calculation:on call lookup", "dispatch", "transfer:dispatch", 2),
  ],
);

/** Path leaves this script — the target is not defined here. */
export const UNRESOLVED_FIXTURE: ScriptStructure = structure(
  [
    fixtureComponent("section", "intake", 1),
    fixtureComponent("section", "escalate", 2),
  ],
  [
    fixtureDependency("branches_to", "section:intake", "escalate", "section:escalate", 1),
    fixtureDependency("branches_to", "section:escalate", "shared escalation flow", undefined, 2),
  ],
);

/** Parser saw the component but could not name its relationship. */
export const UNKNOWN_CONSTRUCT_FIXTURE: ScriptStructure = structure(
  [
    fixtureComponent("section", "intake", 1),
    fixtureComponent("action", "dynamic lookup", 2),
  ],
  [fixtureDependency("references", "section:intake", "dynamic lookup", "action:dynamic lookup", 1)],
  {
    unknowns: [
      { line: 9, reason: "unrecognized_construct", excerpt: "<<unrecognised operator syntax>>" },
    ],
    lineCount: 10,
    recognizedLines: 8,
  },
);

/** a → b → a. */
export const CYCLE_FIXTURE: ScriptStructure = structure(
  [
    fixtureComponent("section", "loop start", 1),
    fixtureComponent("section", "loop back", 2),
  ],
  [
    fixtureDependency("branches_to", "section:loop start", "loop back", "section:loop back", 1),
    fixtureDependency("branches_to", "section:loop back", "loop start", "section:loop start", 2),
  ],
);

/** A chain longer than the traversal bound, to prove TRUNCATED is reported. */
export function deepChainFixture(length: number): ScriptStructure {
  const components: ScriptComponent[] = [];
  const dependencies: ScriptDependency[] = [];
  for (let i = 0; i < length; i += 1) {
    components.push(fixtureComponent("section", `step ${i}`, i + 1));
    if (i > 0) {
      dependencies.push(
        fixtureDependency(
          "branches_to",
          `section:step ${i - 1}`,
          `step ${i}`,
          `section:step ${i}`,
          i,
        ),
      );
    }
  }
  return structure(components, dependencies);
}

/** Prose-style entry: recognised almost nothing. Simulation must refuse. */
export const ZERO_COVERAGE_FIXTURE: ScriptStructure = structure([], [], {
  lineCount: 40,
  recognizedLines: 0,
});
