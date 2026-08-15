/**
 * Phase 15 — episode-scoped plan decisions.
 *
 * The plan itself is DERIVED, never stored: only the operator's decisions
 * (started / claimed done / verified / failed / skipped / halt) live here, and
 * they die with the work episode. Nothing in this store is durable knowledge,
 * and nothing here mutates production data.
 */

import { useSyncExternalStore } from "react";
import {
  emptyPlanState,
  type PlanDecisionKind,
  type PlanEpisodeState,
} from "./plan-contract";

interface State {
  episodes: Record<string, PlanEpisodeState>;
}

let state: State = { episodes: {} };
const listeners = new Set<() => void>();

/** useSyncExternalStore needs a stable snapshot for untouched episodes. */
const emptyCache = new Map<string, PlanEpisodeState>();

function emptyFor(episodeKey: string): PlanEpisodeState {
  let cached = emptyCache.get(episodeKey);
  if (!cached) {
    cached = emptyPlanState(episodeKey);
    emptyCache.set(episodeKey, cached);
  }
  return cached;
}

function emit() {
  for (const l of listeners) l();
}

function mutate(episodeKey: string, fn: (s: PlanEpisodeState) => PlanEpisodeState) {
  const current = state.episodes[episodeKey] ?? emptyFor(episodeKey);
  state = { ...state, episodes: { ...state.episodes, [episodeKey]: fn(current) } };
  emit();
}

export const planStore = {
  get(episodeKey: string): PlanEpisodeState {
    return state.episodes[episodeKey] ?? emptyFor(episodeKey);
  },

  /** Record a decision. The latest decision per step fingerprint wins. */
  decide(
    episodeKey: string,
    fingerprint: string,
    kind: PlanDecisionKind,
    options: { by?: "operator" | "evidence"; note?: string } = {},
  ) {
    mutate(episodeKey, (s) => ({
      ...s,
      decisions: [
        ...s.decisions.filter((d) => d.fingerprint !== fingerprint),
        {
          fingerprint,
          kind,
          at: new Date().toISOString(),
          by: options.by ?? "operator",
          ...(options.note ? { note: options.note.slice(0, 120) } : {}),
        },
      ],
    }));
  },

  halt(episodeKey: string, reason: string) {
    mutate(episodeKey, (s) => ({ ...s, halted: true, haltReason: reason.slice(0, 200) }));
  },

  resume(episodeKey: string) {
    mutate(episodeKey, (s) => {
      const next = { ...s, halted: false };
      delete next.haltReason;
      return next;
    });
  },

  abandon(episodeKey: string) {
    mutate(episodeKey, (s) => ({ ...s, abandoned: true }));
  },

  /** Start over for this episode — decisions only, never portal data. */
  clear(episodeKey: string) {
    state = { ...state, episodes: { ...state.episodes, [episodeKey]: emptyPlanState(episodeKey) } };
    emit();
  },

  reset() {
    state = { episodes: {} };
    emptyCache.clear();
    emit();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function usePlanState(episodeKey: string): PlanEpisodeState {
  return useSyncExternalStore(
    planStore.subscribe,
    () => planStore.get(episodeKey),
    () => planStore.get(episodeKey),
  );
}