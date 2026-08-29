/**
 * Governed Actions — plan producers for the four internal capabilities.
 *
 * Producing a plan performs no writes. Every producer carries an operator
 * `reason` so the queue can always answer "why is this being proposed?".
 */

import { additionalWorkStore } from "@/lib/additional-work-store";
import { fingerprint } from "@/lib/execution/fingerprint";
import { buildExecutionPlan, type PlanResult } from "@/lib/execution/execution-plan";
import type { ExecTargetState } from "@/lib/execution/execution-contract";
import { internalRecords } from "./internal-records";

export const COMPLETED_WORK_CREATE_CAPABILITY = "work.completed_entry.create";
export const KNOWLEDGE_NOTE_CREATE_CAPABILITY = "knowledge.note.create";
export const SHIFT_SUMMARY_DRAFT_CAPABILITY = "shift.summary_draft.create";
export const SCRIPT_FIX_FINDING_CAPABILITY = "script.fix_finding.record";

function state(summary: Record<string, string | number | boolean | null>): ExecTargetState {
  return { fingerprint: fingerprint(summary), observedAt: new Date().toISOString(), summary };
}

interface BaseIntent {
  operatorRef: string;
  correlationId?: string;
  now?: () => number;
  planId?: string;
}

/* ---------------- create completed work entry ---------------- */

export interface CompletedWorkIntent extends BaseIntent {
  title: string;
  accountNumber?: string;
  accountName?: string;
  ticketNumber?: string;
  summary?: string;
}

export function prepareCompletedWorkEntry(intent: CompletedWorkIntent): PlanResult {
  const title = intent.title.trim();
  const unmet: string[] = [];
  if (!intent.operatorRef) unmet.push("authenticated");
  if (!title) unmet.push("title_present");

  const items = additionalWorkStore.getState().items;
  const input: Record<string, unknown> = { title };
  if (intent.accountNumber) input["accountNumber"] = intent.accountNumber.trim();
  if (intent.accountName) input["accountName"] = intent.accountName.trim();
  if (intent.ticketNumber) input["ticketNumber"] = intent.ticketNumber.trim();
  if (intent.summary) input["summary"] = intent.summary.trim();

  return buildExecutionPlan({
    capabilityId: COMPLETED_WORK_CREATE_CAPABILITY,
    input,
    target: { type: "additional_work", id: intent.accountNumber?.trim() || "unassigned" },
    requestedBy: "operator",
    correlationId: intent.correlationId ?? `cw_create_${fingerprint({ title })}`,
    contextRef: "completed_work",
    preState: state({
      total: items.length,
      matching: items.filter((i) => i.title === title && i.status === "completed").length,
    }),
    unmetPreconditions: unmet,
    ...(intent.now ? { now: intent.now } : {}),
    ...(intent.planId ? { planId: intent.planId } : {}),
  });
}

/* ---------------- create knowledge vault note ---------------- */

export interface KnowledgeNoteIntent extends BaseIntent {
  title: string;
  contentHtml?: string;
}

export function prepareKnowledgeVaultNote(intent: KnowledgeNoteIntent): PlanResult {
  const title = intent.title.trim();
  const unmet: string[] = [];
  if (!intent.operatorRef) unmet.push("authenticated");
  if (!title) unmet.push("title_present");

  const input: Record<string, unknown> = { title };
  if (intent.contentHtml) input["contentHtml"] = intent.contentHtml;

  return buildExecutionPlan({
    capabilityId: KNOWLEDGE_NOTE_CREATE_CAPABILITY,
    input,
    target: { type: "knowledge_note", id: title.slice(0, 60) || "untitled" },
    requestedBy: "operator",
    correlationId: intent.correlationId ?? `kv_create_${fingerprint({ title })}`,
    contextRef: "knowledge_vault",
    preState: state({ title }),
    unmetPreconditions: unmet,
    ...(intent.now ? { now: intent.now } : {}),
    ...(intent.planId ? { planId: intent.planId } : {}),
  });
}

/* ---------------- generate shift summary draft ---------------- */

export interface ShiftSummaryIntent extends BaseIntent {
  shiftKey: string;
  title: string;
  body: string;
}

export function prepareShiftSummaryDraft(intent: ShiftSummaryIntent): PlanResult {
  const shiftKey = intent.shiftKey.trim();
  const title = intent.title.trim();
  const body = intent.body.trim();
  const unmet: string[] = [];
  if (!intent.operatorRef) unmet.push("authenticated");
  if (!shiftKey) unmet.push("shift_known");
  if (!body) unmet.push("summary_content");

  const drafts = internalRecords.get().drafts;

  return buildExecutionPlan({
    capabilityId: SHIFT_SUMMARY_DRAFT_CAPABILITY,
    input: { shiftKey, title, body },
    target: { type: "shift", id: shiftKey || "current_shift" },
    requestedBy: "operator",
    correlationId: intent.correlationId ?? `ss_draft_${fingerprint({ shiftKey, title })}`,
    contextRef: "shift_summary",
    preState: state({
      total: drafts.length,
      matching: drafts.filter((d) => d.shiftKey === shiftKey).length,
    }),
    unmetPreconditions: unmet,
    ...(intent.now ? { now: intent.now } : {}),
    ...(intent.planId ? { planId: intent.planId } : {}),
  });
}

/* ---------------- record script fix finding ---------------- */

export interface ScriptFixFindingIntent extends BaseIntent {
  accountNumber: string;
  summary: string;
  detail?: string;
  ticketNumber?: string;
}

export function prepareScriptFixFinding(intent: ScriptFixFindingIntent): PlanResult {
  const accountNumber = intent.accountNumber.trim();
  const summary = intent.summary.trim();
  const unmet: string[] = [];
  if (!intent.operatorRef) unmet.push("authenticated");
  if (!accountNumber) unmet.push("account_known");
  if (!summary) unmet.push("finding_summary");

  const input: Record<string, unknown> = { accountNumber, summary };
  if (intent.detail) input["detail"] = intent.detail.trim();
  if (intent.ticketNumber) input["ticketNumber"] = intent.ticketNumber.trim();

  const findings = internalRecords.get().findings;

  return buildExecutionPlan({
    capabilityId: SCRIPT_FIX_FINDING_CAPABILITY,
    input,
    target: { type: "account", id: accountNumber || "unknown" },
    requestedBy: "operator",
    correlationId: intent.correlationId ?? `sf_finding_${fingerprint({ accountNumber, summary })}`,
    contextRef: "script_intelligence",
    preState: state({
      total: findings.length,
      matching: findings.filter((f) => f.accountNumber === accountNumber).length,
    }),
    unmetPreconditions: unmet,
    ...(intent.now ? { now: intent.now } : {}),
    ...(intent.planId ? { planId: intent.planId } : {}),
  });
}
