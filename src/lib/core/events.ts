/**
 * Intelligence Core — Event Spine contracts.
 *
 * A single, strongly typed vocabulary every feature can publish into without
 * importing each other. Events are facts about what just happened; they never
 * carry UI state and never imply a mutation.
 */

export type AccEventType =
  // Tickets
  | "ticket.opened"
  | "ticket.pulled"
  | "ticket.status_changed"
  | "ticket.completed"
  // Accounts
  | "account.opened"
  // Generic work items
  | "work.opened"
  | "work.started"
  | "work.paused"
  | "work.completed"
  // Dispatch testing
  | "dispatch.opened"
  | "dispatch.started"
  | "dispatch.retested"
  | "dispatch.completed"
  // Change records
  | "change.created"
  | "change.applied"
  | "change.verified"
  // Coverage
  | "coverage.expiring"
  | "coverage.confirmed"
  // Knowledge Vault
  | "knowledge.created"
  | "knowledge.updated"
  // Shift handoff
  | "handoff.created"
  | "handoff.published"
  // Timers
  | "timer.started"
  | "timer.stopped"
  // Night plan
  | "night_plan.item_added"
  | "night_plan.item_completed";

/** Where the event came from — a store, a route, or the Copilot executor. */
export type AccEventSource =
  | "tickets-store"
  | "accounts"
  | "active-work"
  | "dispatch"
  | "additional-work"
  | "night-plan"
  | "changes"
  | "coverage"
  | "knowledge"
  | "handoff"
  | "copilot"
  | "route"
  | "system";

export interface AccEvent {
  id: string;
  type: AccEventType;
  /** ISO 8601 timestamp. */
  timestamp: string;
  source: AccEventSource;
  /** Correlation keys — include whichever ones apply, omit the rest. */
  accountId?: string;
  ticketId?: string;
  workItemId?: string;
  dispatchId?: string;
  /** Small, non-sensitive routing metadata only (see sanitizeMetadata). */
  metadata?: AccEventMetadata;
}

/** What callers pass to emit — id/timestamp are filled in by the spine. */
export type AccEventInput = Omit<AccEvent, "id" | "timestamp" | "metadata"> & {
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

export type AccEventHandler = (event: AccEvent) => void;

/**
 * Metadata allowlist.
 *
 * The spine is a coordination log, not a content archive: it must never carry
 * ticket bodies, notes, caller/patient details, message or conversation text,
 * prompts/responses, or account instructions. Only these small routing keys
 * survive `sanitizeMetadata`, and strings are capped so a body can't be
 * smuggled through a permitted key.
 */
export const EVENT_METADATA_KEYS = [
  "label",
  "kind",
  "accountName",
  "status",
  "prevStatus",
  "classification",
  "priority",
  "severity",
  "itemId",
  "durationMs",
  "resumed",
  "route",
  "count",
  "reason",
] as const;

export type AccEventMetadataKey = (typeof EVENT_METADATA_KEYS)[number];

export type AccEventMetadata = Partial<
  Record<AccEventMetadataKey, string | number | boolean | null>
>;

const MAX_STRING = 120;

/** Keep only allowlisted, small, primitive metadata. */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): AccEventMetadata | undefined {
  if (!metadata) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of EVENT_METADATA_KEYS) {
    if (!(key in metadata)) continue;
    const v = metadata[key];
    if (v === null) out[key] = null;
    else if (typeof v === "number" || typeof v === "boolean") out[key] = v;
    else if (typeof v === "string") {
      const t = v.trim();
      if (t) out[key] = t.length > MAX_STRING ? `${t.slice(0, MAX_STRING)}…` : t;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export interface AccEventFilter {
  /** Only deliver these types. Omit for all. */
  types?: readonly AccEventType[];
  accountId?: string;
  ticketId?: string;
}

export function matchesFilter(event: AccEvent, filter?: AccEventFilter): boolean {
  if (!filter) return true;
  if (filter.types && !filter.types.includes(event.type)) return false;
  if (filter.accountId && event.accountId !== filter.accountId) return false;
  if (filter.ticketId && event.ticketId !== filter.ticketId) return false;
  return true;
}