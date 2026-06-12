import { useSyncExternalStore } from "react";
import { ticketsStore, type Ticket } from "../tickets-store";

interface ReviewState {
  reviewed: Record<string, { lastReviewedAt: number; lastReviewCount: number }>;
}

const KEY = "aih:recurring:v1";

let state: ReviewState = { reviewed: {} };
let initialized = false;
const listeners = new Set<() => void>();
let cached: RecurringRow[] | null = null;
let dirty = true;

function load(): ReviewState {
  if (typeof window === "undefined") return { reviewed: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ReviewState;
  } catch {}
  return { reviewed: {} };
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
  dirty = true;
  listeners.forEach((l) => l());
}

const SIX_MONTHS = 1000 * 60 * 60 * 24 * 30 * 6;
const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
const TRIGGER_THRESHOLD = 3;

function scriptingTicketsByAccount(months = 6): Record<string, Ticket[]> {
  const cutoff = Date.now() - (months / 6) * SIX_MONTHS;
  const { tickets } = ticketsStore.getState();
  const byAccount: Record<string, Ticket[]> = {};
  tickets
    .filter((t) => t.issueClassification === "Scripting Issue")
    .filter((t) => (t.completedAt ?? t.updatedAt) >= cutoff)
    .forEach((t) => {
      const arr = byAccount[t.accountNumber] ?? [];
      arr.push(t);
      byAccount[t.accountNumber] = arr;
    });
  Object.values(byAccount).forEach((arr) =>
    arr.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)),
  );
  return byAccount;
}

function rollingMaxIn30Days(arr: Ticket[]): number {
  if (arr.length === 0) return 0;
  const stamps = arr
    .map((t) => t.completedAt ?? t.updatedAt)
    .sort((a, b) => a - b);
  let max = 0;
  for (let i = 0; i < stamps.length; i++) {
    let count = 1;
    for (let j = i + 1; j < stamps.length; j++) {
      if (stamps[j] - stamps[i] <= THIRTY_DAYS) count++;
      else break;
    }
    if (count > max) max = count;
  }
  return max;
}

export interface RecurringRow {
  accountNumber: string;
  accountName: string;
  tickets: Ticket[];
  sixMonthCount: number;
  rollingCount: number;
  lastIssueAt: number;
  triggered: boolean;
  reviewedAt?: number;
  /** Triggered AND not currently dismissed */
  active: boolean;
}

function computeRecurringRows(): RecurringRow[] {
  ensureLoaded();
  const by = scriptingTicketsByAccount();
  const rows: RecurringRow[] = [];
  for (const [num, tickets] of Object.entries(by)) {
    const rolling = rollingMaxIn30Days(tickets);
    const triggered = rolling > TRIGGER_THRESHOLD;
    const rev = state.reviewed[num];
    // Re-arm if more issues have happened since last review
    const reviewCount = rev?.lastReviewCount ?? -1;
    const active = triggered && tickets.length > reviewCount;
    rows.push({
      accountNumber: num,
      accountName: tickets[0].accountName,
      tickets,
      sixMonthCount: tickets.length,
      rollingCount: rolling,
      lastIssueAt: tickets[0].completedAt ?? tickets[0].updatedAt,
      triggered,
      reviewedAt: rev?.lastReviewedAt,
      active,
    });
  }
  return rows.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.rollingCount - a.rollingCount;
  });
}

export function getRecurringRows(): RecurringRow[] {
  if (dirty || cached === null) {
    cached = computeRecurringRows();
    dirty = false;
  }
  return cached;
}

export function getActiveRecurringAccounts(): RecurringRow[] {
  return getRecurringRows().filter((r) => r.active);
}

export function isAccountActiveRecurring(num: string): RecurringRow | undefined {
  return getActiveRecurringAccounts().find((r) => r.accountNumber === num);
}

export const recurringStore = {
  subscribe(l: () => void) {
    const wrapped = () => { dirty = true; l(); };
    listeners.add(wrapped);
    const unsubTickets = ticketsStore.subscribe(wrapped);
    return () => { listeners.delete(wrapped); unsubTickets(); };
  },
  markReviewed(accountNumber: string) {
    ensureLoaded();
    const by = scriptingTicketsByAccount();
    const count = (by[accountNumber] ?? []).length;
    state = {
      reviewed: {
        ...state.reviewed,
        [accountNumber]: { lastReviewedAt: Date.now(), lastReviewCount: count },
      },
    };
    persist();
  },
};

export function useRecurringRows(): RecurringRow[] {
  return useSyncExternalStore(
    recurringStore.subscribe,
    () => getRecurringRows(),
    () => [] as RecurringRow[],
  );
}