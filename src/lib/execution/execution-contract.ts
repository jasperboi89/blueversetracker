/**
 * ACCOUNT COMMAND CENTER — Phase 10: Governed Agentic Operations.
 *
 * The canonical contract for EXECUTABLE capability work.
 *
 * Non-negotiables encoded here (they are types, not prose):
 *   - Autonomy ceiling stays PREPARE. Nothing in this module lets a model
 *     decide to execute: execution requires a `ConfirmationProof` that can
 *     only be minted by an operator action.
 *   - An execution plan is IMMUTABLE. It is fingerprinted, and the fingerprint
 *     binds the confirmation. Change anything → new plan → new confirmation.
 *   - Failure is CLASSIFIED, never flattened to "error". "Unknown" is a
 *     first-class outcome and is never reported as success or as failure.
 *   - Verification is separate from execution. A provider saying "applied" is
 *     a claim, not proof.
 */

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/** What the operation does to the world. Drives confirmation + recovery. */
export type ExecOperationClass =
  | "read"
  | "prepare"
  | "reversible_write"
  | "irreversible_write"
  | "external_side_effect";

export type ExecRiskClass = "low" | "medium" | "high" | "critical";

/** Can the effect be undone, and by what means? */
export type ExecReversibility = "reversible" | "compensable" | "irreversible";

/** How strongly the operator must confirm. `blocked` = never executable here. */
export type ExecConfirmationMode = "none" | "single" | "typed" | "dual" | "blocked";

export const EXEC_MUTATING_CLASSES: ExecOperationClass[] = [
  "reversible_write",
  "irreversible_write",
  "external_side_effect",
];

export function isExecMutating(op: ExecOperationClass): boolean {
  return EXEC_MUTATING_CLASSES.includes(op);
}

/**
 * Minimum confirmation an operation class + risk class may ever carry. A
 * capability may declare something STRONGER, never weaker — `resolveConfirmation`
 * enforces that.
 */
export function minimumConfirmation(
  op: ExecOperationClass,
  risk: ExecRiskClass,
): ExecConfirmationMode {
  if (!isExecMutating(op)) return "none";
  if (risk === "critical") return "dual";
  if (op === "irreversible_write" || op === "external_side_effect") return "typed";
  return risk === "high" ? "typed" : "single";
}

const CONFIRMATION_STRENGTH: Record<ExecConfirmationMode, number> = {
  blocked: 0,
  none: 1,
  single: 2,
  typed: 3,
  dual: 4,
};

/** Declared policy, floored by the class minimum. Blocked always wins. */
export function resolveConfirmation(
  declared: ExecConfirmationMode,
  op: ExecOperationClass,
  risk: ExecRiskClass,
): ExecConfirmationMode {
  if (declared === "blocked") return "blocked";
  const floor = minimumConfirmation(op, risk);
  return CONFIRMATION_STRENGTH[declared] >= CONFIRMATION_STRENGTH[floor] ? declared : floor;
}

/* ------------------------------------------------------------------ */
/* Executable capability contract                                      */
/* ------------------------------------------------------------------ */

export interface ExecPrecondition {
  id: string;
  label: string;
  /** Operator-facing reason shown when it is not satisfied. */
  unmetNote: string;
}

export interface ExecVerificationPolicy {
  required: boolean;
  /** Who is allowed to say the change is real. Never the executor itself. */
  authority: "provider" | "database" | "operator";
  label: string;
}

export interface ExecCompensation {
  /** Compensation is always operator-initiated. There is no auto-rollback. */
  automatic: false;
  label: string;
  /** Executable capability that would undo it, when one exists. */
  capabilityId?: string;
}

export interface ExecutableCapability {
  capabilityId: string;
  version: number;
  name: string;
  operationClass: ExecOperationClass;
  riskClass: ExecRiskClass;
  reversibility: ExecReversibility;
  confirmation: ExecConfirmationMode;
  /** Human-readable statement of what changes. Shown before confirmation. */
  effectSummary: string;
  idempotency: { supported: boolean; strategy: "provider_key" | "fingerprint" | "none" };
  preconditions: ExecPrecondition[];
  verification: ExecVerificationPolicy;
  compensation?: ExecCompensation;
  /** Retry ceiling. Only ever consumed for idempotent, retry-safe failures. */
  maxAttempts: number;
  /** Test-only capability: hidden from operator surfaces. */
  fixtureOnly?: boolean;
}

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

export interface ExecTargetRef {
  type: string;
  id: string;
  accountId?: string;
}

/**
 * A cheap, comparable snapshot of the target's execution-relevant state,
 * captured at plan time and re-read immediately before apply. Its only job is
 * TOCTOU detection — it is never treated as evidence.
 */
export interface ExecTargetState {
  fingerprint: string;
  observedAt: string;
  /** Small, non-sensitive labels only. */
  summary?: Record<string, string | number | boolean | null>;
}

export type ExecPlanStatus =
  | "planned"
  | "awaiting_confirmation"
  | "authorized"
  | "executing"
  | "verifying"
  | "succeeded"
  | "failed"
  | "uncertain"
  | "rejected"
  | "compensation_available"
  | "compensated";

export interface ExecutionPlan {
  readonly id: string;
  readonly fingerprint: string;
  readonly capabilityId: string;
  readonly capabilityVersion: number;
  readonly operationClass: ExecOperationClass;
  readonly riskClass: ExecRiskClass;
  readonly confirmation: ExecConfirmationMode;
  readonly effectSummary: string;
  readonly target: ExecTargetRef;
  readonly input: Readonly<Record<string, unknown>>;
  readonly preState: ExecTargetState | null;
  readonly unmetPreconditions: readonly string[];
  readonly requestedBy: "operator" | "copilot" | "nba" | "guarded_plan" | "system";
  readonly correlationId: string;
  readonly contextRef: string;
  readonly createdAt: string;
  readonly idempotencyKey: string;
}

/* ------------------------------------------------------------------ */
/* Confirmation                                                        */
/* ------------------------------------------------------------------ */

export interface ConfirmationProof {
  /** Binds the proof to exactly one plan. */
  planFingerprint: string;
  token: string;
  mode: ExecConfirmationMode;
  operatorRef: string;
  /** For `dual`, the second distinct operator. */
  secondOperatorRef?: string;
  /** For `typed`, the phrase the operator actually typed. */
  typedPhrase?: string;
  confirmedAt: string;
  expiresAt: string;
}

/* ------------------------------------------------------------------ */
/* Outcomes                                                            */
/* ------------------------------------------------------------------ */

export type ExecFailureClass =
  | "execution_disabled"
  | "precondition_failed"
  | "authorization_denied"
  | "confirmation_invalid"
  | "confirmation_expired"
  | "plan_mismatch"
  | "conflict_detected"
  | "duplicate_suppressed"
  | "provider_unavailable"
  | "provider_rejected"
  | "timeout_unknown_state"
  | "partial_effect"
  | "verification_failed"
  | "verification_unavailable"
  | "internal_error";

/** Retry is only ever safe for these, and only for idempotent capabilities. */
export const RETRY_SAFE_FAILURES: ExecFailureClass[] = ["provider_unavailable"];

export type ExecPhase =
  | "resolve"
  | "precondition"
  | "authorize"
  | "confirm"
  | "reserve"
  | "conflict_check"
  | "apply"
  | "verify"
  | "audit"
  | "recover";

export interface ExecutionEvent {
  phase: ExecPhase;
  at: string;
  outcome: "ok" | "blocked" | "failed" | "unknown";
  note: string;
  attempt?: number;
}

export type ExecRecoveryKind =
  | "none"
  | "verify_manually"
  | "retry_safe"
  | "compensate"
  | "escalate";

export interface ExecRecovery {
  kind: ExecRecoveryKind;
  label: string;
  /** Recovery is proposed to the operator. It never runs itself. */
  automatic: false;
}

export interface ExecutionReceipt {
  planId: string;
  planFingerprint: string;
  capabilityId: string;
  capabilityVersion: number;
  status: ExecPlanStatus;
  /** Present for every non-success terminal outcome. */
  failureClass?: ExecFailureClass;
  /** Operator-facing, non-causal, never a raw provider dump. */
  message: string;
  attempts: number;
  providerRef?: string;
  verification: {
    status: "not_required" | "verified" | "failed" | "unavailable" | "not_attempted";
    authority?: ExecVerificationPolicy["authority"];
    note?: string;
  };
  preState: ExecTargetState | null;
  postState: ExecTargetState | null;
  recovery: ExecRecovery;
  events: ExecutionEvent[];
  startedAt: string;
  endedAt: string;
  correlationId: string;
  operatorRef: string;
  ledgerSynced: boolean;
}

/** Terminal statuses that mean "no production change was made". */
export const NO_EFFECT_STATUSES: ExecPlanStatus[] = ["rejected", "planned", "awaiting_confirmation"];

export function isTerminal(status: ExecPlanStatus): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "uncertain" ||
    status === "rejected" ||
    status === "compensated" ||
    status === "compensation_available"
  );
}
