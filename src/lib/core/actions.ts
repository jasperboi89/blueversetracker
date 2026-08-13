/**
 * Intelligence Core — Safe Action Executor contracts (Phase 4).
 *
 * Copilot never mutates a store directly. It *proposes*; the operator reviews
 * and applies; the executor validates, de-duplicates, executes through one
 * explicit handler per action type, and writes a durable ledger record.
 */

export type ActionOrigin = "copilot" | "operator" | "awareness" | "system";

export type ActionType =
  | "add_night_plan_item"
  | "complete_night_plan_item"
  | "set_ticket_classification"
  | "start_timer";

/** Risk tiers — read-only actions never reach the executor today. */
export type ActionRisk = "read" | "low_write" | "high_write";

export interface AddNightPlanItemPayload {
  task: string;
  notes?: string;
  priority?: "must" | "important" | "normal";
}
export interface CompleteNightPlanItemPayload {
  task: string;
}
export interface SetTicketClassificationPayload {
  ticketNumber: string;
  classification: string;
}
export interface StartTimerPayload {
  ticketNumber: string;
}

export type ActionPayloadMap = {
  add_night_plan_item: AddNightPlanItemPayload;
  complete_night_plan_item: CompleteNightPlanItemPayload;
  set_ticket_classification: SetTicketClassificationPayload;
  start_timer: StartTimerPayload;
};

export interface ActionContext {
  ticketId?: string;
  accountId?: string;
  workItemId?: string;
  dispatchId?: string;
}

export interface ProposedAction<T extends ActionType = ActionType> {
  id: string;
  type: T;
  payload: ActionPayloadMap[T];
  origin: ActionOrigin;
  requiresConfirmation: boolean;
  createdAt: string;
  idempotencyKey: string;
  /** Free-text rationale shown in the confirm card; never persisted. */
  reason?: string;
  context?: ActionContext;
}

export type AnyProposedAction = {
  [K in ActionType]: ProposedAction<K>;
}[ActionType];

/**
 * "uncertain" = the ledger cannot prove whether the mutation ran (a stale
 * reservation or a finalize that never landed). It is deliberately NOT
 * treated as success and NOT auto-retried.
 */
export type ActionStatus =
  | "success"
  | "failed"
  | "duplicate"
  | "rejected"
  | "uncertain";

export interface ActionExecutionResult {
  actionId: string;
  status: ActionStatus;
  executedAt?: string;
  message?: string;
  eventId?: string;
  /**
   * False when the mutation ran but the durable ledger record could not be
   * closed out — the local state is correct, the audit trail is incomplete.
   */
  ledgerSynced?: boolean;
}

/** Minimal, privacy-conscious ledger snapshot. */
export const LEDGER_SNAPSHOT_KEYS = [
  "classification",
  "status",
  "priority",
  "itemId",
  "ticketId",
  "ticketNumber",
  "workItemId",
  "kind",
] as const;
export type LedgerSnapshotKey = (typeof LEDGER_SNAPSHOT_KEYS)[number];
export type LedgerSnapshot = Partial<
  Record<LedgerSnapshotKey, string | number | boolean | null>
> | null;

const MAX_SNAPSHOT_STRING = 80;

/**
 * The ledger is an accountability trail, not a content archive: strip anything
 * outside the allowlist so ticket bodies, notes, caller details, prompts, or
 * account instructions can never be smuggled into it.
 */
export function sanitizeSnapshot(input: unknown): LedgerSnapshot {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of LEDGER_SNAPSHOT_KEYS) {
    if (!(key in src)) continue;
    const v = src[key];
    if (v === null) out[key] = null;
    else if (typeof v === "number" || typeof v === "boolean") out[key] = v;
    else if (typeof v === "string") {
      const t = v.trim();
      if (t) out[key] = t.length > MAX_SNAPSHOT_STRING ? t.slice(0, MAX_SNAPSHOT_STRING) : t;
    }
  }
  return Object.keys(out).length ? out : null;
}

export const ACTION_TYPES: readonly ActionType[] = [
  "add_night_plan_item",
  "complete_night_plan_item",
  "set_ticket_classification",
  "start_timer",
];

export function isActionType(v: unknown): v is ActionType {
  return typeof v === "string" && (ACTION_TYPES as readonly string[]).includes(v);
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a typed proposal with a stable id + idempotency key. */
export function createProposedAction<T extends ActionType>(args: {
  type: T;
  payload: ActionPayloadMap[T];
  origin: ActionOrigin;
  reason?: string;
  context?: ActionContext;
  id?: string;
}): ProposedAction<T> {
  const id = args.id ?? randomId();
  return {
    id,
    type: args.type,
    payload: args.payload,
    origin: args.origin,
    // Every consequential write from a non-human origin needs a human Apply.
    requiresConfirmation: args.origin !== "operator",
    createdAt: new Date().toISOString(),
    idempotencyKey: `${args.origin}:${args.type}:${id}`,
    reason: args.reason,
    context: args.context,
  };
}
