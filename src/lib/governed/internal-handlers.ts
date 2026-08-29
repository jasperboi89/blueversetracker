/**
 * Governed Actions — Safe Action handlers for the four internal capabilities.
 *
 * These are the ONLY writers for the new governed actions, and every one of
 * them writes internally (local operator stores or the operator's own vault).
 * No handler here calls an external system.
 */

import { additionalWorkStore } from "@/lib/additional-work-store";
import { sanitizeSnapshot, type ActionType } from "@/lib/core/actions";
import type { ActionHandler, Validated } from "@/lib/core/action-handlers";
import { internalRecords } from "./internal-records";

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function invalid<T>(message: string): Validated<T> {
  return { ok: false, message };
}

/* ---------------- create_completed_work_entry ---------------- */

const createCompletedWorkEntry: ActionHandler<"create_completed_work_entry"> = {
  type: "create_completed_work_entry",
  risk: "low_write",
  describe: (p) =>
    `Create a completed work entry: “${p.title}”${p.accountNumber ? ` (account ${p.accountNumber})` : ""}`,
  validate: (raw) => {
    const o = obj(raw);
    if (!o) return invalid("Invalid payload.");
    const title = str(o["title"]);
    if (!title) return invalid("A title is required.");
    return {
      ok: true,
      payload: {
        title,
        ...(str(o["accountNumber"]) ? { accountNumber: str(o["accountNumber"]) } : {}),
        ...(str(o["accountName"]) ? { accountName: str(o["accountName"]) } : {}),
        ...(str(o["ticketNumber"]) ? { ticketNumber: str(o["ticketNumber"]) } : {}),
        ...(str(o["whatNeedsDone"]) ? { whatNeedsDone: str(o["whatNeedsDone"]) } : {}),
        ...(str(o["summary"]) ? { summary: str(o["summary"]) } : {}),
      },
    };
  },
  execute: (p) => {
    const item = additionalWorkStore.create({
      title: p.title,
      ...(p.accountNumber ? { accountNumber: p.accountNumber } : {}),
      ...(p.accountName ? { accountName: p.accountName } : {}),
      whatNeedsDone: p.whatNeedsDone ?? p.summary ?? p.title,
    });
    additionalWorkStore.markCompleted(item.id, {
      ...(p.summary ? { summary: p.summary } : {}),
    });
    return {
      ok: true,
      message: `Completed work entry created: “${p.title}”.`,
      before: null,
      after: sanitizeSnapshot({ workItemId: item.id, status: "completed", kind: "additional" }),
      entityType: "additional_work",
      entityId: item.id,
    };
  },
};

/* ---------------- create_knowledge_vault_note ---------------- */

const createKnowledgeVaultNote: ActionHandler<"create_knowledge_vault_note"> = {
  type: "create_knowledge_vault_note",
  risk: "low_write",
  describe: (p) => `Create a knowledge vault note: “${p.title}”`,
  validate: (raw) => {
    const o = obj(raw);
    if (!o) return invalid("Invalid payload.");
    const title = str(o["title"]);
    if (!title) return invalid("A note title is required.");
    return {
      ok: true,
      payload: { title, ...(str(o["contentHtml"]) ? { contentHtml: str(o["contentHtml"]) } : {}) },
    };
  },
  execute: async (p) => {
    const fns = await import("@/lib/knowledge/knowledge.functions");
    const note = await fns.createKnowledgeNote({ data: { title: p.title } });
    if (p.contentHtml) {
      await fns.updateKnowledgeNote({ data: { id: note.id, contentHtml: p.contentHtml } });
    }
    return {
      ok: true,
      message: `Knowledge note created: “${p.title}”.`,
      before: null,
      after: sanitizeSnapshot({ itemId: note.id, kind: "knowledge_note" }),
      entityType: "knowledge_note",
      entityId: note.id,
    };
  },
};

/* ---------------- create_shift_summary_draft ---------------- */

const createShiftSummaryDraft: ActionHandler<"create_shift_summary_draft"> = {
  type: "create_shift_summary_draft",
  risk: "low_write",
  describe: (p) => `Create a shift summary draft for ${p.shiftKey}`,
  validate: (raw) => {
    const o = obj(raw);
    if (!o) return invalid("Invalid payload.");
    const shiftKey = str(o["shiftKey"]);
    const title = str(o["title"]);
    const body = str(o["body"]);
    if (!shiftKey) return invalid("No shift to summarize.");
    if (!title) return invalid("A draft title is required.");
    if (!body) return invalid("The draft has no content.");
    return { ok: true, payload: { shiftKey, title, body } };
  },
  execute: (p) => {
    const draft = internalRecords.addShiftSummaryDraft(p);
    return {
      ok: true,
      message: `Shift summary draft saved for ${p.shiftKey}.`,
      before: null,
      after: sanitizeSnapshot({ itemId: draft.id, kind: "shift_summary_draft" }),
      entityType: "shift",
      entityId: draft.id,
    };
  },
};

/* ---------------- record_script_fix_finding ---------------- */

const recordScriptFixFinding: ActionHandler<"record_script_fix_finding"> = {
  type: "record_script_fix_finding",
  risk: "low_write",
  describe: (p) => `Record a script fix finding for account ${p.accountNumber}`,
  validate: (raw) => {
    const o = obj(raw);
    if (!o) return invalid("Invalid payload.");
    const accountNumber = str(o["accountNumber"]);
    const summary = str(o["summary"]);
    if (!accountNumber) return invalid("An account number is required.");
    if (!summary) return invalid("A finding summary is required.");
    return {
      ok: true,
      payload: {
        accountNumber,
        summary,
        ...(str(o["detail"]) ? { detail: str(o["detail"]) } : {}),
        ...(str(o["ticketNumber"]) ? { ticketNumber: str(o["ticketNumber"]) } : {}),
      },
    };
  },
  execute: (p) => {
    const finding = internalRecords.addScriptFixFinding(p);
    return {
      ok: true,
      message: `Script fix finding recorded for ${p.accountNumber}.`,
      before: null,
      after: sanitizeSnapshot({ itemId: finding.id, kind: "script_fix_finding" }),
      entityType: "system",
      entityId: finding.id,
    };
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const INTERNAL_ACTION_HANDLERS: Record<string, ActionHandler<any>> = {
  create_completed_work_entry: createCompletedWorkEntry,
  create_knowledge_vault_note: createKnowledgeVaultNote,
  create_shift_summary_draft: createShiftSummaryDraft,
  record_script_fix_finding: recordScriptFixFinding,
};

export const INTERNAL_ACTION_TYPES: ActionType[] = [
  "create_completed_work_entry",
  "create_knowledge_vault_note",
  "create_shift_summary_draft",
  "record_script_fix_finding",
];
