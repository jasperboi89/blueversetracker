/**
 * Activation 2 — the first real plan producer.
 *
 * Turns an operator's Night Plan intent into an IMMUTABLE execution plan. It
 * performs no writes: producing a plan is always safe, which is what keeps the
 * autonomy ceiling at PREPARE.
 *
 * The pre-state fingerprint is computed with exactly the same shape the
 * `night_plan.item.create` provider reads back, so the engine's TOCTOU check
 * compares like with like.
 */

import { nightPlanStore } from "@/lib/night-plan-store";
import { fingerprint } from "./fingerprint";
import { nightPlanItemState } from "./night-plan-item-state";
import { buildExecutionPlan, type PlanResult } from "./execution-plan";
import type { ExecTargetState } from "./execution-contract";

export const NIGHT_PLAN_CREATE_CAPABILITY = "night_plan.item.create";

export interface NightPlanCreateIntent {
  task: string;
  notes?: string;
  priority?: "must" | "important" | "normal";
  operatorRef: string;
  /** Ties plan → execution → ledger → event spine → inspector together. */
  correlationId?: string;
  now?: () => number;
  planId?: string;
}

function readNightPlanState(task: string): ExecTargetState {
  const items = nightPlanStore.get().items;
  const summary = {
    total: items.length,
    matching: items.filter((i) => i.task === task).length,
  };
  return { fingerprint: fingerprint(summary), observedAt: new Date().toISOString(), summary };
}

/**
 * Build (never apply) a governed plan to add one Night Plan item.
 *
 * Effect-determining input is exactly what the Safe Action handler consumes:
 * task, notes and priority. Display-only state (dialog open, focus, draft
 * timestamps) is deliberately excluded from the fingerprint.
 */
export function prepareNightPlanItemCreate(intent: NightPlanCreateIntent): PlanResult {
  const task = intent.task.trim();
  const notes = (intent.notes ?? "").trim();
  const priority = intent.priority ?? "normal";

  const unmet: string[] = [];
  if (!intent.operatorRef) unmet.push("Signed-in operator");
  if (!task) unmet.push("A task description");

  const input: Record<string, unknown> = { task, priority };
  if (notes) input["notes"] = notes;

  return buildExecutionPlan({
    capabilityId: NIGHT_PLAN_CREATE_CAPABILITY,
    input,
    target: { type: "night_plan", id: nightPlanStore.get().shiftKey || "current_shift" },
    requestedBy: "operator",
    correlationId: intent.correlationId ?? `np_create_${fingerprint({ task, notes, priority })}`,
    contextRef: "night_plan",
    preState: readNightPlanState(task),
    unmetPreconditions: unmet,
    ...(intent.now ? { now: intent.now } : {}),
    ...(intent.planId ? { planId: intent.planId } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* Activation 3 — completion                                           */
/* ------------------------------------------------------------------ */

export const NIGHT_PLAN_COMPLETE_CAPABILITY = "night_plan.item.complete";

export interface NightPlanCompleteIntent {
  itemId: string;
  operatorRef: string;
  correlationId?: string;
  now?: () => number;
  planId?: string;
}

/**
 * Producing a completion plan is NOT the same problem as producing a creation
 * plan: creation is additive, completion is a state transition on one existing
 * row. So the producer answers three questions before it will build anything:
 *
 *   1. does the item exist?            → missing  → unmet precondition
 *   2. is it in a completable state?   → done     → ALREADY COMPLETE, no plan
 *   3. what exactly is that state now? → pre-state fingerprint (id + status)
 *
 * "Already complete" is deliberately a distinct, safe result rather than a
 * plan: re-running a completion would mint a second governed effect for a
 * transition that already happened.
 */
export type NightPlanCompleteResult =
  | PlanResult
  | { ok: false; reason: "already_complete"; message: string }
  | { ok: false; reason: "not_completable"; message: string };

/** Statuses a governed completion may transition FROM. */
const COMPLETABLE: readonly string[] = ["todo", "in-progress", "carried"];

export function prepareNightPlanItemComplete(
  intent: NightPlanCompleteIntent,
): NightPlanCompleteResult {
  const item = nightPlanStore.get().items.find((i) => i.id === intent.itemId);

  if (item?.status === "done") {
    return {
      ok: false,
      reason: "already_complete",
      message: "That night plan item is already complete — nothing was changed.",
    };
  }
  if (item && !COMPLETABLE.includes(item.status)) {
    return {
      ok: false,
      reason: "not_completable",
      message: `“${item.task}” is ${item.status} and can't be completed from here.`,
    };
  }

  const unmet: string[] = [];
  if (!intent.operatorRef) unmet.push("authenticated");
  if (!item) unmet.push("item_exists");

  return buildExecutionPlan({
    capabilityId: NIGHT_PLAN_COMPLETE_CAPABILITY,
    // `task` is what the Safe Action handler validates; `itemId` is what binds
    // the effect. Both are effect-determining, so both are fingerprinted.
    input: { itemId: intent.itemId, task: item?.task ?? "", requestedStatus: "done" },
    target: { type: "night_plan_item", id: intent.itemId },
    requestedBy: "operator",
    correlationId: intent.correlationId ?? `np_complete_${intent.itemId}`,
    contextRef: "night_plan",
    preState: nightPlanItemState(intent.itemId),
    unmetPreconditions: unmet,
    ...(intent.now ? { now: intent.now } : {}),
    ...(intent.planId ? { planId: intent.planId } : {}),
  });
}
