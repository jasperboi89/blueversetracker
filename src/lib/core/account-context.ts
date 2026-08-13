/**
 * Intelligence Core — Account Context Pack (Phase 5).
 *
 * One normalized answer to: "what does the portal currently know about this
 * account that is operationally useful right now?"
 *
 * This is a DERIVED layer, not a new database. Every underlying system stays
 * authoritative (tickets store, change records, coverage store, dispatch
 * store, Knowledge Vault, awareness engine); the pack assembles bounded
 * references to them, records where each slice came from, and reports partial
 * results honestly when one source fails.
 */
import type { Ticket } from "@/lib/tickets-store";
import type { WorkLogEntry } from "@/lib/workspace/work-log-store";
import type { AdditionalWork } from "@/lib/additional-work-store";
import type { AccountChangeRecord } from "@/lib/changes/changes.functions";
import type { KnowledgeNote } from "@/lib/knowledge/knowledge.functions";
import type { DispatchSession } from "@/lib/dispatch-store";
import type { CoverageGap, WatchedAccount } from "@/lib/coverage/coverage-store";
import type { RecurringRow } from "@/lib/reports/recurring-issues";
import type { AwarenessItem } from "./awareness";

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

export type ContextSourceName =
  | "accounts"
  | "tickets"
  | "work"
  | "change_record"
  | "knowledge"
  | "coverage"
  | "dispatch"
  | "awareness";

export interface ContextSource {
  source: ContextSourceName;
  sourceId?: string;
  retrievedAt: string;
}

export interface AccountContextProvenance {
  generatedAt: string;
  sources: Partial<
    Record<ContextSourceName, { retrievedAt: string; count: number; ok: boolean }>
  >;
}

/** Only timestamps the underlying source can actually provide. */
export interface AccountContextFreshness {
  generatedAt: string;
  sources: Partial<Record<ContextSourceName, string>>;
}

export interface AccountContextError {
  source: ContextSourceName;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export interface AccountContextIdentity {
  id: string;
  accountNumber: string;
  name?: string;
  status?: "active" | "archived";
  /** Operational routing classification, when the portal tracks one. */
  watched?: boolean;
}

export interface AccountContextTicket {
  id: string;
  number: string;
  status: string;
  classification?: string;
  /** Short operational title only — never the body or conversation. */
  subject?: string;
  updatedAt: string;
  completedAt?: string;
  source: ContextSource;
}

export interface AccountContextWork {
  id: string;
  kind: "logged_time" | "additional_work";
  label: string;
  status?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  source: ContextSource;
}

export interface AccountContextChange {
  id: string;
  title: string;
  changeType: string;
  status: string;
  risk: string;
  ticketNumber?: string;
  appliedAt?: string;
  verifiedAt?: string;
  createdAt: string;
  source: ContextSource;
}

export interface AccountContextFix {
  id: string;
  label: string;
  confidence: "verified" | "probable";
  changeType?: string;
  ticketNumber?: string;
  at: string;
  source: ContextSource;
}

export interface AccountContextCoverage {
  watched: boolean;
  onCallThrough?: string;
  onCallNote?: string;
  gaps: Array<{ kind: string; label: string; date: string; daysAway: number; severity: string }>;
  source: ContextSource;
}

export interface AccountContextPattern {
  id: string;
  kind: "recurring_scripting_issues";
  label: string;
  count30d: number;
  count6m: number;
  lastAt?: string;
  active: boolean;
  source: ContextSource;
}

export interface AccountContextRunbook {
  id: string;
  title: string;
  noteType: string;
  updatedAt: string;
  /** Why this reference surfaced — no document body is included. */
  relevance: string;
  source: ContextSource;
}

export interface AccountContextDispatch {
  id: string;
  status?: string;
  ticketNumber?: string;
  updatedAt: string;
  completedAt?: string;
  source: ContextSource;
}

export interface AccountContextWarning {
  id: string;
  severity: "info" | "warning" | "critical";
  label: string;
  source: ContextSource;
}

export interface AccountContextPack {
  account: AccountContextIdentity;
  generatedAt: string;
  recentTickets: AccountContextTicket[];
  recentWork: AccountContextWork[];
  recentChanges: AccountContextChange[];
  knownFixes: AccountContextFix[];
  coverage?: AccountContextCoverage;
  recurringPatterns: AccountContextPattern[];
  runbooks: AccountContextRunbook[];
  recentDispatches: AccountContextDispatch[];
  warnings: AccountContextWarning[];
  provenance: AccountContextProvenance;
  freshness: AccountContextFreshness;
  errors: AccountContextError[];
}

/* ------------------------------------------------------------------ */
/* Options                                                            */
/* ------------------------------------------------------------------ */

export interface AccountContextOptions {
  recentTicketLimit?: number;
  recentWorkLimit?: number;
  recentChangeLimit?: number;
  recentDispatchLimit?: number;
  knowledgeLimit?: number;
  includeCoverage?: boolean;
  includeKnowledge?: boolean;
}

/** Bounded defaults — no caller may request an unlimited scan. */
export const CONTEXT_LIMITS = {
  tickets: { def: 8, max: 25 },
  work: { def: 8, max: 25 },
  changes: { def: 6, max: 20 },
  dispatches: { def: 5, max: 15 },
  knowledge: { def: 5, max: 15 },
  fixes: { max: 6 },
} as const;

function bound(v: number | undefined, spec: { def: number; max: number }): number {
  if (!Number.isFinite(v) || (v as number) <= 0) return spec.def;
  return Math.min(Math.floor(v as number), spec.max);
}

/* ------------------------------------------------------------------ */
/* Source ports                                                        */
/* ------------------------------------------------------------------ */

export interface AccountContextPorts {
  identity: (accountNumber: string) => {
    number: string;
    name?: string;
    status?: "active" | "archived";
  } | null;
  tickets: (accountNumber: string) => Ticket[];
  work: (accountNumber: string) => { logged: WorkLogEntry[]; additional: AdditionalWork[] };
  changes: (accountNumber: string) => Promise<AccountChangeRecord[]>;
  coverage: (accountNumber: string) => { watched?: WatchedAccount; gaps: CoverageGap[] };
  knowledge: (accountNumber: string, accountName?: string) => Promise<KnowledgeNote[]>;
  dispatch: (accountNumber: string) => DispatchSession[];
  recurring: (accountNumber: string) => RecurringRow | undefined;
  awareness: (accountNumber: string) => AwarenessItem[];
}

const iso = (ms?: number): string | undefined =>
  typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;

/** Short display strings only; never bodies, notes, or conversations. */
function trim(v: string | undefined, max = 120): string | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Assemble the pack. Every source is isolated: one failure becomes an entry in
 * `errors` and the remaining categories still return.
 */
export async function assembleAccountContext(
  accountNumber: string,
  ports: AccountContextPorts,
  options: AccountContextOptions = {},
): Promise<AccountContextPack> {
  const at = new Date().toISOString();
  const errors: AccountContextError[] = [];
  const provenance: AccountContextProvenance["sources"] = {};
  const freshness: AccountContextFreshness["sources"] = {};

  const src = (source: ContextSourceName, sourceId?: string): ContextSource => ({
    source,
    ...(sourceId ? { sourceId } : {}),
    retrievedAt: at,
  });
  const note = (source: ContextSourceName, count: number, ok: boolean, newest?: string) => {
    provenance[source] = { retrievedAt: at, count, ok };
    if (newest) freshness[source] = newest;
  };
  const fail = (source: ContextSourceName, err: unknown) => {
    errors.push({
      source,
      message: err instanceof Error ? err.message : `Couldn't read ${source}.`,
    });
    provenance[source] = { retrievedAt: at, count: 0, ok: false };
  };

  const ticketLimit = bound(options.recentTicketLimit, CONTEXT_LIMITS.tickets);
  const workLimit = bound(options.recentWorkLimit, CONTEXT_LIMITS.work);
  const changeLimit = bound(options.recentChangeLimit, CONTEXT_LIMITS.changes);
  const dispatchLimit = bound(options.recentDispatchLimit, CONTEXT_LIMITS.dispatches);
  const knowledgeLimit = bound(options.knowledgeLimit, CONTEXT_LIMITS.knowledge);

  /* identity ------------------------------------------------------- */
  let identity: AccountContextIdentity = { id: accountNumber, accountNumber };
  try {
    const row = ports.identity(accountNumber);
    identity = {
      id: accountNumber,
      accountNumber,
      ...(row?.name ? { name: row.name } : {}),
      ...(row?.status ? { status: row.status } : {}),
    };
    note("accounts", row ? 1 : 0, true);
  } catch (err) {
    fail("accounts", err);
  }

  /* tickets --------------------------------------------------------- */
  let recentTickets: AccountContextTicket[] = [];
  try {
    const rows = ports
      .tickets(accountNumber)
      .filter((t) => t.accountNumber === accountNumber)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    recentTickets = rows.slice(0, ticketLimit).map((t) => ({
      id: t.id,
      number: t.number,
      status: t.status,
      ...(t.issueClassification ? { classification: t.issueClassification } : {}),
      ...(trim(t.details?.subject) ? { subject: trim(t.details.subject) } : {}),
      updatedAt: iso(t.updatedAt) ?? at,
      ...(iso(t.completedAt) ? { completedAt: iso(t.completedAt) } : {}),
      source: src("tickets", t.id),
    }));
    note("tickets", recentTickets.length, true, recentTickets[0]?.updatedAt);
  } catch (err) {
    fail("tickets", err);
  }

  /* work ------------------------------------------------------------ */
  let recentWork: AccountContextWork[] = [];
  try {
    const { logged, additional } = ports.work(accountNumber);
    const fromLog: AccountContextWork[] = logged
      .filter((w) => w.accountNumber === accountNumber)
      .map((w) => ({
        id: w.id,
        kind: "logged_time" as const,
        label: trim(w.label) ?? w.kind,
        startedAt: iso(w.startedAt) ?? at,
        endedAt: iso(w.endedAt) ?? at,
        durationMs: w.durationMs,
        source: src("work", w.id),
      }));
    const fromAdditional: AccountContextWork[] = additional
      .filter((w) => w.accountNumber === accountNumber)
      .map((w) => ({
        id: w.id,
        kind: "additional_work" as const,
        label: trim(w.title) ?? "Additional work",
        status: w.status,
        startedAt: iso(w.createdAt) ?? at,
        ...(iso(w.completedAt) ? { endedAt: iso(w.completedAt) } : {}),
        source: src("work", w.id),
      }));
    recentWork = [...fromLog, ...fromAdditional]
      .sort((a, b) => (b.endedAt ?? b.startedAt ?? "").localeCompare(a.endedAt ?? a.startedAt ?? ""))
      .slice(0, workLimit);
    note("work", recentWork.length, true, recentWork[0]?.endedAt ?? recentWork[0]?.startedAt);
  } catch (err) {
    fail("work", err);
  }

  /* change records --------------------------------------------------- */
  let recentChanges: AccountContextChange[] = [];
  let allChanges: AccountChangeRecord[] = [];
  try {
    allChanges = (await ports.changes(accountNumber)).filter(
      (c) => c.accountNumber === accountNumber,
    );
    recentChanges = allChanges
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, changeLimit)
      .map((c) => ({
        id: c.id,
        title: trim(c.title) ?? "Change record",
        changeType: c.changeType,
        status: c.status,
        risk: c.risk,
        ...(c.ticketNumber ? { ticketNumber: c.ticketNumber } : {}),
        ...(c.appliedAt ? { appliedAt: c.appliedAt } : {}),
        ...(c.verifiedAt ? { verifiedAt: c.verifiedAt } : {}),
        createdAt: c.createdAt,
        source: src("change_record", c.id),
      }));
    note("change_record", recentChanges.length, true, recentChanges[0]?.createdAt);
  } catch (err) {
    fail("change_record", err);
  }

  /* known fixes — verified outranks probable, nothing is invented ----- */
  const knownFixes: AccountContextFix[] = allChanges
    .filter((c) => c.status === "verified" || c.status === "applied")
    .map((c) => ({
      id: c.id,
      label: trim(c.title) ?? "Prior change",
      confidence: (c.status === "verified" ? "verified" : "probable") as "verified" | "probable",
      changeType: c.changeType,
      ...(c.ticketNumber ? { ticketNumber: c.ticketNumber } : {}),
      at: c.verifiedAt ?? c.appliedAt ?? c.createdAt,
      source: src("change_record", c.id),
    }))
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === "verified" ? -1 : 1;
      return b.at.localeCompare(a.at);
    })
    .slice(0, CONTEXT_LIMITS.fixes.max);

  /* coverage ---------------------------------------------------------- */
  let coverage: AccountContextCoverage | undefined;
  if (options.includeCoverage !== false) {
    try {
      const { watched, gaps } = ports.coverage(accountNumber);
      coverage = {
        watched: Boolean(watched),
        ...(watched?.onCallThrough ? { onCallThrough: watched.onCallThrough } : {}),
        ...(watched?.onCallNote ? { onCallNote: trim(watched.onCallNote) } : {}),
        gaps: gaps
          .filter((g) => g.accountNumber === accountNumber)
          .map((g) => ({
            kind: g.kind,
            label: trim(g.label) ?? g.kind,
            date: g.date,
            daysAway: g.daysAway,
            severity: String(g.severity),
          })),
        source: src("coverage", accountNumber),
      };
      identity.watched = coverage.watched;
      note("coverage", coverage.gaps.length, true);
    } catch (err) {
      fail("coverage", err);
    }
  }

  /* recurring patterns — deterministic, rule-based, no LLM ------------- */
  const recurringPatterns: AccountContextPattern[] = [];
  try {
    const row = ports.recurring(accountNumber);
    if (row && row.sixMonthCount > 0) {
      recurringPatterns.push({
        id: `recurring:${accountNumber}`,
        kind: "recurring_scripting_issues",
        label: `${row.rollingCount} scripting issues in the last 30 days (${row.sixMonthCount} in 6 months)`,
        count30d: row.rollingCount,
        count6m: row.sixMonthCount,
        ...(iso(row.lastIssueAt) ? { lastAt: iso(row.lastIssueAt) } : {}),
        active: row.active,
        source: src("tickets", accountNumber),
      });
    }
  } catch (err) {
    fail("tickets", err);
  }

  /* runbooks / knowledge — references only, never document bodies ------ */
  let runbooks: AccountContextRunbook[] = [];
  if (options.includeKnowledge !== false) {
    try {
      const notes = await ports.knowledge(accountNumber, identity.name);
      runbooks = notes.slice(0, knowledgeLimit).map((n) => ({
        id: n.id,
        title: trim(n.title) ?? "Untitled note",
        noteType: n.noteType,
        updatedAt: n.updatedAt,
        relevance: matchReason(n, accountNumber, identity.name),
        source: src("knowledge", n.id),
      }));
      note("knowledge", runbooks.length, true, runbooks[0]?.updatedAt);
    } catch (err) {
      fail("knowledge", err);
    }
  }

  /* dispatch ----------------------------------------------------------- */
  let recentDispatches: AccountContextDispatch[] = [];
  try {
    recentDispatches = ports
      .dispatch(accountNumber)
      .filter((d) => d.accountNumber === accountNumber)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, dispatchLimit)
      .map((d) => ({
        id: d.id,
        ...(d.status ? { status: d.status } : {}),
        ...(d.ticketNumber ? { ticketNumber: d.ticketNumber } : {}),
        updatedAt: iso(d.updatedAt) ?? at,
        ...(iso(d.completedAt) ? { completedAt: iso(d.completedAt) } : {}),
        source: src("dispatch", d.id),
      }));
    note("dispatch", recentDispatches.length, true, recentDispatches[0]?.updatedAt);
  } catch (err) {
    fail("dispatch", err);
  }

  /* warnings — reuse existing rule output, never a second engine -------- */
  const warnings: AccountContextWarning[] = [];
  try {
    for (const item of ports.awareness(accountNumber)) {
      warnings.push({
        id: item.id,
        severity: item.severity,
        label: trim(item.title) ?? item.type,
        source: src("awareness", item.id),
      });
    }
    note("awareness", warnings.length, true);
  } catch (err) {
    fail("awareness", err);
  }
  for (const gap of coverage?.gaps ?? []) {
    warnings.push({
      id: `coverage:${gap.kind}:${gap.date}`,
      severity: gap.severity === "critical" ? "critical" : "warning",
      label: gap.label,
      source: src("coverage", accountNumber),
    });
  }
  for (const change of recentChanges) {
    if (change.status === "applied" && !change.verifiedAt) {
      warnings.push({
        id: `change-unverified:${change.id}`,
        severity: "warning",
        label: `Applied but unverified change: ${change.title}`,
        source: src("change_record", change.id),
      });
    }
  }
  for (const pattern of recurringPatterns) {
    if (pattern.active) {
      warnings.push({
        id: `recurring:${accountNumber}`,
        severity: "warning",
        label: pattern.label,
        source: src("tickets", accountNumber),
      });
    }
  }

  return {
    account: identity,
    generatedAt: at,
    recentTickets,
    recentWork,
    recentChanges,
    knownFixes,
    ...(coverage ? { coverage } : {}),
    recurringPatterns,
    runbooks,
    recentDispatches,
    warnings,
    provenance: { generatedAt: at, sources: provenance },
    freshness: { generatedAt: at, sources: freshness },
    errors,
  };
}

/** Knowledge has no account foreign key — matches are by explicit mention. */
export function matchReason(
  note: Pick<KnowledgeNote, "title" | "tags">,
  accountNumber: string,
  accountName?: string,
): string {
  const title = note.title.toLowerCase();
  if (note.tags.some((t) => t.toLowerCase() === accountNumber.toLowerCase())) {
    return `Tagged ${accountNumber}`;
  }
  if (title.includes(accountNumber.toLowerCase())) return `Mentions account ${accountNumber}`;
  if (accountName && title.includes(accountName.toLowerCase())) {
    return `Mentions ${accountName}`;
  }
  return "Related note";
}

/** Does this Knowledge note reference the account at all? */
export function knowledgeMatchesAccount(
  note: Pick<KnowledgeNote, "title" | "tags" | "isArchived">,
  accountNumber: string,
  accountName?: string,
): boolean {
  if (note.isArchived) return false;
  const num = accountNumber.trim().toLowerCase();
  if (!num) return false;
  const title = note.title.toLowerCase();
  if (title.includes(num)) return true;
  if (note.tags.some((t) => t.toLowerCase() === num)) return true;
  const name = accountName?.trim().toLowerCase();
  return Boolean(name && name.length > 3 && title.includes(name));
}
