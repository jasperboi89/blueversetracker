import type { PatternEvidenceRef } from "./pattern-intelligence";

/**
 * Account Intelligence Timeline (Phase 3, Part 4) — a pure, deterministic merge
 * of canonical facts and durable-ledger events into a chronological, filterable,
 * evidence-inspectable list.
 *
 * It fabricates NO history: every item comes from a canonical record or a
 * recorded ledger event, and each carries its provenance ("canonical" vs
 * "ledger") plus evidence references and (where applicable) an in-app link.
 * If a source has no history, it simply contributes nothing.
 */

export type TimelineCategory =
  | "ticket"
  | "work"
  | "programming"
  | "resolution"
  | "ai"
  | "intelligence"
  | "other";

export type TimelineProvenance = "canonical" | "ledger";

export interface TimelineLink {
  to: string;
  params?: Record<string, string>;
}

export interface TimelineItem {
  id: string;
  atMs: number;
  atIso: string;
  category: TimelineCategory;
  title: string;
  detail?: string;
  provenance: TimelineProvenance;
  evidence: PatternEvidenceRef[];
  link?: TimelineLink;
  /** Originating durable-ledger event id when provenance === "ledger". */
  eventId?: string;
}

/* ------------------------------------------------------------------ */
/* Inputs — bounded canonical facts + ledger refs                      */
/* ------------------------------------------------------------------ */

export interface TimelineLedgerRef {
  id: string;
  type: string;
  category?: string;
  atMs: number;
  ticketId?: string;
  workItemId?: string;
  label?: string;
}

export interface TimelineTicketFact {
  id: string;
  number?: string;
  status: string;
  subject?: string;
  atMs: number;
}

export interface TimelineChangeFact {
  id: string;
  title?: string;
  status?: string;
  atMs: number;
}

export interface TimelineResolutionFact {
  id: string;
  problem?: string;
  confidence: string;
  atMs: number;
}

export interface TimelineWorkFact {
  id: string;
  label?: string;
  kind?: string;
  atMs: number;
}

export interface TimelineInput {
  accountId: string;
  /** Canonical sources — rich labels + links, provenance "canonical". */
  tickets: TimelineTicketFact[];
  changes: TimelineChangeFact[];
  resolutions: TimelineResolutionFact[];
  work: TimelineWorkFact[];
  /**
   * Durable-ledger events. Only ledger events NOT already represented by a
   * canonical fact above are surfaced (AI + intelligence categories), so the
   * timeline never double-counts. Everything here is provenance "ledger".
   */
  ledger: TimelineLedgerRef[];
}

const iso = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toISOString() : "");

/** Ledger categories with no canonical-fact equivalent, surfaced directly. */
const LEDGER_ONLY_CATEGORIES = new Set(["ai", "intelligence"]);

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export function buildAccountTimeline(input: TimelineInput): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const t of input.tickets) {
    items.push({
      id: `tl:ticket:${t.id}`,
      atMs: t.atMs,
      atIso: iso(t.atMs),
      category: "ticket",
      title: `Ticket ${t.number ? `#${t.number}` : t.id} — ${t.status}`,
      ...(t.subject ? { detail: t.subject } : {}),
      provenance: "canonical",
      evidence: [{ type: "ticket", id: t.id }],
      link: { to: "/freshdesk-tickets/$ticketId/work", params: { ticketId: t.id } },
    });
  }

  for (const c of input.changes) {
    items.push({
      id: `tl:change:${c.id}`,
      atMs: c.atMs,
      atIso: iso(c.atMs),
      category: "programming",
      title: `Change — ${c.title ?? c.id}${c.status ? ` (${c.status})` : ""}`,
      provenance: "canonical",
      evidence: [{ type: "change", id: c.id }],
    });
  }

  for (const r of input.resolutions) {
    items.push({
      id: `tl:resolution:${r.id}`,
      atMs: r.atMs,
      atIso: iso(r.atMs),
      category: "resolution",
      title: `Resolution recorded (${r.confidence})`,
      ...(r.problem ? { detail: r.problem } : {}),
      provenance: "canonical",
      evidence: [{ type: "resolution", id: r.id }],
    });
  }

  for (const w of input.work) {
    items.push({
      id: `tl:work:${w.id}`,
      atMs: w.atMs,
      atIso: iso(w.atMs),
      category: "work",
      title: `Work — ${w.label ?? w.kind ?? w.id}`,
      provenance: "canonical",
      evidence: [{ type: "work", id: w.id }],
    });
  }

  for (const e of input.ledger) {
    if (!LEDGER_ONLY_CATEGORIES.has(e.category ?? "")) continue;
    items.push({
      id: `tl:event:${e.id}`,
      atMs: e.atMs,
      atIso: iso(e.atMs),
      category: (e.category as TimelineCategory) ?? "other",
      title: e.label ?? e.type,
      provenance: "ledger",
      evidence: [{ type: "event", id: e.id }],
      eventId: e.id,
      ...(e.ticketId
        ? { link: { to: "/freshdesk-tickets/$ticketId/work", params: { ticketId: e.ticketId } } }
        : {}),
    });
  }

  // Newest first; stable id tiebreak.
  return items.sort((a, b) => b.atMs - a.atMs || a.id.localeCompare(b.id));
}

export const TIMELINE_CATEGORIES: readonly TimelineCategory[] = [
  "ticket",
  "work",
  "programming",
  "resolution",
  "ai",
  "intelligence",
  "other",
];

/** Filter by category; "all"/undefined returns everything. */
export function filterTimeline(
  items: TimelineItem[],
  category?: TimelineCategory | "all",
): TimelineItem[] {
  if (!category || category === "all") return items;
  return items.filter((i) => i.category === category);
}
