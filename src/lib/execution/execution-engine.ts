/**
 * Phase 10 — the governed execution engine.
 *
 * ONE ordered lifecycle, no shortcuts:
 *
 *   resolve → precondition → authorize (Guardian, re-checked now)
 *           → confirm (bound, single-use proof) → reserve (idempotency)
 *           → conflict check (TOCTOU) → apply → verify → audit → recover
 *
 * Invariants:
 *   - AI never reaches this function without a `ConfirmationProof` minted by an
 *     operator. The autonomy ceiling stays PREPARE.
 *   - No production change happens before the reservation is granted.
 *   - "unknown" and "partial" are terminal, first-class outcomes. They are
 *     never reported as success, never auto-retried, and always carry a
 *     recovery recommendation the operator chooses to take.
 *   - Retry is only ever attempted for idempotent capabilities on retry-safe
 *     failure classes, within the capability's declared attempt ceiling.
 */

import { eventSpine } from "@/lib/core/event-spine";
import type { HubRole } from "@/lib/auth/authorization.functions";
import type { SourceHealthMap } from "@/lib/capability/capability-health";
import { getExecutableCapability } from "./executable-registry";
import { resolveLedgerActionType } from "./ledger-action-map";
import { authorizeExecution } from "./execution-guard";
import { consumeConfirmation, validateConfirmation } from "./confirmation";
import { getProvider } from "./execution-provider";
import type { LedgerPort } from "@/lib/core/action-executor";
import {
  RETRY_SAFE_FAILURES,
  type ConfirmationProof,
  type ExecFailureClass,
  type ExecPhase,
  type ExecRecovery,
  type ExecTargetState,
  type ExecutionEvent,
  type ExecutionPlan,
  type ExecutionReceipt,
} from "./execution-contract";

export interface ExecuteOptions {
  operatorRef: string;
  role: HubRole | null;
  confirmation: ConfirmationProof | null;
  /** Server-authoritative idempotency + audit. Injected for tests. */
  ledger: LedgerPort;
  /** Source-system health observed now; re-checked by the Guardian gate. */
  sourceHealth?: SourceHealthMap;
  now?: () => number;
}

/* ------------------------------------------------------------------ */

class Trace {
  readonly events: ExecutionEvent[] = [];
  constructor(private readonly now: () => number) {}
  add(phase: ExecPhase, outcome: ExecutionEvent["outcome"], note: string, attempt?: number): void {
    this.events.push({
      phase,
      outcome,
      note,
      at: new Date(this.now()).toISOString(),
      ...(attempt ? { attempt } : {}),
    });
  }
}

function recoveryFor(
  failureClass: ExecFailureClass | undefined,
  capabilityId: string,
): ExecRecovery {
  const cap = getExecutableCapability(capabilityId);
  switch (failureClass) {
    case "timeout_unknown_state":
    case "partial_effect":
      return {
        kind: "verify_manually",
        automatic: false,
        label: "Check the current state in the source system before trying again.",
      };
    case "verification_unavailable":
      return {
        kind: "verify_manually",
        automatic: false,
        label: "The change may have applied — confirm it directly before repeating it.",
      };
    case "verification_failed":
      return cap?.compensation
        ? { kind: "compensate", automatic: false, label: cap.compensation.label }
        : { kind: "escalate", automatic: false, label: "The result didn't match the intent — escalate it." };
    case "provider_unavailable":
      return { kind: "retry_safe", automatic: false, label: "Try again when the source system is reachable." };
    case "conflict_detected":
      return { kind: "verify_manually", automatic: false, label: "The target changed — review it and re-plan." };
    default:
      return { kind: "none", automatic: false, label: "" };
  }
}

function emit(plan: ExecutionPlan, type: Parameters<typeof eventSpine.emit>[0]["type"], extra: Record<string, unknown>): void {
  try {
    eventSpine.emit({
      type,
      source: "capability",
      ...(plan.target.accountId ? { accountId: plan.target.accountId } : {}),
      ...(plan.target.type === "ticket" ? { ticketId: plan.target.id } : {}),
      metadata: {
        capabilityId: plan.capabilityId,
        capabilityVersion: plan.capabilityVersion,
        correlationId: plan.correlationId,
        requestedBy: plan.requestedBy,
        risk: plan.riskClass,
        operation: plan.operationClass,
        ...extra,
      },
    });
  } catch {
    // Telemetry must never change an execution outcome.
  }
}

/* ------------------------------------------------------------------ */

export async function executePlan(
  plan: ExecutionPlan,
  opts: ExecuteOptions,
): Promise<ExecutionReceipt> {
  const now = opts.now ?? Date.now;
  const trace = new Trace(now);
  const startedAt = new Date(now()).toISOString();

  const base = {
    planId: plan.id,
    planFingerprint: plan.fingerprint,
    capabilityId: plan.capabilityId,
    capabilityVersion: plan.capabilityVersion,
    correlationId: plan.correlationId,
    operatorRef: opts.operatorRef,
    preState: plan.preState,
    startedAt,
  };

  const finish = (
    status: ExecutionReceipt["status"],
    message: string,
    extra: Partial<ExecutionReceipt> = {},
  ): ExecutionReceipt => {
    const failureClass = extra.failureClass;
    const receipt: ExecutionReceipt = {
      ...base,
      status,
      message,
      attempts: extra.attempts ?? 0,
      verification: extra.verification ?? { status: "not_attempted" },
      postState: extra.postState ?? null,
      recovery: extra.recovery ?? recoveryFor(failureClass, plan.capabilityId),
      events: trace.events,
      endedAt: new Date(now()).toISOString(),
      ledgerSynced: extra.ledgerSynced ?? false,
      ...(failureClass ? { failureClass } : {}),
      ...(extra.providerRef ? { providerRef: extra.providerRef } : {}),
    };
    emit(
      plan,
      status === "succeeded" ? "capability.completed" : status === "rejected" ? "capability.blocked" : "capability.failed",
      { status, ...(failureClass ? { reasonCode: failureClass } : {}) },
    );
    return receipt;
  };

  /* ---------------- resolve ---------------- */
  const contract = getExecutableCapability(plan.capabilityId);
  if (!contract) {
    trace.add("resolve", "blocked", "Capability is not on the executable allowlist.");
    return finish("rejected", `“${plan.capabilityId}” cannot be executed from this system.`, {
      failureClass: "authorization_denied",
    });
  }
  // Preflight: the capability must map to an action type the durable ledger
  // accepts. Fails CLOSED, before any confirmation proof is consumed.
  const mapping = resolveLedgerActionType(plan.capabilityId);
  if (!mapping.ok) {
    trace.add("resolve", "blocked", mapping.message);
    return finish("rejected", mapping.message, { failureClass: "authorization_denied" });
  }
  trace.add(
    "resolve",
    "ok",
    `${contract.name} resolved from the executable allowlist; audited as “${mapping.actionType}”.`,
  );

  /* ---------------- authorize (re-checked NOW) ---------------- */
  const verdict = authorizeExecution(plan, {
    operatorRef: opts.operatorRef,
    role: opts.role,
    ...(opts.sourceHealth ? { sourceHealth: opts.sourceHealth } : {}),
  });
  if (!verdict.allowed) {
    trace.add(verdict.failureClass === "precondition_failed" ? "precondition" : "authorize", "blocked", verdict.message);
    return finish("rejected", verdict.message, { failureClass: verdict.failureClass });
  }
  trace.add("authorize", "ok", "Governance re-checked at execution time.");

  /* ---------------- confirm ---------------- */
  const check = validateConfirmation(plan, opts.confirmation, {
    operatorRef: opts.operatorRef,
    requiredMode: contract.confirmation,
    now,
  });
  if (!check.ok) {
    trace.add("confirm", "blocked", check.message);
    return finish("rejected", check.message, { failureClass: check.failure });
  }
  if (!consumeConfirmation(opts.confirmation!)) {
    const msg = "That confirmation was already used. Confirm the change again if you still want it applied.";
    trace.add("confirm", "blocked", msg);
    return finish("rejected", msg, { failureClass: "confirmation_invalid" });
  }
  trace.add("confirm", "ok", `Operator confirmation accepted (${contract.confirmation}).`);

  /* ---------------- reserve (idempotency; server-authoritative) ------- */
  let claim: Awaited<ReturnType<LedgerPort["reserve"]>>;
  try {
    claim = await opts.ledger.reserve({
      actionId: plan.id,
      idempotencyKey: plan.idempotencyKey,
      actionType: mapping.actionType,
      origin: plan.requestedBy,
      entityType: plan.target.type,
      entityId: plan.target.id,
      proposalId: plan.fingerprint,
    });
  } catch {
    const msg = "The audit ledger couldn't be reached, so nothing was applied.";
    trace.add("reserve", "failed", msg);
    return finish("failed", msg, { failureClass: "provider_unavailable" });
  }

  if (claim.outcome === "duplicate_success") {
    trace.add("reserve", "blocked", "This exact change was already applied.");
    return finish("succeeded", "This change was already applied — nothing was repeated.", {
      failureClass: "duplicate_suppressed",
      verification: { status: "verified", authority: contract.verification.authority, note: "Prior proven execution." },
      ledgerSynced: true,
    });
  }
  if (claim.outcome === "in_flight") {
    const msg = "This change is already being applied. Give it a moment before retrying.";
    trace.add("reserve", "blocked", msg);
    return finish("rejected", msg, { failureClass: "duplicate_suppressed" });
  }
  if (claim.outcome === "uncertain") {
    const msg =
      "A previous attempt didn't finish recording, so it isn't clear whether it applied. Verify the current state before applying again.";
    trace.add("reserve", "unknown", msg);
    return finish("uncertain", msg, { failureClass: "timeout_unknown_state" });
  }
  trace.add("reserve", "ok", "Idempotency key reserved.");

  /* ---------------- provider ---------------- */
  const provider = getProvider(plan.capabilityId);
  if (!provider) {
    const msg = "No execution adapter is wired for this capability, so nothing was applied.";
    trace.add("apply", "blocked", msg);
    await safeFinalize(opts.ledger, plan, "failed", msg);
    return finish("failed", msg, { failureClass: "provider_unavailable", ledgerSynced: true });
  }

  /* ---------------- conflict check (TOCTOU) ---------------- */
  let liveState: ExecTargetState | null = null;
  try {
    liveState = await provider.readState(plan);
  } catch {
    liveState = null;
  }
  if (plan.preState && liveState && liveState.fingerprint !== plan.preState.fingerprint) {
    const msg = "The target changed after this plan was reviewed, so it was not applied.";
    trace.add("conflict_check", "blocked", msg);
    await safeFinalize(opts.ledger, plan, "failed", msg);
    return finish("rejected", msg, { failureClass: "conflict_detected", ledgerSynced: true });
  }
  if (plan.preState && !liveState) {
    const msg = "The target's current state couldn't be read, so the change was not applied.";
    trace.add("conflict_check", "unknown", msg);
    await safeFinalize(opts.ledger, plan, "failed", msg);
    return finish("failed", msg, { failureClass: "provider_unavailable", ledgerSynced: true });
  }
  trace.add("conflict_check", "ok", "Target state matches what was reviewed.");

  /* ---------------- apply (bounded, honest retries) ---------------- */
  emit(plan, "capability.invoked", { status: "executing" });
  const maxAttempts = contract.idempotency.supported ? Math.max(1, contract.maxAttempts) : 1;
  let attempts = 0;
  let outcome: Awaited<ReturnType<typeof provider.apply>> | null = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      outcome = await provider.apply(plan);
    } catch {
      // A thrown adapter error tells us nothing about the target's state.
      outcome = { status: "unknown", note: "The adapter failed before reporting an outcome." };
    }
    const retryable =
      outcome.status === "unavailable" &&
      contract.idempotency.supported &&
      RETRY_SAFE_FAILURES.includes("provider_unavailable") &&
      attempts < maxAttempts;
    trace.add("apply", outcome.status === "applied" ? "ok" : outcome.status === "unknown" ? "unknown" : "failed", outcome.note ?? outcome.status, attempts);
    if (!retryable) break;
  }

  const applied = outcome!;

  if (applied.status === "rejected") {
    await safeFinalize(opts.ledger, plan, "failed", applied.note);
    return finish("failed", applied.note, { failureClass: "provider_rejected", attempts, ledgerSynced: true });
  }
  if (applied.status === "unavailable") {
    await safeFinalize(opts.ledger, plan, "failed", applied.note);
    return finish("failed", applied.note, { failureClass: "provider_unavailable", attempts, ledgerSynced: true });
  }
  if (applied.status === "unknown") {
    // Deliberately NOT retried and NOT reported either way.
    await safeFinalize(opts.ledger, plan, "failed", applied.note);
    return finish(
      "uncertain",
      "The change may or may not have applied — the source system didn't give a clear answer.",
      { failureClass: "timeout_unknown_state", attempts, ledgerSynced: true },
    );
  }
  if (applied.status === "partial") {
    const msg = `Only part of this change landed. Applied: ${applied.appliedEffects.join(", ") || "none"}. Missing: ${applied.missingEffects.join(", ") || "unknown"}.`;
    trace.add("apply", "failed", msg, attempts);
    await safeFinalize(opts.ledger, plan, "failed", msg);
    return finish("uncertain", msg, { failureClass: "partial_effect", attempts, ledgerSynced: true });
  }

  /* ---------------- verify (separate authority) ---------------- */
  let postState: ExecTargetState | null = null;
  try {
    postState = await provider.readState(plan);
  } catch {
    postState = null;
  }

  let verification: ExecutionReceipt["verification"] = {
    status: "not_required",
    authority: contract.verification.authority,
  };
  if (contract.verification.required) {
    let result: "verified" | "failed" | "unavailable";
    try {
      result = await provider.verify(plan, postState);
    } catch {
      result = "unavailable";
    }
    verification = {
      status: result === "verified" ? "verified" : result === "failed" ? "failed" : "unavailable",
      authority: contract.verification.authority,
      note: contract.verification.label,
    };
    trace.add("verify", result === "verified" ? "ok" : result === "failed" ? "failed" : "unknown", contract.verification.label);

    if (result === "failed") {
      await safeFinalize(opts.ledger, plan, "failed", "Verification did not match the intended change.");
      emit(plan, "capability.verified", { verificationStatus: "failed" });
      return finish(
        "compensation_available",
        "The change was submitted but the check afterwards didn't match what was intended.",
        { failureClass: "verification_failed", attempts, postState, verification, ledgerSynced: true },
      );
    }
    if (result === "unavailable") {
      // The effect happened, but the ledger row must not read as a clean
      // success: the note keeps EXECUTED and VERIFIED distinguishable in audit.
      await safeFinalize(
        opts.ledger,
        plan,
        "success",
        "executed; verification unavailable — manual check required",
      );
      emit(plan, "capability.verification_pending", { verificationStatus: "unknown" });
      return finish(
        "uncertain",
        "The change was submitted, but it couldn't be independently confirmed yet.",
        { failureClass: "verification_unavailable", attempts, postState, verification, ledgerSynced: true },
      );
    }
    emit(plan, "capability.verified", { verificationStatus: "verified" });
  } else {
    trace.add("verify", "ok", "No independent verification required for this capability.");
  }

  /* ---------------- audit ---------------- */
  const ledgerSynced = await safeFinalize(opts.ledger, plan, "success", "");
  trace.add("audit", ledgerSynced ? "ok" : "failed", ledgerSynced ? "Recorded in the action ledger." : "Applied, but the audit record couldn't be saved.");

  return finish(
    "succeeded",
    ledgerSynced
      ? `${contract.effectSummary} Applied and confirmed.`
      : `${contract.effectSummary} Applied, but the audit record couldn't be saved.`,
    {
      attempts,
      postState,
      verification,
      ledgerSynced,
      ...(applied.providerRef ? { providerRef: applied.providerRef } : {}),
    },
  );
}

/** Finalize never throws: an audit failure must not fabricate a second effect. */
async function safeFinalize(
  ledger: LedgerPort,
  plan: ExecutionPlan,
  status: "success" | "failed",
  error: string,
): Promise<boolean> {
  try {
    await ledger.finalize({
      idempotencyKey: plan.idempotencyKey,
      status,
      entityType: plan.target.type,
      entityId: plan.target.id,
      ...(error ? { error: error.slice(0, 300) } : {}),
    });
    return true;
  } catch {
    return false;
  }
}
