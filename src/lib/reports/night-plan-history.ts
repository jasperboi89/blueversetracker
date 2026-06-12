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
}

interface State {
  items: NPHistoryItem[];
}

const KEY = "aih:nightplan-history:v1";
const SEED_FLAG = "aih:nightplan-history:seeded:v1";

let state: State = { items: [] };
let initialized = false;
const listeners = new Set<() => void>();

function shiftKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getShiftKey(d);
}

function seed(): NPHistoryItem[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const items: NPHistoryItem[] = [
    {
      id: "nph-1",
      shiftKey: shiftKeyDaysAgo(2),
      task: "Confirm Riverbend rotation update",
      notes: "Verified with CS.",
      status: "done",
      createdAt: now - 2 * day - 30 * 60_000,
      completedAt: now - 2 * day,
      priority: "must",
    },
    {
      id: "nph-2",
      shiftKey: shiftKeyDaysAgo(3),
      task: "Walk through new dispatcher script edits",
      notes: "Carried to next shift.",
      status: "carried",
      createdAt: now - 3 * day,
      carryTrail: [shiftKeyDaysAgo(3), shiftKeyDaysAgo(2), shiftKeyDaysAgo(1)],
      priority: "important",
    },
    {
      id: "nph-3",
      shiftKey: shiftKeyDaysAgo(4),
      task: "Old reminder no longer needed",
      status: "dismissed",
      createdAt: now - 4 * day,
      priority: "normal",
    },
    {
      id: "nph-4",
      shiftKey: shiftKeyDaysAgo(5),
      task: "Follow up on Cedar Oaks backup",
      status: "done",
      createdAt: now - 5 * day - 60 * 60_000,
      completedAt: now - 5 * day,
      priority: "normal",
    },
    {
      id: "nph-5",
      shiftKey: shiftKeyDaysAgo(7),
      task: "Walk through dispatcher script edits with team",
      notes: "Converted to Additional Work for tracking.",
      status: "converted",
      createdAt: now - 7 * day,
      additionalWorkId: undefined, // wired by reports-seed if possible
      priority: "must",
    },
    // Cleanup-ready (older than 3 months)
    {
      id: "nph-6",
      shiftKey: shiftKeyDaysAgo(95),
      task: "Archived shift notes — ready for cleanup",
      status: "done",
      createdAt: now - 95 * day,
      completedAt: now - 95 * day,
      priority: "normal",
    },
    {
      id: "nph-7",
      shiftKey: shiftKeyDaysAgo(40),
      task: "Quarterly script review reminder",
      status: "dismissed",
      createdAt: now - 40 * day,
      priority: "normal",
    },
  ];
  return items;
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
  // First-load seed
  const s: State = { items: seed() };
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(SEED_FLAG, "1");
  } catch {}
  return s;
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