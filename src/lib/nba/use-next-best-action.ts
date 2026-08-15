/**
 * Phase 14 — React view of the Next-Best-Action Engine.
 *
 * Deterministic and immediate: the recommendation is computed synchronously
 * from the already-assembled Portal Context Envelope. No model call sits
 * between the operator and "verify the one remaining check".
 */

import { useEffect, useMemo } from "react";
import { usePortalContext } from "@/hooks/use-portal-context";
import { computeNextBestAction, contextKeyFor, episodeKeyFor } from "./nba-engine";
import { nbaStore, useEpisodeSignals } from "./nba-store";
import type { NbaResult } from "./nba-contract";
import { buildWorkProgress, type WorkProgressState } from "./work-progress";
import type { PortalContextEnvelope } from "@/lib/core/portal-context";

export interface UseNextBestAction {
  result: NbaResult;
  progress: WorkProgressState;
  envelope: PortalContextEnvelope;
  episodeKey: string;
  complete: (fingerprint: string) => void;
  dismiss: (fingerprint: string, reason?: "already_checked" | "not_relevant" | "not_applicable" | "wrong_context" | "other") => void;
  recordAttempt: (fingerprint: string, outcome: "attempted" | "succeeded" | "failed" | "no_effect", label?: string) => void;
}

export function useNextBestAction(): UseNextBestAction {
  const { envelope } = usePortalContext();
  const episodeKey = episodeKeyFor(envelope);
  const episode = useEpisodeSignals(episodeKey);
  const contextKey = contextKeyFor(envelope);

  const result = useMemo(
    () => computeNextBestAction({ envelope, episode }),
    // contextKey captures every meaningful invalidation trigger (§48).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextKey, episode],
  );

  const progress = useMemo(
    () => buildWorkProgress(envelope, episode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextKey, episode],
  );

  useEffect(() => {
    nbaStore.track({
      at: result.generatedAt,
      episodeKey,
      candidateCount: result.candidates.length,
      outcome: result.outcome,
      recommendedKind: result.primary?.kind,
      reasonCodes: result.primary?.reasonCodes,
      risk: result.primary?.risk,
      confidenceBand: result.primary?.confidence,
      blockedCount: result.blocked.length,
      event: "recomputed",
    });
  }, [result, episodeKey]);

  return {
    result,
    progress,
    envelope,
    episodeKey,
    complete: (fingerprint) => {
      nbaStore.completeCheck(episodeKey, fingerprint);
      nbaStore.track({
        at: new Date().toISOString(),
        episodeKey,
        candidateCount: result.candidates.length,
        outcome: result.outcome,
        blockedCount: result.blocked.length,
        event: "accepted",
      });
    },
    dismiss: (fingerprint, reason) => {
      nbaStore.dismiss(episodeKey, fingerprint, reason);
      nbaStore.track({
        at: new Date().toISOString(),
        episodeKey,
        candidateCount: result.candidates.length,
        outcome: result.outcome,
        blockedCount: result.blocked.length,
        event: "dismissed",
      });
    },
    recordAttempt: (fingerprint, outcome, label) => {
      nbaStore.recordAttempt(episodeKey, fingerprint, outcome, label);
      nbaStore.track({
        at: new Date().toISOString(),
        episodeKey,
        candidateCount: result.candidates.length,
        outcome: result.outcome,
        blockedCount: result.blocked.length,
        event: outcome === "succeeded" ? "success" : outcome === "failed" ? "failed" : "attempted",
      });
    },
  };
}