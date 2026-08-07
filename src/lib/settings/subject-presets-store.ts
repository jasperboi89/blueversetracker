import { createPersistedStore, useStoreValue } from "./_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";

/**
 * Subject-line starters and recently used subjects for Additional Work, so
 * documenting a new item is a click plus a few words instead of a blank box.
 */
export const SUBJECT_STARTERS = [
  "Client change — ",
  "Scripting fix — ",
  "Email client about ",
  "Report request — ",
  "Follow-up — ",
  "Data correction — ",
  "Account setup — ",
  "Testing / retest — ",
] as const;

export interface RecentSubject {
  subject: string;
  accountNumber?: string;
  usedAt: number;
}

interface State {
  recents: RecentSubject[];
}

const DEFAULT: State = { recents: [] };
const MAX = 40;

export const subjectPresetsStore = createPersistedStore<State>(
  "aih:settings:subject-presets:v1",
  DEFAULT,
);

export function useRecentSubjects(accountNumber?: string): RecentSubject[] {
  const all = useStoreValue(subjectPresetsStore, DEFAULT).recents ?? [];
  const scoped = accountNumber ? all.filter((r) => r.accountNumber === accountNumber) : [];
  const list = scoped.length > 0 ? scoped : all;
  return [...list].sort((a, b) => b.usedAt - a.usedAt).slice(0, 8);
}

export function rememberSubject(subject: string, accountNumber?: string): void {
  const clean = subject.trim();
  if (!clean) return;
  subjectPresetsStore.update((s) => ({
    recents: [
      { subject: clean, accountNumber: accountNumber || undefined, usedAt: Date.now() },
      ...(s.recents ?? []).filter(
        (r) => !(r.subject === clean && r.accountNumber === (accountNumber || undefined)),
      ),
    ].slice(0, MAX),
  }));
}

attachCloudSync<State>({
  storeKey: "settings:subject-presets",
  subscribe: subjectPresetsStore.subscribe,
  getSnapshot: () => subjectPresetsStore.get(),
  applyServerSnapshot: (next) => subjectPresetsStore.applyServerSnapshot(next),
  isEmpty: (s) => !s.recents || s.recents.length === 0,
});