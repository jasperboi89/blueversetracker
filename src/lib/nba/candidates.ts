/**
 * Phase 14 — candidate generation.
 *
 * Generate broadly, recommend narrowly. Nothing here decides what the operator
 * sees: every candidate leaves this module in state "candidate" and must clear
 * the deterministic Recommendation Gate afterwards.
 */

import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import type { EvidenceEntityRef } from "@/lib/core/evidence-contract";
import {
  actionFingerprint,
  type NbaReasonCode,
  type NbaRisk,
  type NbaSource,
  type NextBestAction,
  type NextBestActionKind,
  type SafeActionProposal,
  type WorkEpisodeSignals,
} from "./nba-contract";
import type { WorkProgressState } from "./work-progress";

export interface CandidateInput {
  envelope: PortalContextEnvelope;
  progress: WorkProgressState;
  episode: WorkEpisodeSignals;
  generatedAt: string;
}

interface DraftCandidate {
  kind: NextBestActionKind;
  title: string;
  explanation: string;
  subject: string;
  qualifier?: string;
  target?: EvidenceEntityRef;
  source: NbaSource;
  reasonCodes: NbaReasonCode[];
  risk: NbaRisk;
  evidenceConfidence: "verified" | "probable" | "unknown";
  evidenceRefs?: string[];
  knowledgeRefs?: string[];
  memoryRefs?: string[];
  whatWouldChangeThis: string[];
  missingEvidence?: NextBestAction["missingEvidence"];
  prerequisiteChecks?: NextBestAction["prerequisiteChecks"];
  proposedSafeAction?: SafeActionProposal;
  fingerprint?: string;
}

function toAction(d: DraftCandidate, generatedAt: string): NextBestAction {
  const fingerprint = d.fingerprint ?? actionFingerprint(d.kind, d.subject, d.qualifier);
  return {
    id: `nba:${fingerprint}`,
    fingerprint,
    kind: d.kind,
    title: d.title,
    explanation: d.explanation,
    target: d.target,
    state: "candidate",
    confidence: "low",
    evidenceConfidence: d.evidenceConfidence,
    evidenceRefs: d.evidenceRefs ?? [],
    knowledgeRefs: d.knowledgeRefs,
    memoryRefs: d.memoryRefs,
    prerequisiteChecks: d.prerequisiteChecks ?? [],
    blockers: [],
    missingEvidence: d.missingEvidence ?? [],
    risk: d.risk,
    source: d.source,
    reasonCodes: d.reasonCodes,
    score: 0,
    contributions: [],
    whatWouldChangeThis: d.whatWouldChangeThis,
    generatedAt,
  };
}

function activeTarget(env: PortalContextEnvelope): EvidenceEntityRef | undefined {
  const a = env.active;
  if (a.ticket) return { type: "ticket", id: a.ticket.id, label: a.ticket.label };
  if (a.dispatch) return { type: "dispatch", id: a.dispatch.id };
  if (a.workItem) return { type: "additional_work", id: a.workItem.id, label: a.workItem.title };
  if (a.account) return { type: "account", id: a.account.id, label: a.account.name };
  return undefined;
}

export function generateCandidates(input: CandidateInput): NextBestAction[] {
  const { envelope: env, progress, generatedAt } = input;
  const drafts: DraftCandidate[] = [];
  const target = activeTarget(env);
  const accountMatch: NbaReasonCode[] = env.active.account ? ["CURRENT_ACCOUNT_MATCH"] : [];

  /* ---- Deterministic: unresolved conflicts outrank everything ---- */
  for (const c of (env.evidenceConflicts ?? []).filter((x) => x.status === "unresolved")) {
    drafts.push({
      kind: "VERIFY",
      title: `Verify the authoritative ${c.predicate.replace(/_/g, " ")}`,
      explanation:
        "Two sources disagree on this value. Confirm the current authoritative state before following either one.",
      subject: `${c.subject.type}_${c.subject.id}_${c.predicate}`,
      target: c.subject,
      source: "deterministic",
      reasonCodes: ["CONFLICT_REQUIRES_VERIFICATION", "LOW_RISK_INFORMATION_GAIN", ...accountMatch],
      risk: "LOW",
      evidenceConfidence: "unknown",
      evidenceRefs: c.factIds,
      missingEvidence: [
        { id: `missing:${c.id}`, label: `Authoritative ${c.predicate}`, predicate: c.predicate, subject: c.subject },
      ],
      whatWouldChangeThis: [
        "the authoritative value is confirmed",
        "one of the conflicting sources is superseded",
      ],
    });
  }

  /* ---- Deterministic: recorded blockers ---- */
  for (const b of progress.activeBlockers) {
    drafts.push({
      kind: "REVIEW",
      title: `Clear the blocker: ${b.label}`,
      explanation: "Work cannot move forward while this blocker stands, so it may be the real next step.",
      subject: `blocker_${b.id}`,
      target: b.entityId ? ({ type: "ticket", id: b.entityId } as EvidenceEntityRef) : target,
      source: "deterministic",
      reasonCodes: ["UNRESOLVED_BLOCKER", "LOW_RISK_INFORMATION_GAIN"],
      risk: "LOW",
      evidenceConfidence: "verified",
      whatWouldChangeThis: ["the blocker is resolved", "the blocker is reassigned to another entity"],
    });
  }

  /* ---- Knowledge / resolution procedures: remaining verification steps ---- */
  for (const proc of progress.procedures) {
    const remaining = proc.steps.filter((s) => s.status === "remaining");
    const first = remaining[0];
    if (!first) continue;
    const reasonCodes: NbaReasonCode[] = [
      "MISSING_REQUIRED_CHECK",
      ...(proc.confidence === "verified" ? (["VERIFIED_PROCEDURE_STEP"] as NbaReasonCode[]) : []),
      ...(proc.stale ? (["STALE_GUIDANCE"] as NbaReasonCode[]) : []),
      ...(proc.sourceType === "resolution" ? (["RELATED_RESOLUTION"] as NbaReasonCode[]) : []),
      ...(first.verification ? (["LOW_RISK_INFORMATION_GAIN"] as NbaReasonCode[]) : []),
      ...accountMatch,
    ];
    // A skipped earlier step is divergence, surfaced neutrally.
    if (proc.steps.some((s, i) => i < first.index && s.status === "remaining" && s.index !== first.index)) {
      reasonCodes.push("PROCEDURE_DIVERGENCE");
    }
    drafts.push({
      kind: first.verification ? "VERIFY" : "PREPARE_ACTION",
      title: first.label,
      explanation: proc.stale
        ? `${proc.title ?? proc.sourceId} suggests this step, but the guidance has not been verified recently — check current state first.`
        : `${proc.title ?? proc.sourceId} defines this step and this work session has not established it yet.`,
      subject: first.label,
      fingerprint: first.fingerprint,
      target,
      source: proc.sourceType === "resolution" ? "memory" : "knowledge",
      reasonCodes,
      risk: first.verification ? "LOW" : "HIGH",
      evidenceConfidence: proc.confidence,
      evidenceRefs: [`${proc.sourceType}:${proc.sourceId}`],
      knowledgeRefs: proc.sourceType === "knowledge" ? [proc.sourceId] : undefined,
      missingEvidence: first.verification ? [{ id: `missing:${first.fingerprint}`, label: first.label }] : [],
      whatWouldChangeThis: [
        "this check is completed",
        "the guidance is superseded or updated",
        "a new blocker appears",
      ],
    });
  }

  /* ---- Resolution memory: verify the condition, never reapply the fix ---- */
  for (const r of env.evidence.filter((e) => e.sourceType === "resolution").slice(0, 3)) {
    drafts.push({
      kind: "COMPARE",
      title: `Check whether the condition behind ${r.title ?? r.sourceId} exists here`,
      explanation:
        "A prior verified resolution looks similar. Similarity is not diagnosis — verify whether the same condition is present before acting on it.",
      subject: `resolution_${r.sourceId}`,
      target,
      source: "memory",
      reasonCodes: ["RELATED_RESOLUTION", "LOW_RISK_INFORMATION_GAIN", ...accountMatch],
      risk: "LOW",
      evidenceConfidence: r.confidence ?? "probable",
      evidenceRefs: [`resolution:${r.sourceId}`],
      whatWouldChangeThis: ["the condition is confirmed present or absent", "a different cause is verified"],
    });
  }

  /* ---- Operational memory: weak, exploratory checks only ---- */
  for (const m of (env.memory ?? []).slice(0, 2)) {
    drafts.push({
      kind: "CHECK",
      title: `Consider checking: ${m.title}`,
      explanation:
        "Prior experience on similar work. Current evidence does not establish that it applies here.",
      subject: `memory_${m.id}`,
      target,
      source: "pattern",
      reasonCodes: ["OPERATIONAL_MEMORY_PATTERN", "SIMILAR_PRIOR_WORK"],
      risk: "LOW",
      evidenceConfidence: "unknown",
      memoryRefs: [m.id],
      whatWouldChangeThis: ["current evidence supports or rules this out"],
    });
  }

  /* ---- Similar prior work ---- */
  for (const s of env.evidence.filter((e) => e.sourceType === "similar_work").slice(0, 2)) {
    drafts.push({
      kind: "LOOK_UP",
      title: `Review similar prior work ${s.sourceId}`,
      explanation: "A previous work record resembles this one and may suggest an investigation direction.",
      subject: `similar_${s.sourceId}`,
      target,
      source: "pattern",
      reasonCodes: ["SIMILAR_PRIOR_WORK", "LOW_RISK_INFORMATION_GAIN"],
      risk: "LOW",
      evidenceConfidence: s.confidence ?? "unknown",
      evidenceRefs: [`similar_work:${s.sourceId}`],
      whatWouldChangeThis: ["the current cause is verified"],
    });
  }

  /* ---- Resumed unresolved episode ---- */
  if (input.episode.resumed) {
    drafts.push({
      kind: "RESUME",
      title: "Re-verify what changed since this work was last touched",
      explanation:
        "This work carries over from an earlier, unresolved episode. Anything established previously may have changed.",
      subject: `resume_${input.episode.episodeKey}`,
      target,
      source: "deterministic",
      reasonCodes: ["RESUMED_UNRESOLVED_EPISODE", "LOW_RISK_INFORMATION_GAIN"],
      risk: "LOW",
      evidenceConfidence: "probable",
      whatWouldChangeThis: ["current state is re-verified"],
    });
  }

  /* ---- Unsaved work: documenting is a real next step ---- */
  if (env.workState.unsavedChanges) {
    drafts.push({
      kind: "DOCUMENT",
      title: "Save the work in progress before moving on",
      explanation: "There are unsaved changes on this screen.",
      subject: `unsaved_${env.workState.unsavedEntities.join("_") || "work"}`,
      target,
      source: "deterministic",
      reasonCodes: ["UNSAVED_WORK"],
      risk: "LOW",
      evidenceConfidence: "verified",
      whatWouldChangeThis: ["the changes are saved or discarded"],
    });
  }

  /* ---- Critical awareness conditions ---- */
  for (const a of env.awareness.filter((x) => x.severity === "critical").slice(0, 2)) {
    drafts.push({
      kind: "REVIEW",
      title: a.message,
      explanation: "Awareness raised a critical operational condition.",
      subject: `awareness_${a.id}`,
      target,
      source: "deterministic",
      reasonCodes: ["AWARENESS_CONDITION", "LOW_RISK_INFORMATION_GAIN"],
      risk: "LOW",
      evidenceConfidence: "verified",
      whatWouldChangeThis: ["the condition clears"],
    });
  }

  /* ---- Follow-up capture is the one write we may PREPARE ---- */
  if (progress.remainingChecks.length > 1 && env.active.ticket) {
    const label = `Follow up on ${progress.remainingChecks[1].label}`.slice(0, 120);
    drafts.push({
      kind: "PREPARE_ACTION",
      title: "Add the remaining check to the Night Plan",
      explanation: "Captures the outstanding verification so it survives the shift. Requires your confirmation.",
      subject: `night_plan_${progress.remainingChecks[1].fingerprint}`,
      target,
      source: "deterministic",
      reasonCodes: ["MISSING_REQUIRED_CHECK"],
      risk: "MEDIUM",
      evidenceConfidence: "verified",
      proposedSafeAction: {
        type: "add_night_plan_item",
        payload: { task: label, priority: "normal" },
        reason: "Outstanding verification step from the current work.",
        requiresConfirmation: true,
      },
      whatWouldChangeThis: ["the check is completed", "the ticket is closed"],
    });
  }

  // De-duplicate by fingerprint, keeping the first (highest-priority) draft.
  const seen = new Set<string>();
  const out: NextBestAction[] = [];
  for (const d of drafts) {
    const action = toAction(d, generatedAt);
    if (seen.has(action.fingerprint)) continue;
    seen.add(action.fingerprint);
    out.push(action);
  }
  return out;
}