/**
 * Phase 15 — Guarded Plan builder.
 *
 * Deterministic composition over Phase 10-14: the Portal Context Envelope,
 * the Reality Boundary facts, the Work Progress projection and the
 * Next-Best-Action engine. Same inputs -> same plan.
 *
 * Invariants enforced here:
 *   1. Steps only come from grounded sources (interpreted procedures, blockers,
 *      the deterministic NBA recommendation). Nothing is invented.
 *   2. Every mutating step is preceded by a verification step.
 *   3. A step becomes `ready` only when its prerequisites are VERIFIED and the
 *      Plan Safety Gate allows it.
 *   4. A failed verification halts the plan instead of skipping ahead.
 */

import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import { computeNextBestAction } from "@/lib/nba/nba-engine";
import { buildWorkProgress, contextKeyFor, episodeKeyFor } from "@/lib/nba/work-progress";
import { actionFingerprint, emptyEpisode, type WorkEpisodeSignals } from "@/lib/nba/nba-contract";
import type { EvidenceEntityRef } from "@/lib/core/evidence-contract";
import {
  emptyPlan,
  emptyPlanState,
  latestDecision,
  type GuardedPlan,
  type GuardedPlanStep,
  type GuardedPlanWarning,
  type PlanEpisodeState,
  type PlanStepKind,
  type PlanStepStatus,
} from "./plan-contract";
import { evaluatePlanGate } from "./plan-gate";
import { evaluateVerification, requirementFor } from "./verification";

export interface BuildPlanInput {
  envelope: PortalContextEnvelope;
  episode?: WorkEpisodeSignals;
  planState?: PlanEpisodeState;
  permissions?: { canPrepareWrites?: boolean };
  now?: number;
  /** Hard cap — a plan longer than this is a wall of text, not guidance. */
  maxSteps?: number;
}

const DEFAULT_MAX_STEPS = 8;

interface DraftStep {
  fingerprint: string;
  kind: PlanStepKind;
  label: string;
  rationale: string;
  mutating: boolean;
  derivation: GuardedPlanStep["derivation"];
  sourceType?: string;
  sourceId?: string;
  evidenceRefs: string[];
  proposedSafeAction?: GuardedPlanStep["proposedSafeAction"];
}

function subjectFor(env: PortalContextEnvelope): EvidenceEntityRef | undefined {
  const a = env.active;
  if (a.ticket) return { type: "ticket", id: a.ticket.id };
  if (a.dispatch) return { type: "dispatch", id: a.dispatch.id };
  if (a.workItem) return { type: "additional_work", id: a.workItem.id };
  if (a.account) return { type: "account", id: a.account.id };
  return undefined;
}

/** Insert the verification step a mutating step is required to depend on. */
function guardMutations(drafts: DraftStep[]): DraftStep[] {
  const out: DraftStep[] = [];
  for (const d of drafts) {
    if (d.mutating) {
      const prev = out.at(-1);
      if (!prev || prev.mutating) {
        const label = `Verify the current state before: ${d.label}`;
        out.push({
          fingerprint: actionFingerprint("VERIFY", label),
          kind: "VERIFY",
          label,
          rationale:
            "A change is only safe once the current state is established, so this check is inserted first.",
          mutating: false,
          derivation: "engine",
          ...(d.sourceType ? { sourceType: d.sourceType } : {}),
          ...(d.sourceId ? { sourceId: d.sourceId } : {}),
          evidenceRefs: d.evidenceRefs,
        });
      }
    }
    out.push(d);
  }
  return out;
}

function dedupe(drafts: DraftStep[]): DraftStep[] {
  const seen = new Set<string>();
  return drafts.filter((d) => (seen.has(d.fingerprint) ? false : (seen.add(d.fingerprint), true)));
}

export function buildGuardedPlan(input: BuildPlanInput): GuardedPlan {
  const env = input.envelope;
  const now = input.now ?? Date.now();
  const generatedAt = new Date(now).toISOString();
  const episodeKey = episodeKeyFor(env);
  const contextKey = contextKeyFor(env);
  const episode = input.episode ?? emptyEpisode(episodeKey);
  const planState = input.planState ?? emptyPlanState(episodeKey);
  const permissions = { canPrepareWrites: input.permissions?.canPrepareWrites ?? true };
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;

  const progress = buildWorkProgress(env, episode, now);
  const warnings: GuardedPlanWarning[] = [];
  const degraded = env.warnings.some(
    (w) => w.code === "context_degraded" || w.code === "source_unavailable",
  );
  if (degraded) {
    warnings.push({
      code: "context_degraded",
      message: "Some sources were unavailable — treat the gaps as unknown, not as clear.",
    });
  }
  if ((env.evidenceConflicts ?? []).some((c) => c.status === "unresolved")) {
    warnings.push({
      code: "unresolved_conflict",
      message: "Sources disagree; no change can be prepared until that is settled.",
    });
  }

  /* ---- 1. grounded drafts ------------------------------------------ */

  const drafts: DraftStep[] = [];

  for (const proc of progress.procedures) {
    if (proc.superseded) {
      warnings.push({
        code: "superseded_guidance",
        message: `${proc.title ?? proc.sourceId} has been superseded; its steps are shown for reference only.`,
      });
      continue;
    }
    if (proc.stale) {
      warnings.push({
        code: "stale_guidance",
        message: `${proc.title ?? proc.sourceId} is older than its freshness window — re-verify before following it.`,
      });
    }
    for (const step of proc.steps) {
      if (step.status === "not_applicable") continue;
      drafts.push({
        fingerprint: step.fingerprint,
        kind: step.verification ? "VERIFY" : "PREPARE_ACTION",
        label: step.label,
        rationale: `From ${proc.title ?? proc.sourceType} (${proc.confidence} confidence, ${proc.derivation} structure).`,
        mutating: !step.verification,
        derivation: proc.derivation,
        sourceType: step.sourceType,
        sourceId: step.sourceId,
        evidenceRefs: [`${step.sourceType}:${step.sourceId}`],
      });
    }
  }

  // The deterministic recommendation is a legitimate first step when the
  // guidance itself is silent.
  try {
    const nba = computeNextBestAction({ envelope: env, episode, now, permissions });
    const p = nba.primary;
    if (p) {
      drafts.unshift({
        fingerprint: p.fingerprint,
        kind: p.proposedSafeAction ? "PREPARE_ACTION" : p.kind === "REVIEW" ? "REVIEW" : "VERIFY",
        label: p.title,
        rationale: p.explanation,
        mutating: Boolean(p.proposedSafeAction),
        derivation: "engine",
        evidenceRefs: p.evidenceRefs,
        ...(p.proposedSafeAction ? { proposedSafeAction: p.proposedSafeAction } : {}),
      });
    }
  } catch {
    // A recommendation failure must never take the plan down.
  }

  const ordered = guardMutations(dedupe(drafts)).slice(0, maxSteps);

  if (!ordered.length) {
    const plan = emptyPlan(episodeKey, contextKey, generatedAt, {
      code: "no_grounded_steps",
      message:
        "There is no grounded guidance for this work yet, so no plan is offered. Establishing the current state is the honest next move.",
    });
    plan.objective = progress.objective;
    plan.degraded = degraded;
    plan.warnings.push(...warnings);
    return plan;
  }

  /* ---- 2. status + gate per step ----------------------------------- */

  const subject = subjectFor(env);
  const steps: GuardedPlanStep[] = [];
  let prerequisitesSatisfied = true;
  let halted = Boolean(planState.halted);
  let haltReason = planState.haltReason;
  const planStopped = Boolean(planState.halted || planState.abandoned);

  ordered.forEach((d, index) => {
    const requirement = requirementFor({
      fingerprint: d.fingerprint,
      label: d.label,
      mutating: d.mutating,
      ...(subject ? { subject } : {}),
      envelope: env,
    });
    const decision = latestDecision(planState, d.fingerprint);
    const outcome = evaluateVerification({ requirement, envelope: env, decision, now });

    const gate = evaluatePlanGate(
      { mutating: d.mutating, kind: d.kind, label: d.label, sourceId: d.sourceId },
      { envelope: env, progress, permissions, prerequisitesSatisfied, planStopped },
    );

    let status: PlanStepStatus;
    let note = gate.note;
    if (decision?.kind === "skipped") {
      status = "skipped";
      note = "Skipped by the operator for this work.";
    } else if (outcome.result === "verified") {
      status = "verified";
      note = outcome.by === "evidence" ? "Confirmed by current evidence." : "Confirmed by you.";
    } else if (outcome.result === "failed") {
      status = "failed";
      note = "This step did not achieve what it was supposed to.";
    } else if (gate.status === "blocked") {
      status = "blocked";
    } else if (!prerequisitesSatisfied) {
      status = "pending";
    } else if (decision?.kind === "claimed_done") {
      status = "awaiting_verification";
      note = outcome.stillNeeded;
    } else if (decision?.kind === "started") {
      status = "in_progress";
    } else {
      status = "ready";
    }

    const prerequisites = index > 0 ? [ordered[index - 1].fingerprint] : [];

    steps.push({
      id: `${episodeKey}#${index}`,
      index,
      fingerprint: d.fingerprint,
      kind: d.kind,
      label: d.label,
      rationale: d.rationale,
      mutating: d.mutating,
      risk: status === "blocked" ? "BLOCKED" : d.mutating ? "HIGH" : "LOW",
      derivation: d.derivation,
      ...(d.sourceType ? { sourceType: d.sourceType } : {}),
      ...(d.sourceId ? { sourceId: d.sourceId } : {}),
      evidenceRefs: [...d.evidenceRefs, ...outcome.evidenceRefs].slice(0, 6),
      prerequisites,
      verification: requirement,
      status,
      blockers: gate.blockers,
      ...(d.proposedSafeAction && status === "ready" ? { proposedSafeAction: d.proposedSafeAction } : {}),
      ...(note ? { note } : {}),
    });

    if (status === "failed") {
      halted = true;
      haltReason =
        haltReason ??
        `Verification failed on step ${index + 1}: ${d.label}. The plan stops here until that is understood.`;
      warnings.push({
        code: "verification_failed",
        message: "A step did not verify. The remaining steps are held back deliberately.",
      });
    }

    // Everything after an unverified/failed/blocked step stays pending.
    if (status !== "verified" && status !== "skipped") prerequisitesSatisfied = false;
  });

  /* ---- 3. plan-level status ---------------------------------------- */

  const current = steps.find((s) => s.status === "ready" || s.status === "in_progress");
  const awaiting = steps.find((s) => s.status === "awaiting_verification");
  const allSettled = steps.every((s) => s.status === "verified" || s.status === "skipped");

  let status: GuardedPlan["status"];
  if (planState.abandoned) status = "abandoned";
  else if (halted) status = "halted";
  else if (allSettled) status = "complete";
  else if (awaiting) status = "awaiting_verification";
  else if (planState.decisions.length) status = "active";
  else status = "draft";

  return {
    version: 1,
    episodeKey,
    contextKey,
    ...(progress.objective ? { objective: progress.objective } : {}),
    status,
    steps,
    ...(awaiting
      ? { currentStepFingerprint: awaiting.fingerprint }
      : current
        ? { currentStepFingerprint: current.fingerprint }
        : {}),
    warnings,
    degraded,
    generatedAt,
    ...(halted && haltReason ? { haltReason } : {}),
  };
}