/**
 * Activation 2 — canonical capability → Action Ledger action type mapping.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two vocabularies grew independently:
 *
 *   - The Safe Action Executor (Phase 4) identifies work by HANDLER identity:
 *     `add_night_plan_item`, `complete_night_plan_item`, …  The durable
 *     `action_ledger` audits those identifiers and its server-side `z.enum`
 *     validates against them.
 *   - The governed execution layer (Phase 10) identifies work by CAPABILITY
 *     identity: `night_plan.item.create`, …  That id is the external contract
 *     and must not change.
 *
 * The execution engine previously sent the capability id straight to
 * `reserveAction`, which the server correctly rejected. The fix is an explicit,
 * typed, registry-backed adapter — not a looser server enum.
 *
 * Rules encoded here:
 *   - Mapping lives on the executable capability contract itself, so a new
 *     capability cannot be added without answering "what does this audit as?".
 *   - Unknown capability      → BLOCK.
 *   - Missing/null mapping    → BLOCK (e.g. `knowledge.draft.create`).
 *   - Fixture mapping         → allowed only for `fixtureOnly` contracts, and
 *     the sentinel `fixture_only` is absent from the server enum, so a fixture
 *     can never reserve against the production audit ledger.
 */

import { getExecutableCapability } from "./executable-registry";
import type { ExecLedgerActionType, ExecutableCapability } from "./execution-contract";

/** Mirror of the server-side `ACTION_TYPES` enum in `action-ledger.functions.ts`. */
export const SERVER_LEDGER_ACTION_TYPES: readonly string[] = [
  "add_night_plan_item",
  "complete_night_plan_item",
  "set_ticket_classification",
  "start_timer",
  "create_completed_work_entry",
  "create_knowledge_vault_note",
  "create_shift_summary_draft",
  "record_script_fix_finding",
];

/** Effect family each audited action type is allowed to touch. */
const ACTION_TYPE_FAMILY: Record<ExecLedgerActionType, string> = {
  add_night_plan_item: "night_plan",
  complete_night_plan_item: "night_plan",
  set_ticket_classification: "ticket",
  start_timer: "timer",
  create_completed_work_entry: "completed_work",
  create_knowledge_vault_note: "knowledge",
  create_shift_summary_draft: "shift",
  record_script_fix_finding: "script",
  fixture_only: "fixture",
};

/** Family implied by the capability id itself (first dotted segment family). */
function capabilityFamily(capabilityId: string): string {
  if (capabilityId.startsWith("night_plan.")) return "night_plan";
  if (capabilityId.startsWith("freshdesk.ticket.")) return "ticket";
  if (capabilityId.startsWith("work.timer.")) return "timer";
  if (capabilityId.startsWith("work.completed_entry.")) return "completed_work";
  if (capabilityId.startsWith("knowledge.note.create")) return "knowledge";
  if (capabilityId.startsWith("shift.summary_draft.")) return "shift";
  if (capabilityId.startsWith("script.fix_finding.")) return "script";
  if (capabilityId.startsWith("fixture.")) return "fixture";
  return "unmapped";
}

export type LedgerActionResolution =
  | { ok: true; actionType: ExecLedgerActionType; auditable: boolean }
  | { ok: false; reason: "unknown_capability" | "no_mapping" | "fixture_misuse"; message: string };

/**
 * Fail-closed resolution used by the execution engine as a preflight, before a
 * confirmation proof is consumed and long before anything is applied.
 */
export function resolveLedgerActionType(capabilityId: string): LedgerActionResolution {
  const contract = getExecutableCapability(capabilityId);
  if (!contract) {
    return {
      ok: false,
      reason: "unknown_capability",
      message: `“${capabilityId}” is not on the executable allowlist, so it cannot be audited or applied.`,
    };
  }
  const actionType = contract.ledgerActionType;
  if (!actionType) {
    return {
      ok: false,
      reason: "no_mapping",
      message: `“${contract.name}” has no audited action type, so it cannot be applied from this system.`,
    };
  }
  if (actionType === "fixture_only" && !contract.fixtureOnly) {
    return {
      ok: false,
      reason: "fixture_misuse",
      message: `“${contract.name}” is mapped to a test-only action type and will not be applied.`,
    };
  }
  if (actionType !== "fixture_only" && contract.fixtureOnly) {
    return {
      ok: false,
      reason: "fixture_misuse",
      message: `“${contract.name}” is a fixture and must never reserve a production action type.`,
    };
  }
  return {
    ok: true,
    actionType,
    auditable: SERVER_LEDGER_ACTION_TYPES.includes(actionType),
  };
}

/**
 * Load-time consistency audit. Each non-fixture executable capability that can
 * actually run must map to an action type the server recognises, in the same
 * effect family.
 */
export function ledgerMappingIssues(contracts: ExecutableCapability[]): string[] {
  const issues: string[] = [];
  for (const c of contracts) {
    const at = c.ledgerActionType;
    if (at === undefined) {
      issues.push(`${c.capabilityId}: ledgerActionType is not declared`);
      continue;
    }
    if (at === null) continue; // explicitly non-executable; blocked at preflight
    if (c.fixtureOnly !== true && !SERVER_LEDGER_ACTION_TYPES.includes(at)) {
      issues.push(`${c.capabilityId}: “${at}” is not accepted by the action ledger`);
    }
    if (c.fixtureOnly === true && at !== "fixture_only") {
      issues.push(`${c.capabilityId}: fixture mapped to a production action type`);
    }
    const wanted = capabilityFamily(c.capabilityId);
    if (ACTION_TYPE_FAMILY[at] !== wanted) {
      issues.push(`${c.capabilityId}: “${at}” is outside the ${wanted} effect family`);
    }
  }
  return issues;
}
