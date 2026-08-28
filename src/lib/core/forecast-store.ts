import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import { eventSpine } from "./event-spine";
import {
  FORECAST_BAND_RANK,
  FORECAST_CALC_VERSION,
  type ForecastBand,
  type ForecastLifecycle,
  type ForecastObservation,
  type ForecastTrend,
  type ForecastType,
} from "./forecast-contract";
import type { ForecastResult } from "./forecast-engine";
import type { ForecastEvaluationEntry } from "./forecast-evaluation";

/**
 * Phase 6 — persisted forecast state.
 *
 * Persists the STATE of forecasting (ids, bands, horizons, comparable counts,
 * evidence ids, lifecycle history), never prose, bodies or model output.
 * Forecasts are recomputable at any time; this record exists so trajectory can
 * be measured, so lifecycle transitions are announced exactly once, and so the
 * outcome-evaluation seam (calibration) has something to grade.
 */

export interface ForecastHistoryEntry {
  id: string;
  forecastType: ForecastType;
  band: ForecastBand;
  status: Extract<ForecastLifecycle, "resolved" | "expired" | "updated">;
  at: string;
}

export interface AccountForecastRecord {
  accountId: string;
  lastEvaluatedAt: string;
  calcVersion: number;
  forecasts: ForecastObservation[];
  evidenceGaps: ForecastObservation[];
  /** id → last announced band, so recalculation is not re-alerting. */
  announced: Record<string, ForecastBand>;
  history: ForecastHistoryEntry[];
  /** Graded forecasts whose horizon has elapsed (calibration foundation). */
  evaluations: ForecastEvaluationEntry[];
}

interface ForecastState {
  byAccount: Record<string, AccountForecastRecord>;
}

const DEFAULT: ForecastState = { byAccount: {} };
const HISTORY_MAX = 100;
const EVAL_MAX = 200;

const store = createPersistedStore<ForecastState>("aih:core:forecasts:v1", DEFAULT);

/**
 * Trajectory from the previously announced band to the new one.
 *
 * "insufficient evidence" is NOT a risk level, so a transition into or out of
 * it can never read as rising/declining risk — that would be exactly the
 * "insufficient means low" confusion Phase 6 forbids.
 */
export function trendFor(prev: ForecastBand | undefined, next: ForecastBand): ForecastTrend {
  if (!prev) return "new";
  if (prev === "insufficient_evidence" || next === "insufficient_evidence") return "stable";
  const d = FORECAST_BAND_RANK[next] - FORECAST_BAND_RANK[prev];
  if (d < 0) return "rising";
  if (d > 0) return "declining";
  return "stable";
}

export interface ForecastReconcileResult {
  next: AccountForecastRecord;
  created: ForecastObservation[];
  updated: ForecastObservation[];
  /** Previously active forecasts that stopped firing / lost evidence. */
  resolved: ForecastHistoryEntry[];
}

/**
 * Pure reconciliation of a fresh evaluation against the persisted record.
 * Lifecycle: NEW on first appearance, UPDATED when the band moves, RESOLVED
 * when the forecast no longer applies. Recalculation with an unchanged band is
 * deliberately silent (no ledger noise).
 *
 * HORIZON ANCHORING (Phase 6.5). A forecast id is stable, but the engine stamps
 * `createdAt`/`expiresAt` at every recomputation. Left alone, the outcome window
 * would slide forward forever and NO forecast could ever complete its horizon —
 * outcome grading would be unreachable. So while a horizon is still open we keep
 * the ORIGINAL anchor; once it has fully elapsed the forecast starts a fresh
 * horizon from the current evaluation.
 */
export function reconcileForecasts(
  prev: AccountForecastRecord | undefined,
  result: ForecastResult,
  accountId: string,
  now: number,
): ForecastReconcileResult {
  const nowIso = new Date(now).toISOString();
  const announced = prev?.announced ?? {};
  const priorById = new Map((prev?.forecasts ?? []).map((f) => [f.id, f]));
  const created: ForecastObservation[] = [];
  const updated: ForecastObservation[] = [];
  const nextAnnounced: Record<string, ForecastBand> = {};

  const withTrend = result.forecasts.map((f) => {
    const before = announced[f.id];
    const trend = trendFor(before, f.band);
    if (!before) created.push(f);
    else if (before !== f.band) updated.push(f);
    nextAnnounced[f.id] = f.band;

    const prior = priorById.get(f.id);
    const priorEnd = prior ? Date.parse(prior.expiresAt) : NaN;
    const horizonStillOpen = Number.isFinite(priorEnd) && priorEnd > now;
    return {
      ...f,
      trend,
      ...(horizonStillOpen && prior
        ? { createdAt: prior.createdAt, expiresAt: prior.expiresAt }
        : {}),
    } as ForecastObservation;
  });


  const currentIds = new Set(withTrend.map((f) => f.id));
  const resolved: ForecastHistoryEntry[] = (prev?.forecasts ?? [])
    .filter((f) => !currentIds.has(f.id))
    .map((f) => ({
      id: f.id,
      forecastType: f.forecastType,
      band: f.band,
      status: "resolved" as const,
      at: nowIso,
    }));

  const updatedHistory: ForecastHistoryEntry[] = updated.map((f) => ({
    id: f.id,
    forecastType: f.forecastType,
    band: f.band,
    status: "updated" as const,
    at: nowIso,
  }));

  return {
    next: {
      accountId,
      lastEvaluatedAt: nowIso,
      calcVersion: FORECAST_CALC_VERSION,
      forecasts: withTrend,
      evidenceGaps: result.evidenceGaps,
      announced: nextAnnounced,
      history: [...resolved, ...updatedHistory, ...(prev?.history ?? [])].slice(0, HISTORY_MAX),
      evaluations: prev?.evaluations ?? [],
    },
    created,
    updated: withTrend.filter((f) => updated.some((u) => u.id === f.id)),
    resolved,
  };
}

function emit(
  type:
    | "intelligence.forecast_created"
    | "intelligence.forecast_updated"
    | "intelligence.forecast_resolved"
    | "intelligence.forecast_expired",
  accountId: string,
  metadata: Record<string, string | number | boolean>,
) {
  try {
    eventSpine.emit({ type, source: "intelligence", accountId, metadata });
  } catch (err) {
    console.warn("[forecast-store] emit failed", err);
  }
}

export const forecastStore = {
  get: (accountId: string): AccountForecastRecord | undefined =>
    store.get().byAccount[accountId],

  getState: () => store.get(),

  /**
   * Persist a fresh evaluation, announce meaningful lifecycle transitions once,
   * and grade any forecast whose horizon has elapsed. Emissions carry ids,
   * types, bands and counts only — never descriptions or account content.
   */
  evaluate(accountId: string, result: ForecastResult, now: number = Date.now()) {
    const prev = store.get().byAccount[accountId];
    const { next, created, updated, resolved } = reconcileForecasts(prev, result, accountId, now);
    store.update((s) => ({ byAccount: { ...s.byAccount, [accountId]: next } }));

    for (const f of created) {
      emit("intelligence.forecast_created", accountId, {
        forecastId: f.id,
        kind: f.forecastType,
        band: f.band,
        confidence: f.confidence,
        horizonDays: f.horizonDays,
        comparableStates: f.outcomes.comparableCount,
        observedOutcomes: f.outcomes.observedCount,
      });
    }
    for (const f of updated) {
      emit("intelligence.forecast_updated", accountId, {
        forecastId: f.id,
        kind: f.forecastType,
        band: f.band,
        trend: f.trend,
      });
    }
    for (const r of resolved) {
      emit("intelligence.forecast_resolved", accountId, {
        forecastId: r.id,
        kind: r.forecastType,
        band: r.band,
      });
    }
    return { created, updated, resolved };
  },

  /** Record graded outcomes for elapsed forecasts (calibration foundation). */
  recordEvaluations(accountId: string, entries: ForecastEvaluationEntry[]) {
    if (entries.length === 0) return;
    store.update((s) => {
      const rec = s.byAccount[accountId];
      if (!rec) return s;
      const known = new Set(rec.evaluations.map((e) => `${e.forecastId}:${e.horizonEndedAt}`));
      const fresh = entries.filter((e) => !known.has(`${e.forecastId}:${e.horizonEndedAt}`));
      if (fresh.length === 0) return s;
      return {
        byAccount: {
          ...s.byAccount,
          [accountId]: {
            ...rec,
            evaluations: [...fresh, ...rec.evaluations].slice(0, EVAL_MAX),
            history: [
              ...fresh.map((e) => ({
                id: e.forecastId,
                forecastType: e.forecastType,
                band: e.band,
                status: "expired" as const,
                at: e.horizonEndedAt,
              })),
              ...rec.history,
            ].slice(0, HISTORY_MAX),
          },
        },
      };
    });
    for (const e of entries) {
      emit("intelligence.forecast_expired", accountId, {
        forecastId: e.forecastId,
        kind: e.forecastType,
        band: e.band,
        outcome: e.outcome,
      });
    }
  },
};

export function useForecastState(): ForecastState {
  return useStoreValue(store, DEFAULT);
}

/** Every persisted, currently-banded forecast across accounts. */
export function allForecasts(state: ForecastState): ForecastObservation[] {
  return Object.values(state.byAccount).flatMap((r) => r.forecasts);
}

export function allEvaluations(state: ForecastState): ForecastEvaluationEntry[] {
  return Object.values(state.byAccount).flatMap((r) => r.evaluations);
}

if (typeof window !== "undefined") {
  attachCloudSync<ForecastState>({
    storeKey: "account-forecasts",
    subscribe: store.subscribe,
    getSnapshot: () => store.get(),
    applyServerSnapshot: (next) => store.applyServerSnapshot(next),
    isEmpty: (s) => Object.keys(s.byAccount).length === 0,
  });
}
