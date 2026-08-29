/**
 * Phase 10 — human confirmation as a verifiable proof, not a boolean.
 *
 * A confirmation is minted ONLY by an operator action in the UI. It is:
 *   - bound to one plan fingerprint,
 *   - bound to the operator who gave it,
 *   - time-limited,
 *   - single use.
 *
 * No model output, plan text or tool result can produce one. `confirmed: true`
 * as a plain flag does not exist anywhere in the execution path.
 */

import { fingerprint } from "./fingerprint";
import type { ConfirmationProof, ExecConfirmationMode, ExecutionPlan } from "./execution-contract";

export const CONFIRMATION_TTL_MS = 5 * 60_000;

/** Phrase the operator must type for `typed` and `dual` confirmations. */
export function requiredPhrase(plan: ExecutionPlan): string {
  return `APPLY ${plan.capabilityId}`;
}

export interface MintRequest {
  plan: ExecutionPlan;
  operatorRef: string;
  secondOperatorRef?: string;
  typedPhrase?: string;
  now?: () => number;
}

export type MintResult =
  | { ok: true; proof: ConfirmationProof }
  | { ok: false; message: string };

export function mintConfirmation(req: MintRequest): MintResult {
  const { plan, operatorRef } = req;
  const now = (req.now ?? Date.now)();

  if (plan.confirmation === "blocked") {
    return { ok: false, message: "This operation is blocked and cannot be confirmed." };
  }
  if (!operatorRef) return { ok: false, message: "A signed-in operator is required." };

  if (plan.confirmation === "typed" || plan.confirmation === "dual") {
    if ((req.typedPhrase ?? "").trim() !== requiredPhrase(plan)) {
      return { ok: false, message: `Type “${requiredPhrase(plan)}” exactly to confirm.` };
    }
  }
  if (plan.confirmation === "dual") {
    if (!req.secondOperatorRef) {
      return { ok: false, message: "A second operator must also confirm this change." };
    }
    if (req.secondOperatorRef === operatorRef) {
      return { ok: false, message: "The second confirmation must come from a different operator." };
    }
  }

  const confirmedAt = new Date(now).toISOString();
  const proof: ConfirmationProof = {
    planFingerprint: plan.fingerprint,
    token: fingerprint([plan.fingerprint, operatorRef, req.secondOperatorRef ?? "", confirmedAt]),
    mode: plan.confirmation,
    operatorRef,
    ...(req.secondOperatorRef ? { secondOperatorRef: req.secondOperatorRef } : {}),
    ...(req.typedPhrase ? { typedPhrase: req.typedPhrase.trim() } : {}),
    confirmedAt,
    expiresAt: new Date(now + CONFIRMATION_TTL_MS).toISOString(),
  };
  return { ok: true, proof };
}

/* ------------------------------------------------------------------ */
/* Single-use enforcement                                              */
/* ------------------------------------------------------------------ */

const consumed = new Set<string>();

export function consumeConfirmation(proof: ConfirmationProof): boolean {
  if (consumed.has(proof.token)) return false;
  consumed.add(proof.token);
  return true;
}

/** Test seam. */
export function resetConfirmations(): void {
  consumed.clear();
}

export type ConfirmationCheck =
  | { ok: true }
  | { ok: false; failure: "confirmation_invalid" | "confirmation_expired"; message: string };

/**
 * Validate a proof against the plan it claims to authorise. Every branch here
 * is a refusal to execute — there is no "close enough".
 */
export function validateConfirmation(
  plan: ExecutionPlan,
  proof: ConfirmationProof | null | undefined,
  opts: { operatorRef: string; requiredMode?: ExecConfirmationMode; now?: () => number },
): ConfirmationCheck {
  const now = (opts.now ?? Date.now)();
  const required = opts.requiredMode ?? plan.confirmation;

  if (required === "blocked") {
    return { ok: false, failure: "confirmation_invalid", message: "This operation is blocked." };
  }
  if (!proof) {
    return { ok: false, failure: "confirmation_invalid", message: "This change needs your confirmation." };
  }
  if (proof.planFingerprint !== plan.fingerprint) {
    return {
      ok: false,
      failure: "confirmation_invalid",
      message: "The plan changed after it was confirmed. Review and confirm the new plan.",
    };
  }
  if (proof.mode !== required) {
    return {
      ok: false,
      failure: "confirmation_invalid",
      message: "The confirmation given is weaker than this change requires.",
    };
  }
  if (proof.operatorRef !== opts.operatorRef) {
    return {
      ok: false,
      failure: "confirmation_invalid",
      message: "The confirmation belongs to a different operator.",
    };
  }
  if (required === "dual" && (!proof.secondOperatorRef || proof.secondOperatorRef === proof.operatorRef)) {
    return {
      ok: false,
      failure: "confirmation_invalid",
      message: "A second, different operator must confirm this change.",
    };
  }
  if (Date.parse(proof.expiresAt) <= now) {
    return {
      ok: false,
      failure: "confirmation_expired",
      message: "That confirmation expired. Review the change and confirm again.",
    };
  }
  return { ok: true };
}
