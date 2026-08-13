/**
 * Intelligence Core — Phase 9.5: first-class blockers.
 *
 * A blocker states: "this work cannot move forward, here is why, here is what
 * it is attached to". Deterministic, event-driven and privacy-conscious — the
 * record carries IDs, reason codes, short safe labels and timestamps only.
 * Never ticket bodies, notes, conversations, prompts or action payloads.
 */
import { eventSpine } from "./event-spine";

export type BlockerType =
  | "waiting_customer"
  | "waiting_internal"
  | "waiting_external"
  | "action_uncertain"
  | "dependency"
  | "manual";

export type BlockerEntityType = "ticket" | "work" | "dispatch" | "account" | "action";

export type BlockerSource = "ticket" | "work" | "action_executor" | "operator" | "system";

export interface BlockerEntityRef {
  type: BlockerEntityType;
  id: string;
}

export interface WorkBlocker {
  id: string;
  type: BlockerType;
  entity: BlockerEntityRef;
  accountId?: string;
  /** Stable machine reason, e.g. TICKET_WAITING_CS. */
  reasonCode: string;
  /** Short, bounded, operator-safe text. Never free-form notes. */
  safeLabel?: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  source: BlockerSource;
}

/** Enough room for "Waiting on Customer Service" style text, nothing more. */
export const SAFE_LABEL_MAX = 60;

export function safeLabel(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const t = input.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > SAFE_LABEL_MAX ? `${t.slice(0, SAFE_LABEL_MAX - 1)}…` : t;
}

/** Stable identity — repeated detection updates instead of duplicating. */
export function blockerId(
  type: BlockerType,
  entity: BlockerEntityRef,
): string {
  return `${type}:${entity.type}:${entity.id}`;
}

export const BLOCKER_TYPE_LABEL: Record<BlockerType, string> = {
  waiting_customer: "Waiting on Customer Service",
  waiting_internal: "Waiting on Programming",
  waiting_external: "Waiting on an external party",
  action_uncertain: "Outcome needs verification",
  dependency: "Waiting on another item",
  manual: "Blocked",
};

export interface BlockerInput {
  type: BlockerType;
  entity: BlockerEntityRef;
  accountId?: string;
  reasonCode: string;
  safeLabel?: string;
  source: BlockerSource;
}

function emit(
  kind: "blocker.created" | "blocker.updated" | "blocker.resolved",
  input: BlockerInput,
): string {
  const id = blockerId(input.type, input.entity);
  eventSpine.emit({
    type: kind,
    source: input.source === "action_executor" ? "copilot" : input.source === "ticket" ? "tickets-store" : "system",
    ...(input.entity.type === "ticket" ? { ticketId: input.entity.id } : {}),
    ...(input.entity.type === "dispatch" ? { dispatchId: input.entity.id } : {}),
    ...(input.entity.type === "work" ? { workItemId: input.entity.id } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
    metadata: {
      blockerId: id,
      blockerType: input.type,
      entityType: input.entity.type,
      entityId: input.entity.id,
      reasonCode: input.reasonCode,
      blockerSource: input.source,
      ...(input.safeLabel ? { safeLabel: safeLabel(input.safeLabel) } : {}),
    },
  });
  return id;
}

export const blockers = {
  create: (input: BlockerInput) => emit("blocker.created", input),
  update: (input: BlockerInput) => emit("blocker.updated", input),
  resolve: (input: BlockerInput) => emit("blocker.resolved", input),
  id: blockerId,
};
