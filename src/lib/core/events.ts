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
  | "work.started"
  | "work.paused"
  | "work.completed"
  // Dispatch testing
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
  metadata?: Record<string, unknown>;
}

/** What callers pass to emit — id/timestamp are filled in by the spine. */
export type AccEventInput = Omit<AccEvent, "id" | "timestamp"> & {
  timestamp?: string;
};

export type AccEventHandler = (event: AccEvent) => void;

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