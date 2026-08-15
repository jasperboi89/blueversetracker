/**
 * Phase 14 — episode-scoped recommendation state.
 *
 * Recommendations are transient. This store keeps ONLY the bounded metadata
 * needed for duplicate suppression, dismissal, action-result linkage and safe
 * telemetry — fingerprints, outcomes and timestamps. Nothing here is durable
 * knowledge, and everything resets when the work episode changes.
 */

import { useSyncExternalStore } from "react";
import type {
  AttemptOutcome,
  EpisodeDismissal,
  NbaOutcome,
  NbaReasonCode,
  NbaRisk,
  WorkEpisodeSignals,
} from "./nba-contract";
import { emptyEpisode } from "./nba-contract";

export interface NbaTelemetryEvent {
  at: string;
  episodeKey: string;
  candidateCount: number;
  outcome: NbaOutcome;
  recommendedKind?: string;
  reasonCodes?: NbaReasonCode[];
  risk?: NbaRisk;
  confidenceBand?: string;
  blockedCount: number;
  event: "recomputed" | "accepted" | "dismissed" | "attempted" | "success" | "failed";
}

const TELEMETRY_MAX = 50;

interface State {
  episodes: Record<string, WorkEpisodeSignals>;
  telemetry: NbaTelemetryEvent[];
}

let state: State = { episodes: {}, telemetry: [] };
const listeners = new Set<() => void>();

/**
 * useSyncExternalStore requires a *stable* snapshot. Episodes that have no
 * recorded signals yet must therefore hand back the same empty object every
 * time, or React re-renders forever ("The result of getSnapshot should be
 * cached to avoid an infinite loop").
 */
const emptyCache = new Map<string, WorkEpisodeSignals>();

function emptyFor(episodeKey: string): WorkEpisodeSignals {
  let cached = emptyCache.get(episodeKey);
  if (!cached) {
    cached = emptyEpisode(episodeKey);
    emptyCache.set(episodeKey, cached);
  }
  return cached;
}

function emit() {
  for (const l of listeners) l();
}

function mutate(episodeKey: string, fn: (e: WorkEpisodeSignals) => WorkEpisodeSignals) {
  const current = state.episodes[episodeKey] ?? emptyFor(episodeKey);
  state = { ...state, episodes: { ...state.episodes, [episodeKey]: fn(current) } };
  emit();
}

export const nbaStore = {
  getEpisode(episodeKey: string): WorkEpisodeSignals {
    return state.episodes[episodeKey] ?? emptyFor(episodeKey);
  },

  /** Mark a check as established in this episode. */
  completeCheck(episodeKey: string, fingerprint: string) {
    mutate(episodeKey, (e) =>
      e.completedChecks.includes(fingerprint)
        ? e
        : {
            ...e,
            completedChecks: [...e.completedChecks, fingerprint],
            lastTransitionAt: new Date().toISOString(),
          },
    );
  },

  /** Record an attempt outcome — the engine uses this to avoid loops. */
  recordAttempt(episodeKey: string, fingerprint: string, outcome: AttemptOutcome, label?: string) {
    mutate(episodeKey, (e) => ({
      ...e,
      attempts: [
        ...e.attempts.filter((a) => a.fingerprint !== fingerprint),
        { fingerprint, outcome, at: new Date().toISOString(), label },
      ],
      lastTransitionAt: new Date().toISOString(),
    }));
  },

  /** Relevant state changed: previously failed actions may become eligible. */
  markConditionsChanged(episodeKey: string) {
    const at = new Date().toISOString();
    mutate(episodeKey, (e) => ({
      ...e,
      attempts: e.attempts.map((a) => ({ ...a, conditionsChangedAt: at })),
      lastTransitionAt: at,
    }));
  },

  /** Dismissal applies to the current work only, never as a global rule. */
  dismiss(episodeKey: string, fingerprint: string, reason?: EpisodeDismissal["reason"]) {
    mutate(episodeKey, (e) => ({
      ...e,
      dismissed: [
        ...e.dismissed.filter((d) => d.fingerprint !== fingerprint),
        { fingerprint, at: new Date().toISOString(), reason },
      ],
    }));
  },

  setResumed(episodeKey: string, resumed: boolean) {
    mutate(episodeKey, (e) => (e.resumed === resumed ? e : { ...e, resumed }));
  },

  /** Bounded, non-sensitive metadata only (§76). */
  track(event: NbaTelemetryEvent) {
    state = { ...state, telemetry: [...state.telemetry, event].slice(-TELEMETRY_MAX) };
    emit();
  },

  telemetry(): NbaTelemetryEvent[] {
    return state.telemetry;
  },

  reset() {
    state = { episodes: {}, telemetry: [] };
    emptyCache.clear();
    emit();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useEpisodeSignals(episodeKey: string): WorkEpisodeSignals {
  return useSyncExternalStore(
    nbaStore.subscribe,
    () => nbaStore.getEpisode(episodeKey),
    () => nbaStore.getEpisode(episodeKey),
  );
}