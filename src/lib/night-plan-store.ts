import { useEffect, useState, useSyncExternalStore } from "react";
import { getShiftKey, getNextShiftKey } from "./shift";
import { additionalWorkStore } from "./additional-work-store";
import { attachCloudSync } from "./cloud-sync/blob-sync";
import { nightPlanHistory, type NPHistoryItem, type NPHistoryStatus } from "./reports/night-plan-history";
import { eventSpine } from "./core/event-spine";

export type Priority = "must" | "important" | "normal";
export type Status = "todo" | "in-progress" | "done" | "carried" | "dismissed" | "converted";

export interface NightPlanItem {
  id: string;
  task: string;
  notes?: string;
  priority: Priority;
  status: Status;
  createdAt: number;
  completedAt?: number;
  dismissedAt?: number;
  convertedAt?: number;
  additionalWorkId?: string;
  carryTrail?: string[];
}

interface PlanState {
  shiftKey: string;
  items: NightPlanItem[];
  celebrationShown?: boolean;
  rolloverAnsweredShiftKey?: string;
}

const KEY = "aih:nightplan:v1";

function statusForArchive(s: Status): NPHistoryStatus {
  if (s === "done") return "done";
  if (s === "converted") return "converted";
  if (s === "dismissed") return "dismissed";
  // todo / in-progress / carried → carried by default
  return "carried";
}

function toHistory(items: NightPlanItem[], shiftKey: string, overrideActive?: NPHistoryStatus): NPHistoryItem[] {
  return items.map((i) => {
    const isActiveItem = i.status === "todo" || i.status === "in-progress" || i.status === "carried";
    const status: NPHistoryStatus = isActiveItem && overrideActive ? overrideActive : statusForArchive(i.status);
    return {
      id: i.id,
      shiftKey,
      task: i.task,
      notes: i.notes,
      status,
      createdAt: i.createdAt,
      completedAt: i.completedAt ?? i.dismissedAt ?? i.convertedAt,
      carryTrail: i.carryTrail,
      additionalWorkId: i.additionalWorkId,
      priority: i.priority,
    };
  });
}

function load(): PlanState {
  if (typeof window === "undefined") return { shiftKey: "", items: [] };
  const sk = getShiftKey();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlanState;
      if (parsed.shiftKey === sk) return parsed;
      // Shift changed: archive everything from the prior shift.
      const activeLeft = parsed.items.some((i) => i.status === "todo" || i.status === "in-progress" || i.status === "carried");
      // If nothing active is leftover, treat as a clean rollover; otherwise
      // the watcher should have handled it — if it didn't (e.g. tab closed),
      // mark the leftovers as carried in history so nothing is silently lost.
      const archived = toHistory(parsed.items, parsed.shiftKey, activeLeft ? "carried" : undefined);
      if (archived.length) nightPlanHistory.addMany(archived);
    }
  } catch {}
  return { shiftKey: sk, items: [] };
}

let state: PlanState = { shiftKey: "", items: [] };
const listeners = new Set<() => void>();

function persist() {
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
}

function ensureLoaded() {
  if (typeof window !== "undefined" && state.shiftKey === "") {
    state = load();
  }
}

export const nightPlanStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get(): PlanState {
    ensureLoaded();
    return state;
  },
  add(task: string, notes: string, priority: Priority) {
    ensureLoaded();
    const item: NightPlanItem = {
      id: Math.random().toString(36).slice(2),
      task,
      notes: notes || undefined,
      priority,
      status: "todo",
      createdAt: Date.now(),
    };
    state = { ...state, items: [...state.items, item] };
    persist();
    eventSpine.emit({
      type: "night_plan.item_added",
      source: "night-plan",
      metadata: { itemId: item.id, label: task, priority },
    });
  },
  update(id: string, patch: Partial<NightPlanItem>) {
    ensureLoaded();
    state = {
      ...state,
      items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    };
    persist();
  },
  setStatus(id: string, status: Status) {
    const before = state.items.find((i) => i.id === id);
    const patch: Partial<NightPlanItem> = { status };
    if (status === "done") patch.completedAt = Date.now();
    if (status === "dismissed") patch.dismissedAt = Date.now();
    if (status === "converted") patch.convertedAt = Date.now();
    this.update(id, patch);
    // Only a real transition into "done" is a completion event.
    if (status === "done" && before && before.status !== "done") {
      eventSpine.emit({
        type: "night_plan.item_completed",
        source: "night-plan",
        metadata: { itemId: id, label: before.task || "Night plan item", prevStatus: before.status },
      });
    }
  },
  convertToAdditionalWork(
    id: string,
    account?: { number: string; name: string },
  ): string | undefined {
    ensureLoaded();
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    const work = additionalWorkStore.fromNightPlan(item, account);
    this.update(id, {
      status: "converted",
      convertedAt: Date.now(),
      additionalWorkId: work.id,
    });
    return work.id;
  },
  markCelebrationShown() {
    state = { ...state, celebrationShown: true };
    persist();
  },
  resetCelebration() {
    state = { ...state, celebrationShown: false };
    persist();
  },
  /** Archive current items to history with the chosen disposition and clear the plan. */
  archiveAndReset(disposition: "done-as-is" | "dismiss-active" | "carry-active") {
    ensureLoaded();
    const override: NPHistoryStatus | undefined =
      disposition === "dismiss-active" ? "dismissed" :
      disposition === "carry-active" ? "carried" : undefined;
    const archived = toHistory(state.items, state.shiftKey || getShiftKey(), override);
    if (archived.length) nightPlanHistory.addMany(archived);
    state = { shiftKey: getShiftKey(), items: [], celebrationShown: false, rolloverAnsweredShiftKey: state.rolloverAnsweredShiftKey };
    persist();
  },
  /** Replace plan with fresh todo clones of the given items, assigned to the next shift. */
  seedNextShiftFromCarry(items: NightPlanItem[]) {
    ensureLoaded();
    const now = Date.now();
    const fresh: NightPlanItem[] = items.map((i) => ({
      id: Math.random().toString(36).slice(2),
      task: i.task,
      notes: i.notes,
      priority: i.priority,
      status: "todo",
      createdAt: now,
      carryTrail: [...(i.carryTrail ?? []), state.shiftKey || getShiftKey()],
    }));
    state = {
      shiftKey: getNextShiftKey(),
      items: fresh,
      celebrationShown: false,
      rolloverAnsweredShiftKey: state.rolloverAnsweredShiftKey,
    };
    persist();
  },
  markRolloverAnswered(shiftKey: string) {
    ensureLoaded();
    state = { ...state, rolloverAnsweredShiftKey: shiftKey };
    persist();
  },
};

export function useNightPlan() {
  const snap = useSyncExternalStore(
    nightPlanStore.subscribe,
    () => nightPlanStore.get(),
    () => ({ shiftKey: "", items: [] }),
  );
  return snap;
}

export function priorityRank(p: Priority): number {
  return p === "must" ? 0 : p === "important" ? 1 : 2;
}

export function isActive(s: Status) {
  return s === "todo" || s === "in-progress" || s === "carried";
}

attachCloudSync<PlanState>({
  storeKey: "night-plan",
  subscribe: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  getSnapshot: () => { ensureLoaded(); return state; },
  applyServerSnapshot: (next) => {
    state = {
      shiftKey: next.shiftKey || getShiftKey(),
      items: Array.isArray(next.items) ? next.items : [],
      celebrationShown: next.celebrationShown,
    };
    persist();
  },
  isEmpty: (s) => (s.items?.length ?? 0) === 0,
});