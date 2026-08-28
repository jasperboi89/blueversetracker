import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import { eventSpine } from "./event-spine";
import type { AnomalySignal } from "./anomaly-contract";
import type { AnomalyResult } from "./anomaly-engine";

/**
 * Phase 5 — persisted anomaly state.
 *
 * Mirrors the Account Cortex store deliberately: it persists the STATE of
 * intelligence (signal ids, baselines, severities, evidence ids), never derived
 * prose or canonical content. The signals themselves are recomputable from the
 * ledger at any time; this record exists so the Command Center, the Copilot and
 * cross-device sessions see the same, stable set — and so a newly detected
 * anomaly can be announced exactly once.
 */

export const ANOMALY_CALC_VERSION = 1;

export interface AnomalyHistoryEntry {
  id: string;
  anomalyType: string;
  severity: string;
  /** "resolved" = the condition stopped firing on a later evaluation. */
  status: "resolved";
  at: string;
}

export interface AccountAnomalyRecord {
  accountId: string;
  lastEvaluatedAt: string;
  calcVersion: number;
  anomalies: AnomalySignal[];
  baselineGaps: AnomalySignal[];
  /** Ids already announced to the ledger, so re-evaluation is not re-alerting. */
  announcedIds: string[];
  /** Bounded lifecycle history — acknowledged/resolved items are never erased. */
  history: AnomalyHistoryEntry[];
}

interface AnomalyState {
  byAccount: Record<string, AccountAnomalyRecord>;
}

const DEFAULT: AnomalyState = { byAccount: {} };
const ANNOUNCED_MAX = 60;
const HISTORY_MAX = 100;

const store = createPersistedStore<AnomalyState>("aih:core:anomalies:v1", DEFAULT);

/**
 * Pure reconciliation of a fresh evaluation against the persisted record.
 * Returns the next record plus the signals seen for the first time.
 *
 * Lifecycle: an anomaly that stops firing is moved into `history` as resolved
 * (recorded once, never duplicated) and drops out of `announcedIds`, so a
 * materially recurring condition can legitimately re-announce later.
 */
export function reconcileAnomalies(
  prev: AccountAnomalyRecord | undefined,
  result: AnomalyResult,
  accountId: string,
  now: number,
): { next: AccountAnomalyRecord; newlyDetected: AnomalySignal[] } {
  const nowIso = new Date(now).toISOString();
  const announced = new Set(prev?.announcedIds ?? []);
  const newlyDetected = result.anomalies.filter((a) => !announced.has(a.id));

  const currentIds = new Set(result.anomalies.map((a) => a.id));
  const nextAnnounced = [
    ...newlyDetected.map((a) => a.id),
    ...(prev?.announcedIds ?? []).filter((id) => currentIds.has(id)),
  ].slice(0, ANNOUNCED_MAX);

  const resolved: AnomalyHistoryEntry[] = (prev?.anomalies ?? [])
    .filter((a) => !currentIds.has(a.id))
    .map((a) => ({
      id: a.id,
      anomalyType: a.anomalyType,
      severity: a.severity,
      status: "resolved" as const,
      at: nowIso,
    }));

  const history = [...resolved, ...(prev?.history ?? [])].slice(0, HISTORY_MAX);

  return {
    next: {
      accountId,
      lastEvaluatedAt: nowIso,
      calcVersion: ANOMALY_CALC_VERSION,
      anomalies: result.anomalies,
      baselineGaps: result.baselineGaps,
      announcedIds: nextAnnounced,
      history,
    },
    newlyDetected,
  };
}


export const anomalyStore = {
  get: (accountId: string): AccountAnomalyRecord | undefined => store.get().byAccount[accountId],

  getState: () => store.get(),

  /**
   * Persist a fresh evaluation and emit one durable ledger event per newly
   * detected anomaly. Emission carries ids, types and classes only — never the
   * description text or any account content.
   */
  evaluate(accountId: string, result: AnomalyResult, now: number = Date.now()): AnomalySignal[] {
    const { next, newlyDetected } = reconcileAnomalies(
      store.get().byAccount[accountId],
      result,
      accountId,
      now,
    );
    store.update((s) => ({ byAccount: { ...s.byAccount, [accountId]: next } }));

    for (const a of newlyDetected) {
      try {
        eventSpine.emit({
          type: "intelligence.anomaly_detected",
          source: "intelligence",
          accountId,
          metadata: {
            observationId: a.id,
            kind: a.anomalyType,
            severity: a.severity,
            confidence: a.confidence,
            windowDays: a.windowDays,
            count: a.sourceCount,
          },
        });
      } catch (err) {
        console.warn("[anomaly-store] emit failed", err);
      }
    }
    return newlyDetected;
  },
};

export function useAnomalyState(): AnomalyState {
  return useStoreValue(store, DEFAULT);
}

/** Every persisted anomaly across accounts (not the baseline gaps). */
export function allAnomalies(state: AnomalyState): AnomalySignal[] {
  return Object.values(state.byAccount).flatMap((r) => r.anomalies);
}

if (typeof window !== "undefined") {
  attachCloudSync<AnomalyState>({
    storeKey: "account-anomalies",
    subscribe: store.subscribe,
    getSnapshot: () => store.get(),
    applyServerSnapshot: (next) => store.applyServerSnapshot(next),
    isEmpty: (s) => Object.keys(s.byAccount).length === 0,
  });
}
