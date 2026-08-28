import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { daysUntil, todayIso, upcomingHolidays, type Holiday } from "./holidays";

/**
 * DORMANT — Coverage Watch was removed as a product feature (Command Center
 * Phase 1). This store and its holiday helpers are kept, unwired from the UI
 * and from cloud sync, only so the shared `CoverageGap` / `WatchedAccount`
 * types still resolve and any locally persisted data survives for rollback.
 * Nothing in the active portal reads or writes it. Do not re-wire without
 * re-introducing the feature.
 *
 * Holiday & on-call coverage tracking.
 *
 * Two things go wrong at 3am in an answering service: a holiday arrives and
 * nobody confirmed the client's reduced-hours/on-call instructions, or an
 * on-call rotation quietly expires and calls get dispatched to the wrong
 * person. This store tracks both per watched account.
 */

export interface WatchedAccount {
  /** Account number is the key. */
  number: string;
  name: string;
  /** ISO date (YYYY-MM-DD) the on-call rotation on file is good through. */
  onCallThrough?: string;
  /** Who/what the current rotation is, free text. */
  onCallNote?: string;
  addedAt: number;
}

export interface HolidayConfirmation {
  /** `${accountNumber}:${holidayDate}` */
  id: string;
  accountNumber: string;
  holidayDate: string;
  note: string;
  confirmedAt: number;
}

interface State {
  accounts: WatchedAccount[];
  confirmations: HolidayConfirmation[];
}

const DEFAULT: State = { accounts: [], confirmations: [] };

export const coverageStore = createPersistedStore<State>("aih:coverage:v1", DEFAULT);

export function useCoverage(): State {
  return useStoreValue(coverageStore, DEFAULT);
}

export const coverageActions = {
  watch(number: string, name: string) {
    const num = number.trim();
    if (!num) return;
    coverageStore.update((s) =>
      s.accounts.some((a) => a.number === num)
        ? s
        : { ...s, accounts: [...s.accounts, { number: num, name: name.trim(), addedAt: Date.now() }] },
    );
  },
  unwatch(number: string) {
    coverageStore.update((s) => ({
      accounts: s.accounts.filter((a) => a.number !== number),
      confirmations: s.confirmations.filter((c) => c.accountNumber !== number),
    }));
  },
  setOnCall(number: string, patch: { onCallThrough?: string; onCallNote?: string }) {
    coverageStore.update((s) => ({
      ...s,
      accounts: s.accounts.map((a) => (a.number === number ? { ...a, ...patch } : a)),
    }));
  },
  confirmHoliday(accountNumber: string, holidayDate: string, note = "") {
    const id = `${accountNumber}:${holidayDate}`;
    coverageStore.update((s) => ({
      ...s,
      confirmations: [
        ...s.confirmations.filter((c) => c.id !== id),
        { id, accountNumber, holidayDate, note, confirmedAt: Date.now() },
      ],
    }));
  },
  clearHoliday(accountNumber: string, holidayDate: string) {
    const id = `${accountNumber}:${holidayDate}`;
    coverageStore.update((s) => ({
      ...s,
      confirmations: s.confirmations.filter((c) => c.id !== id),
    }));
  },
};

export type CoverageGapKind = "holiday" | "on-call";

export interface CoverageGap {
  id: string;
  kind: CoverageGapKind;
  accountNumber: string;
  accountName: string;
  /** Holiday name, or "On-call rotation". */
  label: string;
  /** YYYY-MM-DD the gap becomes live. */
  date: string;
  daysAway: number;
  severity: "critical" | "warning";
}

/** Window used for both holiday lookahead and on-call expiry. */
export const COVERAGE_LOOKAHEAD_DAYS = 21;

export function computeCoverageGaps(state: State, now = new Date()): CoverageGap[] {
  const holidays: Holiday[] = upcomingHolidays(COVERAGE_LOOKAHEAD_DAYS, now);
  const confirmed = new Set(state.confirmations.map((c) => c.id));
  const gaps: CoverageGap[] = [];

  for (const acct of state.accounts) {
    for (const h of holidays) {
      if (confirmed.has(`${acct.number}:${h.date}`)) continue;
      const d = daysUntil(h.date, now);
      gaps.push({
        id: `hol-${acct.number}-${h.date}`,
        kind: "holiday",
        accountNumber: acct.number,
        accountName: acct.name,
        label: h.name,
        date: h.date,
        daysAway: d,
        severity: d <= 3 || (h.major && d <= 7) ? "critical" : "warning",
      });
    }

    if (acct.onCallThrough) {
      const d = daysUntil(acct.onCallThrough, now);
      if (d <= 7) {
        gaps.push({
          id: `oncall-${acct.number}`,
          kind: "on-call",
          accountNumber: acct.number,
          accountName: acct.name,
          label: d < 0 ? "On-call rotation expired" : "On-call rotation ending",
          date: acct.onCallThrough,
          daysAway: d,
          severity: d <= 1 ? "critical" : "warning",
        });
      }
    }
  }

  return gaps.sort((a, b) => a.daysAway - b.daysAway || a.accountNumber.localeCompare(b.accountNumber));
}

export function useCoverageGaps(): CoverageGap[] {
  const state = useCoverage();
  return computeCoverageGaps(state);
}

export { todayIso };

// Cloud-sync registration intentionally removed with the Coverage Watch feature
// (Command Center Phase 1). The store no longer participates in blob sync.