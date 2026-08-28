import { useEffect, useMemo } from "react";
import { useAccountContext } from "./use-account-context";
import { useLedgerState, queryLedger, type LedgerEntry } from "./event-ledger";
import { detectPatterns, type PatternInput, type PatternObservation } from "./pattern-intelligence";
import { buildAccountTimeline, type TimelineInput, type TimelineItem } from "./account-timeline";
import { accountCortexStore } from "./account-cortex-store";
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

  return { observations, timeline, whatFixed };
}

export interface AccountIntelligence extends AccountIntelligenceResult {
  loading: boolean;
  hasPack: boolean;
}

export function useAccountIntelligence(accountNumber: string): AccountIntelligence {
  const { pack, loading } = useAccountContext(accountNumber, { includeKnowledge: false });
  const ledgerState = useLedgerState();

  const result = useMemo<AccountIntelligence>(() => {
    if (!pack) return { loading, hasPack: false, observations: [], timeline: [], whatFixed: [] };
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
  }, [accountNumber, result.hasPack, result.observations]);

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
  const { observations, timeline, whatFixed } = assembleAccountIntel(
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
