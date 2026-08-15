/**
 * Intelligence Core — Portal Context Envelope (Phase 10).
 *
 * A bounded, typed, privacy-conscious PROJECTION of the operator's current
 * working situation. It is not a store of truth: every field is assembled from
 * an authoritative system (Event Spine / Shift Working Context / Awareness /
 * Account Context Pack / Resolution Memory / Hybrid Retrieval) by the Context
 * Orchestrator, and nothing writes back through it.
 *
 * Hard rules encoded here:
 * - IDs, labels, statuses, timestamps and short bounded summaries only.
 * - Never ticket bodies, conversations, caller details or note bodies.
 * - Provenance (`origin`) and Resolution Memory `confidence` stay separate.
 */

import type { ContextFreshness, ContextOrigin, EvidenceConfidence } from "./context-reality";
import type { BlockerType } from "./blockers";
import type { EvidenceConflict, EvidenceFact } from "./evidence-contract";

export const PORTAL_CONTEXT_VERSION = 1 as const;

/* ------------------------------------------------------------------ */
/* Location                                                            */
/* ------------------------------------------------------------------ */

export const PORTAL_AREAS = [
  "home",
  "assigned_inbox",
  "freshdesk_work",
  "freshdesk_intelligence",
  "additional_work",
  "contact_dispatch",
  "knowledge_vault",
  "completed_work",
  "accounts",
  "reports",
  "settings",
  "audit",
  "achievements",
  "unknown",
] as const;
export type PortalArea = (typeof PORTAL_AREAS)[number];

export type PortalEntityType = "ticket" | "account" | "work_item" | "dispatch" | "knowledge_note";

export interface PortalLocationContext {
  /** Stable machine identifier for the workspace, never a display string. */
  area: PortalArea;
  /** Stable identifier for the screen within the area. */
  routeId: string;
  /** Human label for prompts/inspector only. */
  label: string;
  entityType?: PortalEntityType;
  entityId?: string;
}

/* ------------------------------------------------------------------ */
/* Active entities                                                     */
/* ------------------------------------------------------------------ */

export interface ActiveTicketContext {
  id: string;
  label?: string;
  accountId?: string;
  openedAt?: string;
  /** True when the operator is looking at this ticket right now. */
  onScreen: boolean;
  origin: ContextOrigin;
}

export interface ActiveAccountContext {
  id: string;
  name?: string;
  onScreen: boolean;
  origin: ContextOrigin;
}

export interface ActiveWorkItemContext {
  id: string;
  title?: string;
  startedAt?: string;
  onScreen: boolean;
  origin: ContextOrigin;
}

export interface ActiveDispatchContext {
  id: string;
  onScreen: boolean;
  origin: ContextOrigin;
}

/** Knowledge Vault presence: metadata only — never the note body. */
export interface ActiveKnowledgeContext {
  id: string;
  title?: string;
  collection?: string;
  noteType?: string;
  /** draft | saved | reference, when the vault tracks one. */
  status?: string;
  updatedAt?: string;
  /** reader | edit | book | focus presentation state. */
  presentation?: string;
  onScreen: boolean;
  origin: ContextOrigin;
}

export interface PortalActiveEntities {
  ticket?: ActiveTicketContext;
  account?: ActiveAccountContext;
  workItem?: ActiveWorkItemContext;
  dispatch?: ActiveDispatchContext;
  knowledgeNote?: ActiveKnowledgeContext;
}

/* ------------------------------------------------------------------ */
/* Work state                                                          */
/* ------------------------------------------------------------------ */

export interface PortalWorkState {
  running: boolean;
  paused?: boolean;
  elapsedMs?: number;
  /** Signal only. The draft content itself is never carried in the envelope. */
  unsavedChanges: boolean;
  unsavedEntities: PortalEntityType[];
  editMode?: boolean;
}

/* ------------------------------------------------------------------ */
/* Blockers / awareness / activity                                     */
/* ------------------------------------------------------------------ */

export interface ContextBlocker {
  id: string;
  type: BlockerType;
  label: string;
  since: string;
  entityType?: string;
  entityId?: string;
  origin: ContextOrigin;
}

export interface ContextAwarenessItem {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  origin: ContextOrigin;
}

export interface ContextActivity {
  id: string;
  kind: string;
  label: string;
  at: string;
  complete?: boolean;
}

/* ------------------------------------------------------------------ */
/* Bounded account context                                             */
/* ------------------------------------------------------------------ */

export interface BoundedAccountContext {
  accountNumber: string;
  name?: string;
  generatedAt: string;
  freshness: ContextFreshness;
  counts: {
    recentTickets: number;
    recentChanges: number;
    knownFixes: number;
    warnings: number;
  };
  /** Short operator-visible lines already scrubbed by the projection layer. */
  summary: string;
  /** Sources the pack could not reach. */
  unavailable: string[];
  origin: ContextOrigin;
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

export type EvidenceSourceType =
  | "account_context"
  | "resolution"
  | "knowledge"
  | "runbook"
  | "change_record"
  | "freshdesk_ticket"
  | "similar_work";

export interface ContextEvidence {
  id: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  title?: string;
  /** Bounded operational summary. Never a body, conversation or caller detail. */
  summary: string;
  origin: ContextOrigin;
  confidence?: EvidenceConfidence;
  status?: string;
  observedAt?: string;
  updatedAt?: string;
  freshness?: ContextFreshness;
  historical?: boolean;
  superseded?: boolean;
  /** Relevance hint from the producing system (0..1); used only for ordering. */
  relevance?: number;
}

/* ------------------------------------------------------------------ */
/* Warnings + budget                                                   */
/* ------------------------------------------------------------------ */

/**
 * Phase 12 — bounded projection of an Operational Memory into the envelope.
 * Experience of past work, never a claim about current state.
 */
export interface ContextMemory {
  id: string;
  memoryClass: string;
  title: string;
  summary: string;
  occurredAt: string;
  status: string;
  origin: ContextOrigin;
  confidence?: EvidenceConfidence;
  importance: number;
  relevance: number;
  /** Why this memory matched the current situation. */
  reasons: string[];
  accountNumber?: string;
  ticketId?: string;
}

export type ContextWarningCode =
  | "source_unavailable"
  | "context_degraded"
  | "shift_boundary"
  | "entity_mismatch"
  | "budget_trimmed"
  | "evidence_conflict";

export interface ContextWarning {
  code: ContextWarningCode;
  source?: string;
  message: string;
}

export interface ContextBudgetMetadata {
  /** Model tier the router picked, once known (server-side). */
  tier?: string;
  taskKind?: string;
  maxContextChars?: number;
  maxEvidenceItems?: number;
  evidenceAvailable: number;
  evidenceIncluded?: number;
  evidenceTrimmed?: number;
  contextChars?: number;
  truncated?: boolean;
  assemblyMs?: number;
}

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

export interface PortalContextEnvelope {
  version: typeof PORTAL_CONTEXT_VERSION;
  generatedAt: string;
  shiftKey: string;
  location: PortalLocationContext;
  active: PortalActiveEntities;
  workState: PortalWorkState;
  blockers: ContextBlocker[];
  awareness: ContextAwarenessItem[];
  recentActivity: ContextActivity[];
  accountContext?: BoundedAccountContext;
  evidence: ContextEvidence[];
  /**
   * Phase 11 — Reality Boundary projection of the same evidence, carrying
   * provenance, confidence, temporal validity and supersession explicitly.
   */
  facts?: EvidenceFact[];
  /** Unresolved contradictions between current facts. Never auto-resolved. */
  evidenceConflicts?: EvidenceConflict[];
  /** Phase 12 — prior experience relevant to the current work. */
  memory?: ContextMemory[];
  warnings: ContextWarning[];
  budget: ContextBudgetMetadata;
}

/* ------------------------------------------------------------------ */
/* Route classification                                                */
/* ------------------------------------------------------------------ */

interface RouteMatch {
  test: RegExp;
  area: PortalArea;
  routeId: string;
  label: string;
  entityType?: PortalEntityType;
}

/** Ordered most-specific-first. Only path segments are read — never query state. */
const ROUTES: RouteMatch[] = [
  {
    test: /^\/freshdesk-tickets\/([^/]+)\/work\/?$/,
    area: "freshdesk_work",
    routeId: "ticket_work",
    label: "Freshdesk ticket work",
    entityType: "ticket",
  },
  { test: /^\/freshdesk-tickets\/?$/, area: "freshdesk_work", routeId: "ticket_list", label: "Freshdesk tickets" },
  {
    test: /^\/freshdesk-intelligence\/?$/,
    area: "freshdesk_intelligence",
    routeId: "freshdesk_intelligence",
    label: "Freshdesk intelligence",
  },
  {
    test: /^\/additional-work\/([^/]+)\/work\/?$/,
    area: "additional_work",
    routeId: "additional_work_record",
    label: "Additional work record",
    entityType: "work_item",
  },
  { test: /^\/additional-work\/?$/, area: "additional_work", routeId: "additional_work_list", label: "Additional work" },
  {
    test: /^\/contact-dispatch\/archive\/?$/,
    area: "contact_dispatch",
    routeId: "dispatch_archive",
    label: "Contact dispatch archive",
  },
  {
    test: /^\/contact-dispatch\/([^/]+)\/work\/?$/,
    area: "contact_dispatch",
    routeId: "dispatch_session",
    label: "Contact dispatch testing",
    entityType: "dispatch",
  },
  { test: /^\/contact-dispatch\/?$/, area: "contact_dispatch", routeId: "dispatch_list", label: "Contact dispatch" },
  {
    test: /^\/accounts\/([^/]+)\/?$/,
    area: "accounts",
    routeId: "account_detail",
    label: "Account page",
    entityType: "account",
  },
  { test: /^\/accounts\/?$/, area: "accounts", routeId: "account_list", label: "Accounts" },
  { test: /^\/knowledge-vault\/?$/, area: "knowledge_vault", routeId: "knowledge_vault", label: "Knowledge Vault" },
  { test: /^\/assigned-to-me\/?$/, area: "assigned_inbox", routeId: "assigned_inbox", label: "Assigned to me" },
  { test: /^\/completed-work\/?$/, area: "completed_work", routeId: "completed_work", label: "Completed work" },
  { test: /^\/reports\/?$/, area: "reports", routeId: "reports", label: "Reports" },
  { test: /^\/settings\/?$/, area: "settings", routeId: "settings", label: "Settings" },
  { test: /^\/audit-log\/?$/, area: "audit", routeId: "audit_log", label: "Audit log" },
  { test: /^\/achievements\/?$/, area: "achievements", routeId: "achievements", label: "Achievements" },
  { test: /^\/constellations\/?$/, area: "achievements", routeId: "constellations", label: "Constellations" },
  { test: /^\/?$/, area: "home", routeId: "home", label: "Home deck" },
];

/**
 * Deterministic route -> stable location identifier. Path segments only: query
 * strings and router state never reach the AI layer through this function.
 */
export function classifyLocation(pathname: string): PortalLocationContext {
  const path = (pathname || "/").split("?")[0].split("#")[0].replace(/^\/_authenticated/, "");
  for (const route of ROUTES) {
    const m = route.test.exec(path || "/");
    if (!m) continue;
    const entityId = route.entityType ? m[1] : undefined;
    return {
      area: route.area,
      routeId: route.routeId,
      label: route.label,
      ...(route.entityType ? { entityType: route.entityType } : {}),
      ...(entityId ? { entityId } : {}),
    };
  }
  return { area: "unknown", routeId: "unknown", label: "the portal" };
}
