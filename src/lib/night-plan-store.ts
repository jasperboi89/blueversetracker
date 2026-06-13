import { useEffect, useState, useSyncExternalStore } from "react";
import { getShiftKey } from "./shift";
import { additionalWorkStore } from "./additional-work-store";
import { attachCloudSync } from "./cloud-sync/blob-sync";

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
}

interface PlanState {
  shiftKey: string;
  items: NightPlanItem[];
  celebrationShown?: boolean;
}

const KEY = "aih:nightplan:v1";

function load(): PlanState {
  if (typeof window === "undefined") return { shiftKey: "", items: [] };
  const sk = getShiftKey();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlanState;
      if (parsed.shiftKey === sk) return parsed;
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
    const patch: Partial<NightPlanItem> = { status };
    if (status === "done") patch.completedAt = Date.now();
    if (status === "dismissed") patch.dismissedAt = Date.now();
    if (status === "converted") patch.convertedAt = Date.now();
    this.update(id, patch);
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