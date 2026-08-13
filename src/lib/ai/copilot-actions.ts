/**
 * Copilot proposal adapter.
 *
 * The Copilot stream emits loose wire proposals; this maps them onto the typed
 * Safe Action Executor contract. All execution goes through executeAction —
 * this module performs no mutations.
 */
import {
  createProposedAction,
  isActionType,
  type ActionType,
  type AnyProposedAction,
} from "@/lib/core/actions";
import { describeProposedAction } from "@/lib/core/action-executor";
import type { ProposedAction as WireProposal } from "./copilot-stream";

function payloadFor(kind: ActionType, a: WireProposal): Record<string, unknown> {
  switch (kind) {
    case "add_night_plan_item":
      return { task: a.task ?? "", notes: a.notes ?? "", priority: a.priority ?? "normal" };
    case "complete_night_plan_item":
      return { task: a.task ?? "" };
    case "set_ticket_classification":
      return { ticketNumber: a.ticketNumber ?? "", classification: a.classification ?? "" };
    case "start_timer":
      return { ticketNumber: a.ticketNumber ?? "" };
  }
}

/** Convert a streamed proposal into a typed, idempotency-keyed action. */
export function toProposedAction(a: WireProposal): AnyProposedAction | null {
  if (!isActionType(a.kind)) return null;
  const kind = a.kind;
  return createProposedAction({
    type: kind,
    // Handlers re-validate every field before anything executes.
    payload: payloadFor(kind, a) as never,
    origin: "copilot",
    reason: a.reason ?? undefined,
  }) as AnyProposedAction;
}

/** One-line human description for the confirm card. */
export function describeAction(a: AnyProposedAction): string {
  return describeProposedAction(a);
}
