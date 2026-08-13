/**
 * Safe Action Executor.
 *
 * Copilot → proposal → operator Apply → executor → validate → idempotency →
 * execute → durable ledger record → (store emits the Event Spine event) → UI.
 *
 * Server/client boundary: the mutations themselves land in local/cloud-synced
 * operator stores that already own their Event Spine emission, so the executor
 * does not rewrite them into server-native writes. Authentication, the
 * idempotency claim, and the durable audit record are all server-side; a
 * mutation only runs after the server has granted the idempotency key.
 */
import { getActionHandler } from "./action-handlers";
import { blockers } from "./blockers";
import {
  isActionType,
  sanitizeSnapshot,
  type ActionExecutionResult,
  type AnyProposedAction,
  type LedgerSnapshot,
} from "./actions";

export type ReserveOutcome =
  /** This caller owns the execution. */
  | "reserved"
  /** Prior attempt failed cleanly; the key was handed back for a safe retry. */
  | "retry"
  /** Prior attempt is proven to have succeeded. */
  | "duplicate_success"
  /** Another attempt holds a live lease right now. */
  | "in_flight"
  /** The ledger cannot prove whether the mutation ran. */
  | "uncertain";

export interface LedgerPort {
  reserve: (input: {
    actionId: string;
    idempotencyKey: string;
    actionType: string;
    origin: string;
    entityType?: string;
    entityId?: string;
    proposalId?: string;
  }) => Promise<{ outcome: ReserveOutcome; priorStatus: string | null }>;
  finalize: (input: {
    idempotencyKey: string;
    status: "success" | "failed";
    before?: LedgerSnapshot;
    after?: LedgerSnapshot;
    entityType?: string;
    entityId?: string;
    error?: string;
  }) => Promise<unknown>;
}

export interface ExecutionContext {
  /** Human confirmed this action in the UI. */
  confirmed: boolean;
  ledger?: LedgerPort;
}

let defaultLedger: LedgerPort | null = null;

async function serverLedger(): Promise<LedgerPort> {
  if (defaultLedger) return defaultLedger;
  const fns = await import("./action-ledger.functions");
  defaultLedger = {
    reserve: (input) => fns.reserveAction({ data: input }),
    finalize: (input) =>
      fns.finalizeAction({
        data: {
          idempotencyKey: input.idempotencyKey,
          status: input.status,
          before: input.before ?? null,
          after: input.after ?? null,
          ...(input.entityType ? { entityType: input.entityType } : {}),
          ...(input.entityId ? { entityId: input.entityId } : {}),
          ...(input.error ? { error: input.error } : {}),
        },
      }),
  };
  return defaultLedger;
}

/** Test seam. */
export function setLedgerPort(port: LedgerPort | null): void {
  defaultLedger = port;
}

function rejected(actionId: string, message: string): ActionExecutionResult {
  return { actionId, status: "rejected", message };
}

/**
 * Deterministic exit for an uncertain action: the operator (or a proven
 * ledger outcome) has established what actually happened. Never auto-retries.
 */
export function resolveActionUncertainty(actionId: string): void {
  blockers.resolve({
    type: "action_uncertain",
    entity: { type: "action", id: actionId },
    reasonCode: "ACTION_OUTCOME_VERIFIED",
    source: "action_executor",
  });
}

export async function executeAction(
  action: AnyProposedAction,
  ctx: ExecutionContext,
): Promise<ActionExecutionResult> {
  const actionId = action?.id ?? "unknown";

  if (!action || !isActionType(action.type)) {
    return rejected(actionId, "Unsupported action.");
  }
  if (action.requiresConfirmation && !ctx.confirmed) {
    return rejected(actionId, "This action needs your confirmation.");
  }
  if (!action.idempotencyKey) return rejected(actionId, "Missing idempotency key.");

  const handler = getActionHandler(action.type);
  if (!handler) return rejected(actionId, "Unsupported action.");

  const validated = handler.validate(action.payload);
  if (!validated.ok) return rejected(actionId, validated.message);

  const ledger = ctx.ledger ?? (await serverLedger());

  // The server owns authentication + the idempotency claim. Nothing mutates
  // until the key is granted.
  let claim: { outcome: ReserveOutcome; priorStatus: string | null };
  try {
    claim = await ledger.reserve({
      actionId: action.id,
      idempotencyKey: action.idempotencyKey,
      actionType: action.type,
      origin: action.origin,
      ...(action.context?.ticketId ? { entityType: "ticket", entityId: action.context.ticketId } : {}),
      proposalId: action.id,
    });
  } catch (err) {
    return {
      actionId,
      status: "failed",
      message: err instanceof Error ? err.message : "Couldn't reach the action ledger.",
    };
  }

  // Only a PROVEN prior success reports a clean duplicate.
  if (claim.outcome === "duplicate_success") {
    resolveActionUncertainty(action.id);
    return { actionId, status: "duplicate", message: "This action has already been applied." };
  }
  if (claim.outcome === "in_flight") {
    return {
      actionId,
      status: "rejected",
      message: "This action is already running — give it a moment before retrying.",
    };
  }
  if (claim.outcome === "uncertain") {
    // First-class blocker: the operator must verify before proceeding. Only
    // the action id / entity id travel — never the payload.
    blockers.create({
      type: "action_uncertain",
      entity: { type: "action", id: action.id },
      ...(action.context?.accountId ? { accountId: action.context.accountId } : {}),
      reasonCode: "ACTION_OUTCOME_UNCERTAIN",
      safeLabel: "Outcome needs verification",
      source: "action_executor",
    });
    return {
      actionId,
      status: "uncertain",
      message:
        "A previous attempt didn't finish recording, so it isn't clear whether it applied. Check the current state before applying again.",
    };
  }
  // "reserved" or "retry" — both mean: nothing has been applied, run it now.

  let outcome;
  try {
    outcome = handler.execute(validated.payload);
  } catch (err) {
    outcome = {
      ok: false,
      message: err instanceof Error ? err.message : "The action failed to execute.",
    };
  }

  const executedAt = new Date().toISOString();
  // A completed run is a proven outcome for this action id.
  resolveActionUncertainty(action.id);
  let ledgerSynced = true;
  try {
    await ledger.finalize({
      idempotencyKey: action.idempotencyKey,
      status: outcome.ok ? "success" : "failed",
      before: sanitizeSnapshot(outcome.before),
      after: sanitizeSnapshot(outcome.after),
      ...(outcome.entityType ? { entityType: outcome.entityType } : {}),
      ...(outcome.entityId ? { entityId: outcome.entityId } : {}),
      ...(outcome.ok ? {} : { error: outcome.message.slice(0, 300) }),
    });
  } catch (err) {
    // One retry, then stop. The mutation already landed locally; we must not
    // re-run it. The row stays "executing" and its lease will later resolve to
    // "uncertain", which is the honest state — not a silent success.
    try {
      await ledger.finalize({
        idempotencyKey: action.idempotencyKey,
        status: outcome.ok ? "success" : "failed",
        before: sanitizeSnapshot(outcome.before),
        after: sanitizeSnapshot(outcome.after),
        ...(outcome.ok ? {} : { error: outcome.message.slice(0, 300) }),
      });
    } catch (retryErr) {
      ledgerSynced = false;
      console.warn("[action-executor] ledger finalize failed", err, retryErr);
    }
  }

  return outcome.ok
    ? {
        actionId,
        status: "success",
        executedAt,
        ledgerSynced,
        message: ledgerSynced
          ? outcome.message
          : `${outcome.message} (Applied, but the audit record couldn't be saved.)`,
      }
    : { actionId, status: "failed", executedAt, ledgerSynced, message: outcome.message };
}

export function describeProposedAction(action: AnyProposedAction): string {
  const handler = getActionHandler(action.type);
  if (!handler) return action.reason || "Proposed change";
  const validated = handler.validate(action.payload);
  return validated.ok
    ? handler.describe(validated.payload)
    : action.reason || "Proposed change";
}
