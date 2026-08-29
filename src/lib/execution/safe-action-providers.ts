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

const nightPlanComplete: ExecutionProvider = {
  capabilityId: "night_plan.item.complete",
  // Activation 3: identity is the item id, never the task text, so a rename or
  // a duplicate title can't redirect the effect.
  readState: async (plan) => nightPlanItemState(String(plan.input["itemId"] ?? "")),
  apply: (plan) => runHandler("complete_night_plan_item", plan.input),
  verify: async (plan) => {
    const summary = nightPlanItemSummary(String(plan.input["itemId"] ?? ""));
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
