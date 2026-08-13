import { useSyncExternalStore } from "react";
import { createPersistedStore } from "@/lib/settings/_persist";
import { getShiftKey, getShiftProgress, getShiftStatus } from "@/lib/shift";
import { isActive, nightPlanStore } from "@/lib/night-plan-store";
import { activeWorkStore, elapsedMs } from "@/lib/workspace/active-work-store";
import { ticketsStore } from "@/lib/tickets-store";
import { getRecurringRows } from "@/lib/reports/recurring-issues";
import { shiftContextStore } from "./shift-context";
import { eventSpine } from "./event-spine";
import type { AccEventType } from "./events";
import {
  dismissAwareness,
  evaluateAwareness,
  mergeAwareness,
  EMPTY_AWARENESS_STATE,
  type AwarenessItem,
  type AwarenessSnapshot,
  type AwarenessState,
} from "./awareness";

/**
 * Awareness runtime: builds a snapshot from the existing domain stores plus
 * the Shift Working Context, runs the deterministic rules, and holds the
 * dedupe/cooldown/dismissal state. Recompute is event-driven with a slow
 * safety tick for purely time-based rules (durations, shift end).
 */

const stateStore = createPersistedStore<AwarenessState>(
  "aih:core:awareness:v1",
  EMPTY_AWARENESS_STATE,
);

let items: AwarenessItem[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch (err) {
      console.warn("[awareness] listener failed", err);
    }
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Read-only snapshot assembled from the existing stores — no duplicated state. */
export function buildSnapshot(now = Date.now()): AwarenessSnapshot {
  const nowDate = new Date(now);
  const cur = safe(() => activeWorkStore.get().current, null);
  const ctx = safe(() => shiftContextStore.get(), undefined);
  return {
    now,
    shiftKey: getShiftKey(nowDate),
    shiftStatus: getShiftStatus(nowDate),
    shiftProgress: getShiftProgress(nowDate),
    activeWork: cur
      ? {
          kind: cur.kind,
          id: cur.id,
          label: cur.label,
          running: cur.running,
          elapsedMs: elapsedMs(cur, now),
          to: cur.to,
          params: cur.params,
          accountNumber: cur.accountNumber,
        }
      : null,
    contextWorkItem: ctx?.activeWorkItem,
    contextTicketId: ctx?.activeTicket?.id,
    tickets: safe(
      () =>
        ticketsStore.getState().tickets.map((t) => ({
          id: t.id,
          number: t.number,
          status: t.status,
          updatedAt: t.updatedAt,
          accountNumber: t.accountNumber,
        })),
      [],
    ),
    mustItemsRemaining: safe(
      () =>
        nightPlanStore.get().items.filter((i) => i.priority === "must" && isActive(i.status))
          .length,
      0,
    ),
    recurringAccounts: safe(
      () =>
        getRecurringRows()
          .filter((r) => r.active)
          .map((r) => ({ accountNumber: r.accountNumber, rollingCount: r.rollingCount })),
      [],
    ),
  };
}

/** Recompute awareness from live state. Cheap and idempotent. */
export function recomputeAwareness(now = Date.now()): AwarenessItem[] {
  const snapshot = buildSnapshot(now);
  const conditions = evaluateAwareness(snapshot);
  const merged = mergeAwareness(conditions, stateStore.get(), now, snapshot.shiftKey);
  stateStore.set(merged.state);
  items = merged.items;
  notify();
  return items;
}

export const awarenessStore = {
  get: (): AwarenessItem[] => items,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  recompute: recomputeAwareness,
  dismiss(dedupeKey: string) {
    const item = items.find((i) => i.dedupeKey === dedupeKey);
    stateStore.set(
      dismissAwareness(stateStore.get(), dedupeKey, item?.severity ?? "info", Date.now()),
    );
    recomputeAwareness();
  },
  reset() {
    stateStore.set({ ...EMPTY_AWARENESS_STATE, shiftKey: getShiftKey() });
    items = [];
    notify();
  },
};

/** Events that can change an awareness condition. */
const AWARENESS_EVENTS: readonly AccEventType[] = [
  "ticket.status_changed",
  "ticket.completed",
  "ticket.opened",
  "ticket.pulled",
  "work.started",
  "work.paused",
  "work.completed",
  "timer.started",
  "timer.stopped",
  "night_plan.item_added",
  "night_plan.item_completed",
  "account.opened",
  "dispatch.completed",
];

const TICK_MS = 60_000;
let running = false;

/** Wire awareness to the Event Spine plus a slow clock. Idempotent. */
export function startAwareness(): () => void {
  if (running) return () => {};
  running = true;
  const unsub = eventSpine.subscribe(() => {
    try {
      recomputeAwareness();
    } catch (err) {
      // Never let awareness break the workflow that emitted the event.
      console.warn("[awareness] recompute failed", err);
    }
  }, { types: AWARENESS_EVENTS });
  const timer = setInterval(() => {
    try {
      recomputeAwareness();
    } catch (err) {
      console.warn("[awareness] tick failed", err);
    }
  }, TICK_MS);
  recomputeAwareness();
  return () => {
    unsub();
    clearInterval(timer);
    running = false;
  };
}

const EMPTY_ITEMS: AwarenessItem[] = [];

export function useAwareness(): AwarenessItem[] {
  return useSyncExternalStore(
    (l) => awarenessStore.subscribe(l),
    () => items,
    () => EMPTY_ITEMS,
  );
}