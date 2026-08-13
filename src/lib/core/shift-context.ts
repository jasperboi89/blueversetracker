import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { getShiftKey } from "@/lib/shift";
import { isActive, nightPlanStore } from "@/lib/night-plan-store";
import { activeWorkStore } from "@/lib/workspace/active-work-store";
import { ticketsStore } from "@/lib/tickets-store";
import { eventSpine } from "./event-spine";
import type { AccEvent } from "./events";
import {
  BLOCKER_TYPE_LABEL,
  type BlockerEntityType,
  type BlockerSource,
  type BlockerType,
  type WorkBlocker,
} from "./blockers";

/**
 * Intelligence Core — Shift Working Context.
 *
 * Ephemeral "what am I doing right now" state, derived purely by reducing
 * Event Spine events. Nothing writes to it directly, so there is exactly one
 * place that decides what "current" means. This is NOT long-term operator
 * memory: it resets every shift and clears on sign-out with the other
 * "aih:" stores.
 */

export interface ShiftActivity {
  id: string;
  kind: "ticket" | "account" | "work" | "dispatch" | "night_plan";
  label: string;
  at: string;
  complete?: boolean;
  accountId?: string;
  ticketId?: string;
}

/**
 * Active blocker as the shift knows it. Phase 9.5 makes this a first-class
 * WorkBlocker; `label`/`since`/`ticketId` stay for existing consumers.
 */
export interface ShiftBlocker extends WorkBlocker {
  label: string;
  since: string;
  ticketId?: string;
}

export interface ShiftWarning {
  id: string;
  label: string;
  at: string;
  severity: "info" | "warning" | "critical";
}

export interface ShiftSummary {
  mustItemsRemaining: number;
  activeTimers: number;
  unresolvedWork: number;
}

export interface ShiftWorkingContext {
  shiftKey: string;
  /** No ticket body/subject here — the spine carries IDs and labels only. */
  activeTicket?: { id: string; label?: string; accountId?: string; openedAt?: string };
  activeAccount?: { id: string; name?: string };
  activeWorkItem?: { id: string; title?: string; startedAt?: string };
  activeDispatch?: { id: string };
  recentActivity: ShiftActivity[];
  blockers: ShiftBlocker[];
  warnings: ShiftWarning[];
}

const MAX_ACTIVITY = 25;
/** Generous: we bound, but never silently drop a real active blocker. */
const MAX_BLOCKERS = 25;

const EMPTY: ShiftWorkingContext = {
  shiftKey: "",
  recentActivity: [],
  blockers: [],
  warnings: [],
};

const store = createPersistedStore<ShiftWorkingContext>("aih:core:shiftctx:v1", EMPTY);

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function pushActivity(
  list: ShiftActivity[],
  entry: ShiftActivity,
): ShiftActivity[] {
  const rest = list.filter((a) => !(a.kind === entry.kind && a.id === entry.id));
  return [entry, ...rest].slice(0, MAX_ACTIVITY);
}

function markComplete(list: ShiftActivity[], id: string): ShiftActivity[] {
  return list.map((a) => (a.id === id ? { ...a, complete: true } : a));
}

/** Pure reducer: context + event -> next context. */
export function reduceShiftContext(
  ctx: ShiftWorkingContext,
  event: AccEvent,
): ShiftWorkingContext {
  const label = str(event.metadata?.["label"]) ?? "";
  switch (event.type) {
    case "ticket.opened": {
      if (!event.ticketId) return ctx;
      return {
        ...ctx,
        activeTicket: {
          id: event.ticketId,
          label: label || undefined,
          accountId: event.accountId,
          openedAt: event.timestamp,
        },
        // Opening a ticket also establishes its account context, but never
        // wipes an account the operator navigated to deliberately.
        activeAccount: event.accountId
          ? { id: event.accountId, name: str(event.metadata?.["accountName"]) }
          : ctx.activeAccount,
        recentActivity: pushActivity(ctx.recentActivity, {
          id: event.ticketId,
          kind: "ticket",
          label: label || `Ticket ${event.ticketId}`,
          at: event.timestamp,
          accountId: event.accountId,
          ticketId: event.ticketId,
        }),
      };
    }
    case "ticket.pulled": {
      if (!event.ticketId) return ctx;
      return {
        ...ctx,
        recentActivity: pushActivity(ctx.recentActivity, {
          id: event.ticketId,
          kind: "ticket",
          label: label || `Ticket ${event.ticketId}`,
          at: event.timestamp,
          accountId: event.accountId,
          ticketId: event.ticketId,
        }),
      };
    }
    case "ticket.completed": {
      if (!event.ticketId) return ctx;
      return {
        ...ctx,
        activeTicket:
          ctx.activeTicket?.id === event.ticketId ? undefined : ctx.activeTicket,
        recentActivity: markComplete(ctx.recentActivity, event.ticketId),
      };
    }
    case "account.opened": {
      if (!event.accountId) return ctx;
      // Deliberately keeps activeTicket — navigating to the account must not
      // destroy the task the operator is in the middle of.
      return {
        ...ctx,
        activeAccount: { id: event.accountId, name: str(event.metadata?.["accountName"]) },
        recentActivity: pushActivity(ctx.recentActivity, {
          id: event.accountId,
          kind: "account",
          label: label || `Account ${event.accountId}`,
          at: event.timestamp,
          accountId: event.accountId,
        }),
      };
    }
    case "dispatch.opened":
    case "dispatch.started": {
      if (!event.dispatchId) return ctx;
      return {
        ...ctx,
        activeDispatch: { id: event.dispatchId },
        recentActivity: pushActivity(ctx.recentActivity, {
          id: event.dispatchId,
          kind: "dispatch",
          label: label || "Dispatch testing",
          at: event.timestamp,
          accountId: event.accountId,
        }),
      };
    }
    case "dispatch.completed": {
      if (!event.dispatchId) return ctx;
      return {
        ...ctx,
        activeDispatch:
          ctx.activeDispatch?.id === event.dispatchId ? undefined : ctx.activeDispatch,
        recentActivity: markComplete(ctx.recentActivity, event.dispatchId),
      };
    }
    case "timer.started":
    case "work.opened":
    case "work.started": {
      const id = event.workItemId ?? event.ticketId ?? event.dispatchId;
      if (!id) return ctx;
      const started = event.type !== "work.opened";
      return {
        ...ctx,
        activeWorkItem: {
          id,
          title: label || undefined,
          startedAt: started
            ? event.timestamp
            : ctx.activeWorkItem?.id === id
              ? ctx.activeWorkItem.startedAt
              : undefined,
        },
        activeAccount: event.accountId
          ? { id: event.accountId, name: str(event.metadata?.["accountName"]) }
          : ctx.activeAccount,
        recentActivity: pushActivity(ctx.recentActivity, {
          id,
          kind: "work",
          label: label || "Work item",
          at: event.timestamp,
          accountId: event.accountId,
        }),
      };
    }
    case "work.paused":
      return ctx;
    case "timer.stopped":
    case "work.completed": {
      const id = event.workItemId ?? event.ticketId ?? event.dispatchId;
      if (!id) return ctx;
      return {
        ...ctx,
        activeWorkItem: ctx.activeWorkItem?.id === id ? undefined : ctx.activeWorkItem,
        recentActivity:
          event.type === "work.completed"
            ? markComplete(ctx.recentActivity, id)
            : ctx.recentActivity,
      };
    }
    case "night_plan.item_added":
    case "night_plan.item_completed": {
      const id = str(event.metadata?.["itemId"]) ?? event.id;
      const complete = event.type === "night_plan.item_completed";
      const existing = ctx.recentActivity.find(
        (a) => a.kind === "night_plan" && a.id === id,
      );
      // Idempotent: a repeated completion must not add a second history row.
      if (complete && existing?.complete) return ctx;
      return {
        ...ctx,
        recentActivity: pushActivity(ctx.recentActivity, {
          id,
          kind: "night_plan",
          label: label || "Night plan item",
          at: event.timestamp,
          complete,
        }),
      };
    }
    case "coverage.expiring": {
      const id = `coverage:${event.accountId ?? label}`;
      if (ctx.warnings.some((w) => w.id === id)) return ctx;
      return {
        ...ctx,
        warnings: [
          {
            id,
            label: label || "Coverage expiring",
            at: event.timestamp,
            severity: "warning" as const,
          },
          ...ctx.warnings,
        ].slice(0, 10),
      };
    }
    case "coverage.confirmed": {
      const id = `coverage:${event.accountId ?? label}`;
      return { ...ctx, warnings: ctx.warnings.filter((w) => w.id !== id) };
    }
    default:
      return ctx;
  }
}

function base(): ShiftWorkingContext {
  const shiftKey = getShiftKey();
  const cur = store.get();
  return cur.shiftKey === shiftKey ? cur : { ...EMPTY, shiftKey };
}

let attached = false;

/** Subscribe the context reducer to the Event Spine. Idempotent. */
export function startShiftContext(): () => void {
  if (attached) return () => {};
  attached = true;
  const unsub = eventSpine.subscribe((event) => {
    const next = reduceShiftContext(base(), event);
    store.set({ ...next, shiftKey: getShiftKey() });
  });
  // Roll the context forward into the current shift on mount.
  store.set(base());
  return () => {
    unsub();
    attached = false;
  };
}

export const shiftContextStore = {
  subscribe: (l: () => void) => store.subscribe(l),
  get: (): ShiftWorkingContext => base(),
  reset: () => store.set({ ...EMPTY, shiftKey: getShiftKey() }),
};

export function useShiftWorkingContext(): ShiftWorkingContext {
  return useStoreValue(store, EMPTY);
}

/** Derived on read from the live stores — never stored stale. */
export function getShiftSummary(): ShiftSummary {
  let mustItemsRemaining = 0;
  let activeTimers = 0;
  let unresolvedWork = 0;
  try {
    mustItemsRemaining = nightPlanStore
      .get()
      .items.filter((i) => i.priority === "must" && isActive(i.status)).length;
  } catch {
    /* store not ready */
  }
  try {
    activeTimers = activeWorkStore.get().current?.running ? 1 : 0;
  } catch {
    /* store not ready */
  }
  try {
    unresolvedWork = ticketsStore
      .getState()
      .tickets.filter((t) => t.status !== "completed").length;
  } catch {
    /* store not ready */
  }
  return { mustItemsRemaining, activeTimers, unresolvedWork };
}