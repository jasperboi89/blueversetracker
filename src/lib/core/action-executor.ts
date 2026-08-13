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
import {
  isActionType,
  sanitizeSnapshot,
  type ActionExecutionResult,
  type AnyProposedAction,
  type LedgerSnapshot,
} from "./actions";

export interface LedgerPort {
  reserve: (input: {
    actionId: string;
    idempotencyKey: string;
    actionType: string;
    origin: string;
    entityType?: string;
    entityId?: string;
    proposalId?: string;
  }) => Promise<{ outcome: "reserved" | "duplicate"; priorStatus: string | null }>;
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
  let claim: { outcome: "reserved" | "duplicate"; priorStatus: string | null };
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

  if (claim.outcome === "duplicate") {
    return {
      actionId,
      status: "duplicate",
      message:
        claim.priorStatus === "failed"
          ? "This action was already attempted and failed."
          : "This action has already been applied.",
    };
  }

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
    console.warn("[action-executor] ledger finalize failed", err);
  }

  return outcome.ok
    ? { actionId, status: "success", executedAt, message: outcome.message }
    : { actionId, status: "failed", executedAt, message: outcome.message };
}

export function describeProposedAction(action: AnyProposedAction): string {
  const handler = getActionHandler(action.type);
  if (!handler) return action.reason || "Proposed change";
  const validated = handler.validate(action.payload);
  return validated.ok
    ? handler.describe(validated.payload)
    : action.reason || "Proposed change";
}
