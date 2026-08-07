import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import type { ActiveKind } from "@/lib/workspace/active-work-store";

export interface WorkLogEntry {
  id: string;
  kind: ActiveKind;
  workId: string;
  label: string;
  accountNumber: string;
  accountName?: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  to: string;
  params: Record<string, string>;
  /** Set when the operator edited the duration or entered it by hand. */
  adjusted?: boolean;
}

interface WorkLogState {
  entries: WorkLogEntry[];
}

const DEFAULT: WorkLogState = { entries: [] };
const MAX_ENTRIES = 2000;
const MIN_DURATION_MS = 10_000;

export const workLogStore = createPersistedStore<WorkLogState>(
  "aih:workspace:worklog:v1",
  DEFAULT,
);

export function useWorkLog(): WorkLogState {
  return useStoreValue(workLogStore, DEFAULT);
}

export function logWorkSession(entry: Omit<WorkLogEntry, "id">): void {
  if (entry.durationMs < MIN_DURATION_MS) return;
  const full: WorkLogEntry = {
    ...entry,
    id: `wl_${entry.endedAt}_${Math.random().toString(36).slice(2, 8)}`,
  };
  workLogStore.update((s) => ({
    entries: [full, ...s.entries].slice(0, MAX_ENTRIES),
  }));
}

export function workLogForAccount(accountNumber: string): WorkLogEntry[] {
  if (!accountNumber) return [];
  return workLogStore
    .get()
    .entries.filter((e) => e.accountNumber === accountNumber);
}

/** Edit a logged session (duration, label, account). Marks it as adjusted. */
export function updateWorkLogEntry(
  id: string,
  patch: Partial<Pick<WorkLogEntry, "durationMs" | "label" | "accountNumber" | "accountName">>,
): void {
  workLogStore.update((s) => ({
    entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch, adjusted: true } : e)),
  }));
}

export function deleteWorkLogEntry(id: string): void {
  workLogStore.update((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
}

/** Add a session by hand (forgot to run the timer). */
export function addManualWorkLogEntry(input: {
  kind?: ActiveKind;
  label: string;
  accountNumber: string;
  accountName?: string;
  durationMs: number;
  endedAt?: number;
}): void {
  const endedAt = input.endedAt ?? Date.now();
  const entry: WorkLogEntry = {
    id: `wl_${endedAt}_${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind ?? "additional",
    workId: `manual-${endedAt}`,
    label: input.label || "Manual time entry",
    accountNumber: input.accountNumber,
    accountName: input.accountName,
    startedAt: endedAt - input.durationMs,
    endedAt,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    to: "",
    params: {},
    adjusted: true,
  };
  workLogStore.update((s) => ({ entries: [entry, ...s.entries].slice(0, MAX_ENTRIES) }));
}

attachCloudSync<WorkLogState>({
  storeKey: "workspace-worklog",
  subscribe: (cb) => workLogStore.subscribe(cb),
  getSnapshot: () => workLogStore.get(),
  applyServerSnapshot: (next) => workLogStore.applyServerSnapshot(next),
  isEmpty: (s) => !s.entries || s.entries.length === 0,
});
