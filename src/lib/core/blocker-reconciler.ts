/**
 * Phase 9.5 — deterministic blocker reconciliation.
 *
 * Blocker events are the only input path into the Shift Working Context, but
 * events are transient: a reload, a cleared spine buffer or a missed emit must
 * not leave the operator with stale or missing blockers. This module diffs the
 * authoritative sources (ticket waiting states today) against the active shift
 * blockers and emits the minimum create/resolve events to close the gap.
 *
 * Startup + event driven. No polling, no AI, no free text.
 */
import { blockers, type BlockerInput, type WorkBlocker } from "./blockers";
import { eventSpine } from "./event-spine";
import { shiftContextStore } from "./shift-context";

export interface WaitingTicketSource {
  id: string;
  number: string;
  status: string;
  accountNumber?: string;
}

const WAITING_MAP: Record<string, { type: "waiting_customer" | "waiting_internal"; reasonCode: string; label: string }> = {
  "waiting-cs": {
    type: "waiting_customer",
    reasonCode: "TICKET_WAITING_CS",
    label: "Waiting on Customer Service",
  },
  "waiting-prog": {
    type: "waiting_internal",
    reasonCode: "TICKET_WAITING_PROG",
    label: "Waiting on Programming",
  },
};

/** Blockers the authoritative ticket state says should exist right now. */
export function desiredTicketBlockers(tickets: WaitingTicketSource[]): BlockerInput[] {
  const out: BlockerInput[] = [];
  for (const t of tickets) {
    const rule = WAITING_MAP[t.status];
    if (!rule) continue;
    out.push({
      type: rule.type,
      entity: { type: "ticket", id: t.id },
      ...(t.accountNumber ? { accountId: t.accountNumber } : {}),
      reasonCode: rule.reasonCode,
      safeLabel: rule.label,
      source: "ticket",
    });
  }
  return out;
}

export interface ReconcilePlan {
  create: BlockerInput[];
  resolve: WorkBlocker[];
}

/**
 * Pure diff. Only ticket-sourced blockers are reconciled here — operator,
 * dependency and action_uncertain blockers have their own lifecycles and must
 * never be resolved by this pass.
 */
export function planTicketReconcile(
  active: WorkBlocker[],
  desired: BlockerInput[],
): ReconcilePlan {
  const desiredIds = new Set(desired.map((d) => blockers.id(d.type, d.entity)));
  const activeById = new Map(active.map((b) => [b.id, b]));
  const create = desired.filter((d) => !activeById.has(blockers.id(d.type, d.entity)));
  const resolve = active.filter((b) => b.source === "ticket" && !desiredIds.has(b.id));
  return { create, resolve };
}

export function reconcileTicketBlockers(tickets: WaitingTicketSource[]): ReconcilePlan {
  const active = shiftContextStore.get().blockers;
  const plan = planTicketReconcile(active, desiredTicketBlockers(tickets));
  for (const c of plan.create) blockers.create(c);
  for (const r of plan.resolve) {
    blockers.resolve({
      type: r.type,
      entity: r.entity,
      ...(r.accountId ? { accountId: r.accountId } : {}),
      reasonCode: r.reasonCode,
      source: r.source,
    });
  }
  return plan;
}

let attached = false;

/**
 * Reconcile at startup and whenever ticket state moves. Bounded and targeted:
 * a handful of ticket events per shift, never a timer.
 */
export function startBlockerReconciler(): () => void {
  if (attached) return () => {};
  attached = true;

  const run = () => {
    void import("@/lib/tickets-store").then(({ ticketsStore }) => {
      try {
        reconcileTicketBlockers(
          ticketsStore.getState().tickets.map((t) => ({
            id: t.id,
            number: t.number,
            status: t.status,
            accountNumber: t.accountNumber || undefined,
          })),
        );
      } catch (err) {
        console.warn("[blockers] reconcile failed", err);
      }
    });
  };

  run();
  const unsub = eventSpine.subscribe(run, {
    types: ["ticket.opened", "ticket.pulled", "ticket.status_changed", "ticket.completed"],
  });
  return () => {
    unsub();
    attached = false;
  };
}
