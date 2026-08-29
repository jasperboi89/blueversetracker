/**
 * Governed Actions — execution providers for the four internal capabilities.
 *
 * Each provider reads the target's state before the change, applies it through
 * the registered Safe Action handler (the only writer), and then independently
 * re-reads to verify. Nothing here writes directly.
 */

import { getActionHandler } from "@/lib/core/action-handlers";
import { additionalWorkStore } from "@/lib/additional-work-store";
import { fingerprint } from "@/lib/execution/fingerprint";
import {
  getProvider,
  registerProvider,
  type ExecutionProvider,
  type ProviderApplyOutcome,
} from "@/lib/execution/execution-provider";
import type { ActionType } from "@/lib/core/actions";
import type { ExecTargetState } from "@/lib/execution/execution-contract";
import { internalRecords } from "./internal-records";

function state(summary: Record<string, string | number | boolean | null>): ExecTargetState {
  return { fingerprint: fingerprint(summary), observedAt: new Date().toISOString(), summary };
}

async function runHandler(actionType: ActionType, input: unknown): Promise<ProviderApplyOutcome> {
  const handler = getActionHandler(actionType);
  if (!handler) return { status: "unavailable", note: "No handler is registered for this action." };
  const validated = handler.validate(input);
  if (!validated.ok) return { status: "rejected", note: validated.message };
  try {
    const result = await handler.execute(validated.payload);
    return result.ok
      ? { status: "applied", note: result.message }
      : { status: "rejected", note: result.message };
  } catch {
    return { status: "unknown", note: "The change was submitted but no outcome was reported." };
  }
}

const completedWorkCreate: ExecutionProvider = {
  capabilityId: "work.completed_entry.create",
  readState: async (plan) => {
    const title = String(plan.input["title"] ?? "");
    const items = additionalWorkStore.getState().items;
    return state({
      total: items.length,
      matching: items.filter((i) => i.title === title && i.status === "completed").length,
    });
  },
  apply: (plan) => runHandler("create_completed_work_entry", plan.input),
  verify: async (plan) => {
    const title = String(plan.input["title"] ?? "");
    return additionalWorkStore
      .getState()
      .items.some((i) => i.title === title && i.status === "completed")
      ? "verified"
      : "failed";
  },
};

const knowledgeNoteCreate: ExecutionProvider = {
  capabilityId: "knowledge.note.create",
  readState: async (plan) => state({ title: String(plan.input["title"] ?? "") }),
  apply: (plan) => runHandler("create_knowledge_vault_note", plan.input),
  verify: async (plan) => {
    try {
      const fns = await import("@/lib/knowledge/knowledge.functions");
      const vault = await fns.listKnowledgeVault();
      const title = String(plan.input["title"] ?? "");
      return vault.notes.some((n: { title: string }) => n.title === title) ? "verified" : "failed";
    } catch {
      return "unavailable";
    }
  },
};

const shiftSummaryDraftCreate: ExecutionProvider = {
  capabilityId: "shift.summary_draft.create",
  readState: async (plan) => {
    const shiftKey = String(plan.input["shiftKey"] ?? "");
    const drafts = internalRecords.get().drafts;
    return state({
      total: drafts.length,
      matching: drafts.filter((d) => d.shiftKey === shiftKey).length,
    });
  },
  apply: (plan) => runHandler("create_shift_summary_draft", plan.input),
  verify: async (plan) => {
    const title = String(plan.input["title"] ?? "");
    return internalRecords.get().drafts.some((d) => d.title === title) ? "verified" : "failed";
  },
};

const scriptFixFindingRecord: ExecutionProvider = {
  capabilityId: "script.fix_finding.record",
  readState: async (plan) => {
    const account = String(plan.input["accountNumber"] ?? "");
    const findings = internalRecords.get().findings;
    return state({
      total: findings.length,
      matching: findings.filter((f) => f.accountNumber === account).length,
    });
  },
  apply: (plan) => runHandler("record_script_fix_finding", plan.input),
  verify: async (plan) => {
    const summary = String(plan.input["summary"] ?? "");
    return internalRecords.get().findings.some((f) => f.summary === summary)
      ? "verified"
      : "failed";
  },
};

/** Idempotent registration — safe from bootstrap or tests. */
export function registerInternalActionProviders(): void {
  for (const p of [
    completedWorkCreate,
    knowledgeNoteCreate,
    shiftSummaryDraftCreate,
    scriptFixFindingRecord,
  ]) {
    if (!getProvider(p.capabilityId)) registerProvider(p);
  }
}
