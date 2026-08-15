/**
 * Phase 15 — React view of the Guarded Plan.
 *
 * The plan is recomputed deterministically from the Portal Context Envelope
 * plus the operator's decisions. No model call sits between the operator and
 * the next verified step, and no transition happens without them.
 */

import { useMemo } from "react";
import { usePortalContext } from "@/hooks/use-portal-context";
import { contextKeyFor, episodeKeyFor } from "@/lib/nba/work-progress";
import { useEpisodeSignals } from "@/lib/nba/nba-store";
import { buildGuardedPlan } from "./plan-builder";
import { planStore, usePlanState } from "./plan-store";
import type { GuardedPlan, GuardedPlanStep } from "./plan-contract";

export interface UseGuardedPlan {
  plan: GuardedPlan;
  episodeKey: string;
  /** Operator says they are working the step. */
  start: (step: GuardedPlanStep) => void;
  /** Work done, outcome not established yet — enters the verification loop. */
  claimDone: (step: GuardedPlanStep) => void;
  /** Operator confirms the expected condition actually holds. */
  verify: (step: GuardedPlanStep) => void;
  /** Verification failed — this halts the plan by design. */
  fail: (step: GuardedPlanStep) => void;
  skip: (step: GuardedPlanStep) => void;
  halt: (reason: string) => void;
  resume: () => void;
  abandon: () => void;
  restart: () => void;
}

export function useGuardedPlan(): UseGuardedPlan {
  const { envelope } = usePortalContext();
  const episodeKey = episodeKeyFor(envelope);
  const contextKey = contextKeyFor(envelope);
  const episode = useEpisodeSignals(episodeKey);
  const planState = usePlanState(episodeKey);

  const plan = useMemo(
    () => buildGuardedPlan({ envelope, episode, planState }),
    // contextKey captures every meaningful invalidation trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextKey, episode, planState],
  );

  return {
    plan,
    episodeKey,
    start: (s) => planStore.decide(episodeKey, s.fingerprint, "started"),
    claimDone: (s) => planStore.decide(episodeKey, s.fingerprint, "claimed_done"),
    verify: (s) => planStore.decide(episodeKey, s.fingerprint, "verified"),
    fail: (s) => planStore.decide(episodeKey, s.fingerprint, "failed"),
    skip: (s) => planStore.decide(episodeKey, s.fingerprint, "skipped"),
    halt: (reason) => planStore.halt(episodeKey, reason),
    resume: () => planStore.resume(episodeKey),
    abandon: () => planStore.abandon(episodeKey),
    restart: () => planStore.clear(episodeKey),
  };
}