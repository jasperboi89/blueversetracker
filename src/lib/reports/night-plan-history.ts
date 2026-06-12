import { useSyncExternalStore } from "react";
import { getShiftKey } from "../shift";

export type NPHistoryStatus = "done" | "dismissed" | "carried" | "converted";

export interface NPHistoryItem {
  id: string;
  shiftKey: string;
  task: string;
  notes?: string;
  status: NPHistoryStatus;
  createdAt: number;
  completedAt?: number;
  carryTrail?: string[]; // shift keys (oldest → newest)
  additionalWorkId?: string;
  priority?: "must" | "important" | "normal";
  /** Seed/demo flag — hidden when Demo Mode is OFF */
  isDemo?: boolean;
}

interface State {
  items: NPHistoryItem[];
}

const KEY = "aih:nightplan-history:v2";

let state: State = { items: [] };
let initialized = false;
const listeners = new Set<() => void>();

function shiftKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getShiftKey(d);
}

function load(): State {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as State;
      if (Array.isArray(p.items)) return p;
    }
  } catch {}
  return { items: [] };
}

function ensureLoaded() {
  if (!initialized && typeof window !== "undefined") {
    state = load();
    initialized = true;
  }
}
function persist() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }
  listeners.forEach((l) => l());
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

function ageMs(i: NPHistoryItem) {
  return Date.now() - (i.completedAt ?? i.createdAt);
}

export const nightPlanHistory = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  getAll(): NPHistoryItem[] { ensureLoaded(); return state.items; },
  recent(): NPHistoryItem[] {
    ensureLoaded();
    return state.items.filter((i) => ageMs(i) <= THIRTY_DAYS);
  },
  archived(): NPHistoryItem[] {
    ensureLoaded();
    return state.items.filter((i) => ageMs(i) > THIRTY_DAYS);
  },
  readyForCleanup(): NPHistoryItem[] {
    ensureLoaded();
    return state.items.filter((i) => ageMs(i) > NINETY_DAYS);
  },
  delete(ids: string[]) {
    ensureLoaded();
    const set = new Set(ids);
    state = { items: state.items.filter((i) => !set.has(i.id)) };
    persist();
  },
  clearAll() {
    ensureLoaded();
    state = { items: [] };
    persist();
  },
  linkConverted(id: string, additionalWorkId: string) {
    ensureLoaded();
    state = {
      items: state.items.map((i) =>
        i.id === id ? { ...i, additionalWorkId } : i,
      ),
    };
    persist();
  },
  /** Group by shift key newest-first; items within group keep insertion order. */
  groupByShift(items: NPHistoryItem[]): { shiftKey: string; items: NPHistoryItem[] }[] {
    const map = new Map<string, NPHistoryItem[]>();
    items.forEach((i) => {
      const arr = map.get(i.shiftKey) ?? [];
      arr.push(i);
      map.set(i.shiftKey, arr);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([shiftKey, items]) => ({ shiftKey, items }));
  },
};

export function useNightPlanHistory(): NPHistoryItem[] {
  return useSyncExternalStore(
    nightPlanHistory.subscribe,
    () => nightPlanHistory.getAll(),
    () => [] as NPHistoryItem[],
  );
}