/**
 * Phase 14 — deterministic Recommendation Gate.
 *
 * Candidate generation is broad; recommendation is narrow. Every candidate
 * passes through here, and no AI call may bypass it. The gate answers only
 * deterministic questions: is it already done, already failed, dismissed,
 * permitted, unblocked, and safe given current evidence?
 */

import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import type {
  NbaReasonCode,
  NextBestAction,
  NextBestActionState,
  WorkEpisodeSignals,
} from "./nba-contract";
import type { WorkProgressState } from "./work-progress";

export interface GateContext {
  envelope: PortalContextEnvelope;
  progress: WorkProgressState;
  episode: WorkEpisodeSignals;
  permissions: { canPrepareWrites: boolean };
  now: number;
}

export interface GateVerdict {
  state: NextBestActionState;
  /** Extra reason codes contributed by the gate (penalties included). */
  reasonCodes: NbaReasonCode[];
  blockers: NextBestAction["blockers"];
  /** Human-safe explanation of why it is blocked/withheld, when applicable. */
  note?: string;
}

function attemptFor(episode: WorkEpisodeSignals, fingerprint: string) {
  return episode.attempts
    .filter((a) => a.fingerprint === fingerprint)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .at(-1);
}

/** Conditions changed after the attempt => a retry may become eligible (§17). */
function conditionsChangedSince(attemptAt: string, changedAt?: string): boolean {
  if (!changedAt) return false;
  return Date.parse(changedAt) > Date.parse(attemptAt);
}

export function evaluateGate(candidate: NextBestAction, ctx: GateContext): GateVerdict {
  const reasonCodes: NbaReasonCode[] = [];
  const blockers: NextBestAction["blockers"] = [...candidate.blockers];

  // Already established this episode.
  if (ctx.episode.completedChecks.includes(candidate.fingerprint)) {
    return {
      state: "completed",
      reasonCodes: ["ALREADY_COMPLETED"],
      blockers,
      note: "Already established in this work episode.",
    };
  }

  // Dismissed for this work episode (not a global truth).
  if (ctx.episode.dismissed.some((d) => d.fingerprint === candidate.fingerprint)) {
    return {
      state: "dismissed",
      reasonCodes: ["DISMISSED_BY_OPERATOR"],
      blockers,
      note: "Dismissed by the operator for this work.",
    };
  }

  // Repeat suppression for attempted / failed actions.
  const attempt = attemptFor(ctx.episode, candidate.fingerprint);
  if (attempt) {
    const eligibleAgain =
      conditionsChangedSince(attempt.at, attempt.conditionsChangedAt) ||
      candidate.reasonCodes.includes("VERIFIED_PROCEDURE_STEP");
    if (attempt.outcome === "failed" || attempt.outcome === "no_effect") {
      if (!eligibleAgain) {
        return {
          state: "blocked",
          reasonCodes: ["PRIOR_FAILED_ACTION"],
          blockers: [
            ...blockers,
            {
              id: `failed:${candidate.fingerprint}`,
              type: "prior_failed_action",
              label: "Already attempted in this episode without effect.",
            },
          ],
          note: "This was already attempted in this episode and did not help. New evidence would be needed to retry.",
        };
      }
      reasonCodes.push("PRIOR_FAILED_ACTION");
    } else if (attempt.outcome === "succeeded") {
      return { state: "completed", reasonCodes: ["ALREADY_COMPLETED"], blockers };
    } else {
      reasonCodes.push("ALREADY_ATTEMPTED");
    }
  }

  // Unsatisfied prerequisites block outright.
  const unmet = candidate.prerequisiteChecks.filter((p) => !p.satisfied);
  if (unmet.length) {
    return {
      state: "blocked",
      reasonCodes,
      blockers: [
        ...blockers,
        ...unmet.map((p) => ({ id: `prereq:${p.id}`, type: "prerequisite", label: p.label })),
      ],
      note: `Prerequisite not satisfied: ${unmet[0].label}`,
    };
  }

  const mutating = Boolean(candidate.proposedSafeAction) || candidate.kind === "PREPARE_ACTION";

  // Permissions.
  if (mutating && !ctx.permissions.canPrepareWrites) {
    return {
      state: "blocked",
      reasonCodes: [...reasonCodes, "PERMISSION_REQUIRED"],
      blockers: [
        ...blockers,
        { id: "permission", type: "permission", label: "Write actions are not available to this session." },
      ],
    };
  }

  // Unresolved conflicts pause every mutation-capable suggestion (§40).
  const conflicts = ctx.envelope.evidenceConflicts ?? [];
  const unresolvedConflict = conflicts.some((c) => c.status === "unresolved");
  if (mutating && unresolvedConflict) {
    return {
      state: "blocked",
      reasonCodes: [...reasonCodes, "CONFLICT_REQUIRES_VERIFICATION"],
      blockers: [
        ...blockers,
        {
          id: "conflict",
          type: "evidence_conflict",
          label: "Sources disagree; the authoritative value must be confirmed first.",
        },
      ],
      note: "Conflicting evidence must be resolved before a change is proposed.",
    };
  }

  // Verification before mutation while the picture is unverified (§43).
  if (mutating && candidate.evidenceConfidence !== "verified") {
    return {
      state: "blocked",
      reasonCodes: [...reasonCodes, "MUTATION_BEFORE_VERIFICATION"],
      blockers: [
        ...blockers,
        {
          id: "unverified",
          type: "unverified_state",
          label: "Relevant state is not verified yet.",
        },
      ],
      note: "Verify the current state before changing anything.",
    };
  }

  // Blocked by a recorded operational blocker attached to the same entity.
  const entityBlocker = ctx.progress.activeBlockers.find(
    (b) => candidate.target && b.entityId && b.entityId === candidate.target.id,
  );
  if (entityBlocker && candidate.kind !== "REVIEW") {
    return {
      state: "blocked",
      reasonCodes: [...reasonCodes, "UNRESOLVED_BLOCKER"],
      blockers: [
        ...blockers,
        { id: entityBlocker.id, type: entityBlocker.type, label: entityBlocker.label },
      ],
      note: `Resolve the blocker first: ${entityBlocker.label}`,
    };
  }

  return { state: "recommended", reasonCodes, blockers };
}