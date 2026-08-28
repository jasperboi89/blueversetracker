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
  // Blockers (Phase 9.5) — "work cannot move forward"
  | "blocker.created"
  | "blocker.updated"
  | "blocker.resolved"
  // Knowledge Vault
  | "knowledge.created"
  | "knowledge.updated"
  // Shift handoff
  | "handoff.created"
  | "handoff.published"
  // Timers
  | "timer.started"
  | "timer.stopped"
  // Resolution Memory (operator-confirmed reusable fixes)
  | "resolution.created"
  | "resolution.updated"
  | "resolution.superseded"
  | "resolution.archived"
  // Night plan
  | "night_plan.item_added"
  | "night_plan.item_completed"
  // Operational Memory Cortex (Phase 12)
  | "memory.captured"
  | "memory.candidate_created"
  | "memory.promoted"
  // Memory Curator + Knowledge Promotion (Phase 13)
  | "curator.candidate.clustered"
  | "curator.candidate.supported"
  | "curator.candidate.review_ready"
  | "curator.candidate.blocked"
  | "curator.candidate.merged"
  | "curator.promotion.prepared"
  | "curator.promotion.approved"
  | "curator.promotion.rejected"
  | "curator.promotion.completed"
  | "curator.promotion.failed"
  | "knowledge.reinforced"
  | "knowledge.superseded"
  // Capability Registry / Agent Nervous System (Phase 16)
  | "capability.resolved"
  | "capability.blocked"
  | "capability.invoked"
  | "capability.completed"
  | "capability.failed"
  | "capability.verification_pending"
  | "capability.verified"
  | "capability.deprecated"
  // Bounded Agent Runtime (Phase 17)
  | "agent.run.started"
  | "agent.run.cycle"
  | "agent.run.blocked"
  | "agent.run.awaiting_confirmation"
  | "agent.run.completed"
  | "agent.run.failed"
  // Script Intelligence / Dependency Cortex (Phase 4). Structural references
  // only — never script source, component text, or account instructions.
  | "script.version_recorded"
  | "script.structure_changed"
  // Intelligence (Phase 3) — pattern observations + human feedback. References
  // only (ids/classes/counts); never derived content or bodies.
  | "intelligence.observation_recorded"
  | "intelligence.feedback_recorded"
  // Anomaly Detection & Early Warning (Phase 5). Deviation references only —
  // signal ids, anomaly kinds, severity/confidence classes and counts.
  | "intelligence.anomaly_detected"
  | "intelligence.baseline_insufficient"
  // Risk Forecasting & Future-State Intelligence (Phase 6). Forecast lifecycle
  // references only — forecast ids, types, bands, horizons and counts.
  | "intelligence.forecast_created"
  | "intelligence.forecast_updated"
  | "intelligence.forecast_resolved"
  | "intelligence.forecast_expired"
  | "intelligence.forecast_acknowledged";

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
  | "resolution"
  | "handoff"
  | "copilot"
  | "memory"
  | "curator"
  | "capability"
  | "agent"
  | "intelligence"
  | "script"
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
  "confidence",
  "sourceType",
  "resolutionId",
  // Curator routing — ids and safe counts only.
  "candidateId",
  "packetId",
  "destination",
  "operation",
  "risk",
  "lifecycle",
  // Blocker routing — IDs and reason codes only.
  "blockerId",
  "blockerType",
  "reasonCode",
  "entityType",
  "entityId",
  "blockerSource",
  "safeLabel",
  // Capability routing — ids, versions and reason codes only.
  "capabilityId",
  "capabilityVersion",
  "correlationId",
  "availability",
  "health",
  "requestedBy",
  "verificationStatus",
  // Agent runtime routing — ids, cycle counts and stop reasons only.
  "runId",
  "cycle",
  "mode",
  "stopReason",
  // Script Intelligence routing (Phase 4) — version numbers, fingerprints and
  // counts only. Never component names, conditions, or script source.
  "scriptVersion",
  "structureFingerprint",
  "complexityBand",
  // Intelligence routing (Phase 3) — observation/pattern ids and feedback class.
  "observationId",
  "patternType",
  "feedbackKind",
  "windowDays",
  // Anomaly routing (Phase 5) — deviation magnitude and baseline size only.
  "robustZ",
  "baselineSamples",
] as const;

export type AccEventMetadataKey = (typeof EVENT_METADATA_KEYS)[number];

export type AccEventMetadata = Partial<
  Record<AccEventMetadataKey, string | number | boolean | null>
>;

const MAX_STRING = 120;
/** Blocker labels are operator-facing chips, not prose. */
const MAX_SAFE_LABEL = 60;

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
      const cap = key === "safeLabel" ? MAX_SAFE_LABEL : MAX_STRING;
      if (t) out[key] = t.length > cap ? `${t.slice(0, cap)}…` : t;
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
