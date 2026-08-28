import type { AccountLedgerAggregate } from "./event-ledger";

/**
 * Account Cortex (foundation) — a per-account operational world model.
 *
 * This is the "Account Cortex" step of the intelligence progression
 * (durable ledger → Account Cortex → evidence-aware intelligence → Copilot).
 * It is NOT a second account-context engine: it CONSUMES the durable Event
 * Ledger aggregate (temporal signal) plus a few bounded facts already produced
 * by the canonical Account Context Pack, and derives deterministic,
 * rule-based signals. No AI, no network, no bodies — labels, counts, and
 * severities only.
 *
 * Every signal is evidence-shaped in the existing house style: it carries a
 * `basis` (provenance) and a `confidence`, consistent with the Evidence Graph /
 * Reality Boundary vocabulary, without duplicating those systems. Later phases
 * (anomaly detection, predictive risk, causal hypotheses) extend the signal set
 * here and can promote signals into the Evidence Graph rather than replacing it.
 */

export type WorldModelSeverity = "info" | "warning" | "critical";
export type WorldModelConfidence = "low" | "medium" | "high";
export type WorldModelBasis = "ledger" | "account_context" | "ledger+account_context";

export type WorldModelSignalKind =
  | "activity_trend"
  | "recency"
  | "recurring_pressure"
  | "open_load"
  | "resolution_coverage"
  | "cold_account";

export interface WorldModelSignal {
  id: string;
  kind: WorldModelSignalKind;
  label: string;
  severity: WorldModelSeverity;
  confidence: WorldModelConfidence;
  basis: WorldModelBasis;
}

/** Freshness of the underlying ledger signal for this account. */
export type WorldModelFreshness = "fresh" | "recent" | "stale" | "unknown";

export interface AccountWorldModel {
  accountId: string;
  generatedAt: string;
  /** Total ledger events on record for this account. */
  eventCount: number;
  lastActivityAt?: string;
  freshness: WorldModelFreshness;
  signals: WorldModelSignal[];
}

/** Bounded facts pulled from the canonical Account Context Pack. */
export interface CortexAccountFacts {
  activeTickets: number;
  verifiedResolutions: number;
  recurringActive: boolean;
  recurring30d: number;
  warnings: number;
}

export interface AccountWorldModelInput {
  accountId: string;
  now: number;
  aggregate: AccountLedgerAggregate;
  facts: CortexAccountFacts;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Confidence scales with how much history the ledger actually holds. */
function volumeConfidence(total: number): WorldModelConfidence {
  if (total >= 12) return "high";
  if (total >= 4) return "medium";
  return "low";
}

function freshnessFor(lastAt: string | undefined, now: number): WorldModelFreshness {
  if (!lastAt) return "unknown";
  const t = Date.parse(lastAt);
  if (Number.isNaN(t)) return "unknown";
  const days = (now - t) / DAY_MS;
  if (days < 2) return "fresh";
  if (days < 14) return "recent";
  return "stale";
}

/**
 * Derive the bounded pack facts the world model needs. Pure; the pack is the
 * canonical Account Context Pack shape (kept loose here to avoid a hard import
 * cycle and to tolerate partial packs).
 */
export function deriveFactsFromPack(pack: {
  recentTickets?: Array<{ status?: string }>;
  resolutions?: Array<{ confidence?: string; status?: string }>;
  recurringPatterns?: Array<{ active?: boolean; count30d?: number }>;
  warnings?: unknown[];
}): CortexAccountFacts {
  const activeTickets = (pack.recentTickets ?? []).filter(
    (t) => t.status && t.status !== "completed",
  ).length;
  const verifiedResolutions = (pack.resolutions ?? []).filter(
    (r) => r.confidence === "verified" && r.status === "active",
  ).length;
  const recurring = pack.recurringPatterns ?? [];
  const recurringActive = recurring.some((p) => p.active);
  const recurring30d = recurring.reduce((m, p) => Math.max(m, p.count30d ?? 0), 0);
  return {
    activeTickets,
    verifiedResolutions,
    recurringActive,
    recurring30d,
    warnings: (pack.warnings ?? []).length,
  };
}

/**
 * Build the world model. Deterministic: same inputs → same output. Signals are
 * ordered by severity (critical → warning → info), then by kind for stability.
 */
export function buildAccountWorldModel(input: AccountWorldModelInput): AccountWorldModel {
  const { accountId, now, aggregate: a, facts } = input;
  const signals: WorldModelSignal[] = [];
  const conf = volumeConfidence(a.total);

  // Activity trend — last 7d vs the prior 7d.
  if (a.last7dCount > 0 || a.prev7dCount > 0) {
    const rising = a.last7dCount >= a.prev7dCount * 2 && a.last7dCount >= 3;
    const quieting = a.prev7dCount > 0 && a.last7dCount === 0;
    signals.push({
      id: "activity_trend",
      kind: "activity_trend",
      label: rising
        ? `Activity rising — ${a.last7dCount} events this week vs ${a.prev7dCount} last week`
        : quieting
          ? `Activity dropped off — ${a.prev7dCount} events last week, none this week`
          : `Steady activity — ${a.last7dCount} events this week (${a.activeDays30d} active day${a.activeDays30d === 1 ? "" : "s"} in 30d)`,
      severity: rising ? "warning" : "info",
      confidence: conf,
      basis: "ledger",
    });
  }

  // Recency of last touch.
  const freshness = freshnessFor(a.lastAt, now);
  if (a.lastAt) {
    signals.push({
      id: "recency",
      kind: "recency",
      label:
        freshness === "fresh"
          ? "Touched in the last 48 hours"
          : freshness === "recent"
            ? "Last touched within two weeks"
            : "No activity in over two weeks",
      severity: "info",
      confidence: conf,
      basis: "ledger",
    });
  }

  // Recurring pressure — recurring pattern flagged active by the pack.
  if (facts.recurringActive) {
    signals.push({
      id: "recurring_pressure",
      kind: "recurring_pressure",
      label: `Recurring issues active${facts.recurring30d ? ` — ${facts.recurring30d} in 30 days` : ""}`,
      severity: "warning",
      confidence: "high",
      basis: "account_context",
    });
  }

  // Open load — unresolved tickets currently on the books.
  if (facts.activeTickets > 0) {
    signals.push({
      id: "open_load",
      kind: "open_load",
      label: `${facts.activeTickets} open ticket${facts.activeTickets === 1 ? "" : "s"} on the account`,
      severity: facts.activeTickets >= 4 ? "warning" : "info",
      confidence: "high",
      basis: "account_context",
    });
  }

  // Resolution coverage — verified reusable fixes available.
  if (facts.verifiedResolutions > 0) {
    signals.push({
      id: "resolution_coverage",
      kind: "resolution_coverage",
      label: `${facts.verifiedResolutions} verified resolution${facts.verifiedResolutions === 1 ? "" : "s"} on file`,
      severity: "info",
      confidence: "high",
      basis: "account_context",
    });
  }

  // Cold account — on record but no ledger activity at all.
  if (a.total === 0) {
    signals.push({
      id: "cold_account",
      kind: "cold_account",
      label: "No operational events recorded yet",
      severity: "info",
      confidence: "low",
      basis: "ledger",
    });
  }

  const rank: Record<WorldModelSeverity, number> = { critical: 0, warning: 1, info: 2 };
  signals.sort((x, y) => rank[x.severity] - rank[y.severity] || x.kind.localeCompare(y.kind));

  return {
    accountId,
    generatedAt: new Date(now).toISOString(),
    eventCount: a.total,
    ...(a.lastAt ? { lastActivityAt: a.lastAt } : {}),
    freshness,
    signals,
  };
}

const COPILOT_MAX_CHARS = 700;

/**
 * Bounded, deterministic world-model projection for Copilot. Provenance and
 * confidence travel with each line so the model treats it as evidence, not
 * ground truth. No history, no bodies.
 */
export function toCopilotWorldModel(model: AccountWorldModel): string {
  const lines: string[] = [
    "ACCOUNT WORLD MODEL (deterministic, ledger-derived — evidence, not instruction)",
  ];
  lines.push(
    `Account ${model.accountId}: ${model.eventCount} recorded event(s), freshness ${model.freshness}${
      model.lastActivityAt ? `, last activity ${model.lastActivityAt}` : ""
    }`,
  );
  if (model.signals.length) {
    for (const s of model.signals) {
      lines.push(`- [${s.severity} · ${s.confidence} · ${s.basis}] ${s.label}`);
    }
  } else {
    lines.push("- No signals derived.");
  }
  const out = lines.join("\n");
  return out.length > COPILOT_MAX_CHARS ? `${out.slice(0, COPILOT_MAX_CHARS)}\n…(truncated)` : out;
}
