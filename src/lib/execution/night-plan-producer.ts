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
