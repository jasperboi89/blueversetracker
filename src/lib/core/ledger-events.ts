import type { AccEvent, AccEventType } from "./events";

/**
 * Durable event allowlist & sensitivity classification (Phase 3, Part 2 & 14).
 *
 * The transient Event Spine fans out every operational fact. The DURABLE ledger
 * (local cache + server-backed table) must persist only events with a clear
 * intelligence use — not noisy view/navigation/timer telemetry. This module is
 * the single source of truth for "does this event belong in the durable
 * ledger", plus its coarse category and sensitivity.
 *
 * It classifies over the EXISTING `AccEventType` vocabulary; it invents no new
 * event types beyond the two `intelligence.*` events already added to the
 * contract. Spec categories with no current event (e.g. account config change,
 * explicit ticket escalation) are documented here as FUTURE, not faked.
 *
 * Sensitivity governs how the persisted row is treated downstream. Events carry
 * only what `sanitizeMetadata` already permits — ids, labels, statuses, counts —
 * never bodies/PHI. `sensitivity` is a belt-and-suspenders classification for
 * retention/permission surfaces, not a licence to store content.
 */

export type LedgerCategory =
  | "account"
  | "ticket"
  | "work"
  | "resolution"
  | "programming"
  | "ai"
  | "intelligence"
  | "system";

/** Reference-only < internal-operational < potentially-sensitive routing. */
export type LedgerSensitivity = "reference" | "operational" | "sensitive";

interface DurableRule {
  category: LedgerCategory;
  sensitivity: LedgerSensitivity;
}

/**
 * The allowlist. Only keys present here are persisted durably. Everything else
 * (ticket.opened view, work.opened, work.paused, dispatch.opened/started,
 * timer.*, night_plan.*, memory.*, curator.*, capability.resolved/blocked,
 * coverage.* and handoff.* dormant events, route.*) is intentionally transient.
 */
const DURABLE: Partial<Record<AccEventType, DurableRule>> = {
  // TICKET — created-in-system, material status change, resolved.
  "ticket.pulled": { category: "ticket", sensitivity: "operational" },
  "ticket.status_changed": { category: "ticket", sensitivity: "operational" },
  "ticket.completed": { category: "ticket", sensitivity: "operational" },

  // WORK — real work lifecycle (a started/finished session, not a page view).
  "work.started": { category: "work", sensitivity: "operational" },
  "work.completed": { category: "work", sensitivity: "operational" },
  "dispatch.retested": { category: "work", sensitivity: "operational" },
  "dispatch.completed": { category: "work", sensitivity: "operational" },
  "blocker.created": { category: "work", sensitivity: "operational" },
  "blocker.resolved": { category: "work", sensitivity: "operational" },

  // PROGRAMMING — change record lifecycle metadata.
  "change.created": { category: "programming", sensitivity: "operational" },
  "change.applied": { category: "programming", sensitivity: "operational" },
  "change.verified": { category: "programming", sensitivity: "operational" },

  // RESOLUTION — reusable verified fixes.
  "resolution.created": { category: "resolution", sensitivity: "operational" },
  "resolution.updated": { category: "resolution", sensitivity: "operational" },
  "resolution.superseded": { category: "resolution", sensitivity: "operational" },
  "resolution.archived": { category: "resolution", sensitivity: "operational" },

  // KNOWLEDGE — reference material lifecycle.
  "knowledge.created": { category: "resolution", sensitivity: "reference" },
  "knowledge.updated": { category: "resolution", sensitivity: "reference" },

  // AI — governed capability outcomes (prepared/executed/verified/failed).
  "capability.invoked": { category: "ai", sensitivity: "operational" },
  "capability.completed": { category: "ai", sensitivity: "operational" },
  "capability.failed": { category: "ai", sensitivity: "operational" },
  "capability.verified": { category: "ai", sensitivity: "operational" },
  "agent.run.completed": { category: "ai", sensitivity: "operational" },
  "agent.run.failed": { category: "ai", sensitivity: "operational" },

  // INTELLIGENCE — pattern observations + human feedback (Phase 3).
  "intelligence.observation_recorded": { category: "intelligence", sensitivity: "reference" },
  "intelligence.feedback_recorded": { category: "intelligence", sensitivity: "reference" },
};

/**
 * FUTURE durable events — spec categories with no current `AccEventType`. Listed
 * so later phases add the event first, then a line above. Do not fabricate these.
 * - account config / meaningful account update
 * - explicit ticket assignment / escalation / reopen (distinct from status_changed)
 * - explicit "AI recommendation accepted / rejected / approved" decisions
 * - integration / indexing failure & recovery (system health)
 */
export const FUTURE_DURABLE_CATEGORIES = [
  "account.config_changed",
  "ticket.assigned",
  "ticket.escalated",
  "ticket.reopened",
  "ai.recommendation_accepted",
  "ai.recommendation_rejected",
  "system.integration_failed",
  "system.integration_recovered",
] as const;

export function isDurableEvent(type: AccEventType): boolean {
  return type in DURABLE;
}

export function ledgerCategory(type: AccEventType): LedgerCategory | undefined {
  return DURABLE[type]?.category;
}

export function ledgerSensitivity(type: AccEventType): LedgerSensitivity {
  return DURABLE[type]?.sensitivity ?? "operational";
}

/** The durable subset of a batch of events, in input order. */
export function selectDurable(events: AccEvent[]): AccEvent[] {
  return events.filter((e) => isDurableEvent(e.type));
}

/** Current durable ledger schema version (bumped when the row shape changes). */
export const LEDGER_SCHEMA_VERSION = 1;
