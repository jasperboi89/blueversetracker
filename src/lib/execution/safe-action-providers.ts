/**
 * Phase 10 — provider adapters that bridge governed execution to the existing
 * Safe Action handlers.
 *
 * The Safe Action Executor remains the only thing that mutates operator state.
 * These adapters do not add a second write path: they call the same registered
 * handler, then re-read the store to produce independent verification.
 */

import { getActionHandler } from "@/lib/core/action-handlers";
import { nightPlanStore } from "@/lib/night-plan-store";
import { ticketsStore, type Ticket } from "@/lib/tickets-store";
import { fingerprint } from "./fingerprint";
import { nightPlanItemState, nightPlanItemSummary } from "./night-plan-item-state";
import { getProvider, registerProvider, type ExecutionProvider, type ProviderApplyOutcome } from "./execution-provider";
import type { ActionType } from "@/lib/core/actions";
import type { ExecTargetState, ExecutionPlan } from "./execution-contract";

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

/* ---------------- night_plan.item.create ---------------- */

const nightPlanCreate: ExecutionProvider = {
  capabilityId: "night_plan.item.create",
  readState: async (plan) => {
    const task = String(plan.input["task"] ?? "");
    const items = nightPlanStore.get().items;
    return state({ total: items.length, matching: items.filter((i) => i.task === task).length });
  },
  apply: (plan) => runHandler("add_night_plan_item", plan.input),
  verify: async (plan) => {
    const task = String(plan.input["task"] ?? "");
    return nightPlanStore.get().items.some((i) => i.task === task) ? "verified" : "failed";
  },
};

/* ---------------- night_plan.item.complete ---------------- */

/**
 * Identity is the item id whenever the plan carries one (Activation 3), so a
 * rename or a duplicate title can't redirect the effect. Legacy plans that
 * only carry a task fall back to task resolution — the same rule the Safe
 * Action handler uses — so they stay verifiable rather than silently
 * "unavailable".
 */
function targetItemId(plan: { input: Readonly<Record<string, unknown>> }): string {
  const explicit = String(plan.input["itemId"] ?? "");
  if (explicit) return explicit;
  const task = String(plan.input["task"] ?? "").trim().toLowerCase();
  if (!task) return "";
  const items = nightPlanStore.get().items;
  const match =
    items.find((i) => i.task.toLowerCase() === task) ??
    items.find((i) => i.task.toLowerCase().includes(task));
  return match?.id ?? "";
}

const nightPlanComplete: ExecutionProvider = {
  capabilityId: "night_plan.item.complete",
  readState: async (plan) => nightPlanItemState(targetItemId(plan)),
  apply: (plan) => runHandler("complete_night_plan_item", plan.input),
  verify: async (plan) => {
    const summary = nightPlanItemSummary(targetItemId(plan));
    if (!summary) return "unavailable";
    return summary.completed ? "verified" : "failed";
  },
};

/* ---------------- freshdesk.ticket.classify ---------------- */

const ticketClassify: ExecutionProvider = {
  capabilityId: "freshdesk.ticket.classify",
  readState: async (plan) => {
    const number = String(plan.input["ticketNumber"] ?? "");
    const ticket = ticketsStore.getState().tickets.find((t: Ticket) => t.number === number);
    return ticket ? state({ classification: ticket.issueClassification ?? null }) : null;
  },
  apply: (plan) => runHandler("set_ticket_classification", plan.input),
  verify: async (plan) => {
    const number = String(plan.input["ticketNumber"] ?? "");
    const wanted = String(plan.input["classification"] ?? "");
    const ticket = ticketsStore.getState().tickets.find((t: Ticket) => t.number === number);
    if (!ticket) return "unavailable";
    return ticket.issueClassification === wanted ? "verified" : "failed";
  },
};

/* ---------------- work.timer.start ---------------- */

const timerStart: ExecutionProvider = {
  capabilityId: "work.timer.start",
  readState: async (plan: ExecutionPlan) => state({ ticket: String(plan.input["ticketNumber"] ?? "") }),
  apply: (plan) => runHandler("start_timer", plan.input),
  // The timer store is the authority; without a readable running-timer fact we
  // say so rather than assert success.
  verify: async () => "unavailable",
};

/**
 * Idempotent registration — safe to call from app bootstrap or tests.
 * Presence is checked against the registry itself (not a module flag) so a
 * test that clears providers can restore the real ones.
 */
export function registerSafeActionProviders(): void {
  if (getProvider(nightPlanCreate.capabilityId)) return;
  for (const p of [nightPlanCreate, nightPlanComplete, ticketClassify, timerStart]) {
    registerProvider(p);
  }
}
