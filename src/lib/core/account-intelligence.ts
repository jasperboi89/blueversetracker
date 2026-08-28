import { useEffect, useMemo } from "react";
import { useAccountContext } from "./use-account-context";
import { useLedgerState, queryLedger, type LedgerEntry } from "./event-ledger";
import { detectPatterns, type PatternInput, type PatternObservation } from "./pattern-intelligence";
import { buildAccountTimeline, type TimelineInput, type TimelineItem } from "./account-timeline";
import { accountCortexStore } from "./account-cortex-store";
import { detectAnomalies, type AnomalyResult } from "./anomaly-engine";
import { anomalyStore } from "./anomaly-store";
import { ledgerCategory } from "./ledger-events";
import { buildWhatFixedThis, type WhatFixedThisResult } from "@/lib/resolution/what-fixed-this";
import type { AccEventType } from "./events";
import type { AccountContextPack } from "./account-context";
import type { ResolutionMemory } from "@/lib/resolution/resolution-types";
import { planIncludes, type RetrievalPlan } from "@/lib/ai/copilot-retrieval";

/**
 * Account Intelligence assembler (Phase 3) — connects the pure engines
 * (pattern-intelligence, account-timeline, what-fixed-this) to the canonical
 * Account Context Pack + durable ledger for one account. It creates no new
 * data source: the pack is already loaded by `useAccountContext`, and the
 * ledger is read from the local durable cache.
 *
 * Conservative by design: only pattern types the pack supports well fire
 * (repeated-issue, change/incident temporal proximity). Repeated-work,
 * resolution-reuse, escalation and reopen need signals the pack does not yet
 * carry, so they stay dormant here (foundation) rather than mis-firing.
 */

function parseMs(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export interface AccountIntelligenceResult {
  observations: PatternObservation[];
  timeline: TimelineItem[];
  whatFixed: WhatFixedThisResult[];
  /** Phase 5 — deviations from baseline plus explicit "still learning" states. */
  anomalies: AnomalyResult;
  /** Phase 6 — comparable-state outlook plus explicit evidence gaps. */
  forecasts: ForecastResult;
  /** Phase 6 — bounded input the forecast evaluator re-grades against. */
  forecastInput: ForecastInput;
}

/** Pure assembly from a loaded pack + ledger slice. Deterministic. */
export function assembleAccountIntel(
  accountNumber: string,
  pack: AccountContextPack,
  ledger: LedgerEntry[],
  now: number,
): AccountIntelligenceResult {
  const patternInput: PatternInput = {
    accountId: accountNumber,
    now,
    ledger: ledger.map((e) => ({
      id: e.id,
      type: e.type,
      ...(e.ticketId ? { ticketId: e.ticketId } : {}),
      ...(e.workItemId ? { workItemId: e.workItemId } : {}),
      atMs: parseMs(e.timestamp),
    })),
    tickets: pack.recentTickets.map((t) => ({
      id: t.id,
      number: t.number,
      status: t.status,
      ...(t.classification ? { classification: t.classification } : {}),
      createdAtMs: parseMs(t.updatedAt),
      updatedAtMs: parseMs(t.updatedAt),
    })),
    changes: pack.recentChanges.map((c) => ({
      id: c.id,
      title: c.title,
      ...(c.appliedAt ? { appliedAtMs: parseMs(c.appliedAt) } : {}),
    })),
    // Foundation: work-type / reuse / escalation signals are not yet in the
    // pack, so those detectors stay dormant rather than mis-firing.
    work: [],
    resolutions: [],
  };
  const observations = detectPatterns(patternInput);

  const timelineInput: TimelineInput = {
    accountId: accountNumber,
    tickets: pack.recentTickets.map((t) => ({
      id: t.id,
      number: t.number,
      status: t.status,
      ...(t.subject ? { subject: t.subject } : {}),
      atMs: parseMs(t.updatedAt),
    })),
    changes: pack.recentChanges.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      atMs: c.appliedAt ? parseMs(c.appliedAt) : parseMs(c.createdAt),
    })),
    resolutions: pack.resolutions.map((r) => ({
      id: r.id,
      problem: r.problem,
      confidence: r.confidence,
      atMs: parseMs(r.updatedAt),
    })),
    work: pack.recentWork.map((w) => ({
      id: w.id,
      label: w.label,
      kind: w.kind,
      atMs: parseMs(w.startedAt ?? w.endedAt),
    })),
    ledger: ledger.map((e) => ({
      id: e.id,
      type: e.type,
      ...(ledgerCategory(e.type as AccEventType)
        ? { category: ledgerCategory(e.type as AccEventType) }
        : {}),
      atMs: parseMs(e.timestamp),
      ...(e.ticketId ? { ticketId: e.ticketId } : {}),
      ...(typeof e.metadata?.label === "string" ? { label: e.metadata.label } : {}),
    })),
  };
  const timeline = buildAccountTimeline(timelineInput);

  const memories: ResolutionMemory[] = pack.resolutions.map((r) => ({
    id: r.id,
    accountNumber,
    accountName: pack.account.name ?? "",
    problem: r.problem,
    rootCause: "",
    resolution: r.resolutionSummary,
    testing: "",
    rollback: "",
    affectedArea: r.affectedArea ?? "",
    confidence: r.confidence,
    source: r.sourceRefs,
    status: r.status,
    createdAt: r.updatedAt,
    updatedAt: r.updatedAt,
  }));
  const whatFixed = buildWhatFixedThis({ accountNumber, memories });

  // Phase 5 — anomaly detection over the same canonical inputs. Robust
  // baselines only; when history is thin the engine returns baseline gaps
  // instead of inventing a finding.
  const anomalies = detectAnomalies({
    accountId: accountNumber,
    now,
    events: patternInput.ledger.map((e) => ({
      id: e.id,
      type: e.type,
      ...(e.ticketId ? { ticketId: e.ticketId } : {}),
      atMs: e.atMs,
    })),
    tickets: patternInput.tickets.map((t) => ({
      id: t.id,
      ...(t.classification ? { classification: t.classification } : {}),
      status: t.status,
      ...(t.createdAtMs ? { createdAtMs: t.createdAtMs } : {}),
      ...(t.updatedAtMs ? { updatedAtMs: t.updatedAtMs } : {}),
    })),
    changes: patternInput.changes.map((c) => ({
      id: c.id,
      ...(c.title ? { title: c.title } : {}),
      ...(typeof c.appliedAtMs === "number" ? { appliedAtMs: c.appliedAtMs } : {}),
    })),
    durations: pack.recentWork
      .map((w) => {
        const start = parseMs(w.startedAt);
        const end = parseMs(w.endedAt);
        return {
          id: w.id,
          ...(w.kind ? { kind: w.kind } : {}),
          ...(w.label ? { label: w.label } : {}),
          durationMs: start && end && end > start ? end - start : 0,
          atMs: end || start,
        };
      })
      .filter((d) => d.durationMs > 0),
  });

  return { observations, timeline, whatFixed, anomalies };
}

export interface AccountIntelligence extends AccountIntelligenceResult {
  loading: boolean;
  hasPack: boolean;
}

export function useAccountIntelligence(accountNumber: string): AccountIntelligence {
  const { pack, loading } = useAccountContext(accountNumber, { includeKnowledge: false });
  const ledgerState = useLedgerState();

  const result = useMemo<AccountIntelligence>(() => {
    if (!pack)
      return {
        loading,
        hasPack: false,
        observations: [],
        timeline: [],
        whatFixed: [],
        anomalies: { anomalies: [], baselineGaps: [], generatedAt: new Date(0).toISOString() },
      };
    const ledger = queryLedger({ accountId: accountNumber, limit: 500 }, ledgerState);
    return {
      loading,
      hasPack: true,
      ...assembleAccountIntel(accountNumber, pack, ledger, Date.now()),
    };
  }, [pack, ledgerState, accountNumber, loading]);

  useEffect(() => {
    if (!result.hasPack) return;
    try {
      accountCortexStore.evaluate(accountNumber, result.observations);
    } catch {
      /* persistence is best-effort */
    }
    try {
      anomalyStore.evaluate(accountNumber, result.anomalies);
    } catch {
      /* persistence is best-effort */
    }
  }, [accountNumber, result.hasPack, result.observations, result.anomalies]);

  return result;
}

const INTEL_MAX_CHARS = 1400;

/**
 * Bounded, question-driven projection of account intelligence for Copilot
 * (Phase 3, Part 8). Only the blocks the retrieval plan selected are assembled,
 * so relevance rises without the prompt growing without bound. Deterministic and
 * evidence-flavoured; never chain-of-thought.
 */
export function toCopilotIntel(
  accountNumber: string,
  pack: AccountContextPack,
  ledger: LedgerEntry[],
  plan: RetrievalPlan,
  now: number,
): string {
  const { observations, timeline, whatFixed, anomalies } = assembleAccountIntel(
    accountNumber,
    pack,
    ledger,
    now,
  );
  const parts: string[] = [];

  if (planIncludes(plan, "patterns") && observations.length) {
    parts.push(
      "OBSERVED PATTERNS (deterministic; temporal association, not causation):\n" +
        observations
          .slice(0, 4)
          .map((o) => `- [${o.confidence}] ${o.title} — ${o.description}`)
          .join("\n"),
    );
  }
  if (planIncludes(plan, "patterns")) {
    if (anomalies.anomalies.length) {
      parts.push(
        "ANOMALIES vs BASELINE (deviation only; never a cause):\n" +
          anomalies.anomalies
            .slice(0, 3)
            .map(
              (a) =>
                `- [${a.severity}/${a.confidence}] ${a.title} — observed ${a.deviation.observed} vs typical ${a.baseline.median} (${a.baseline.metric})`,
            )
            .join("\n"),
      );
    } else if (anomalies.baselineGaps.length) {
      parts.push(
        "BASELINE STATUS: insufficient history to judge deviation for " +
          anomalies.baselineGaps.map((g) => g.anomalyType).join(", ") +
          ". Say the baseline is still forming rather than implying behavior is normal.",
      );
    }
  }
  if (planIncludes(plan, "resolutions") && whatFixed.length) {
    parts.push(
      "WHAT FIXED THIS BEFORE (investigative evidence, verify before applying):\n" +
        whatFixed
          .slice(0, 4)
          .map((r) => `- [${r.verification} · ${r.basis}] ${r.problem} → ${r.resolution}`)
          .join("\n"),
    );
  }
  if (planIncludes(plan, "timeline") && timeline.length) {
    parts.push(
      "RECENT TIMELINE:\n" +
        timeline
          .slice(0, 6)
          .map((t) => `- ${t.atIso.slice(0, 10)} ${t.title} (${t.provenance})`)
          .join("\n"),
    );
  }
  if (planIncludes(plan, "changes")) {
    const changes = pack.recentChanges.slice(0, 4);
    if (changes.length) {
      parts.push(
        "RECENT CHANGES:\n" +
          changes.map((c) => `- ${c.title} (${c.changeType}, ${c.status})`).join("\n"),
      );
    }
  }

  const out = parts.join("\n\n");
  return out.length > INTEL_MAX_CHARS ? `${out.slice(0, INTEL_MAX_CHARS)}\n…(truncated)` : out;
}
