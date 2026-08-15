/**
 * Phase 15 — verification loops.
 *
 * A step is never "done because we ran it". It is done when either
 *   (a) an authoritative fact that is safe for operational guidance shows the
 *       expected condition, or
 *   (b) the operator explicitly confirms it.
 *
 * Anything else stays UNVERIFIED, and an unverified step never unlocks the
 * next one.
 */

import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import { isSafeForOperationalGuidance } from "@/lib/core/evidence-contract";
import type { EvidenceEntityRef } from "@/lib/core/evidence-contract";
import type {
  PlanStepDecision,
  VerificationMethod,
  VerificationRequirement,
} from "./plan-contract";

export type VerificationResult = "verified" | "failed" | "unverified";

export interface VerificationOutcome {
  result: VerificationResult;
  by?: "operator" | "evidence";
  at?: string;
  /** Fact ids that supported an evidence-backed verification. */
  evidenceRefs: string[];
  /** Operator-facing explanation of what is still needed. */
  stillNeeded?: string;
}

const VERIFY_HINT = /\b(verify|check|confirm|review|compare|inspect|look\s?up|validate|ensure)\b/i;

/**
 * Derive how a step could be verified. Evidence-backed verification is only
 * claimed when the envelope actually carries facts about the subject — we
 * never promise a check the portal cannot perform.
 */
export function requirementFor(input: {
  fingerprint: string;
  label: string;
  mutating: boolean;
  subject?: EvidenceEntityRef;
  envelope: PortalContextEnvelope;
}): VerificationRequirement {
  const facts = input.envelope.facts ?? [];
  const subjectFacts = input.subject
    ? facts.filter((f) => f.subject.type === input.subject!.type && f.subject.id === input.subject!.id)
    : [];
  const method: VerificationMethod = subjectFacts.length
    ? "evidence_fact"
    : facts.length || input.envelope.evidence.length
      ? "operator_confirmation"
      : "none_available";

  const label = input.mutating
    ? `Confirm the change took effect: ${input.label}`
    : VERIFY_HINT.test(input.label)
      ? `Record the result of: ${input.label}`
      : `Confirm: ${input.label}`;

  return {
    id: `verify:${input.fingerprint}`,
    label,
    method,
    ...(input.subject ? { subject: input.subject } : {}),
  };
}

/**
 * Evaluate one step's verification state. Operator decisions win over
 * inference; absence of evidence is never treated as success.
 */
export function evaluateVerification(input: {
  requirement: VerificationRequirement;
  envelope: PortalContextEnvelope;
  decision?: PlanStepDecision;
  now?: number;
}): VerificationOutcome {
  const now = input.now ?? Date.now();
  const d = input.decision;

  if (d?.kind === "failed") {
    return { result: "failed", by: d.by, at: d.at, evidenceRefs: [] };
  }
  if (d?.kind === "verified") {
    return { result: "verified", by: d.by, at: d.at, evidenceRefs: [] };
  }

  if (input.requirement.method === "evidence_fact" && input.requirement.subject) {
    const subject = input.requirement.subject;
    const supporting = (input.envelope.facts ?? []).filter(
      (f) =>
        f.subject.type === subject.type &&
        f.subject.id === subject.id &&
        (!input.requirement.predicate || f.predicate === input.requirement.predicate) &&
        isSafeForOperationalGuidance(f, { now }),
    );
    if (input.requirement.predicate && supporting.length) {
      return {
        result: "verified",
        by: "evidence",
        at: new Date(now).toISOString(),
        evidenceRefs: supporting.map((f) => f.id).slice(0, 5),
      };
    }
  }

  return {
    result: "unverified",
    evidenceRefs: [],
    stillNeeded:
      input.requirement.method === "none_available"
        ? "No source can confirm this automatically — confirm it yourself before moving on."
        : input.requirement.label,
  };
}