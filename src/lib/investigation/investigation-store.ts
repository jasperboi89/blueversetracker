/**
 * Phase 8 — persisted investigations (Parts 22, 23, 24, 30, 50).
 *
 * Persists the STATE of reasoning — investigation ids, hypothesis ids/types,
 * strength classes, evidence references, prepared tests and their recorded
 * outcome keys. It never persists ticket bodies, notes, script source or model
 * output; canonical content stays in the systems that own it.
 *
 * The timeline is APPEND-ONLY: a hypothesis that was once believed and later
 * refuted keeps both entries, because "what did we believe, and why" is the
 * point of the record.
 */

import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import { eventSpine } from "@/lib/core/event-spine";
import type { AccEventType } from "@/lib/core/events";
import {
  HYPOTHESIS_CALC_VERSION,
  type Hypothesis,
  type HypothesisEvidenceLink,
  type Investigation,
  type InvestigationObservation,
  type InvestigationTimelineEntry,
} from "./hypothesis-contract";
import {
  addHypotheses,
  attemptVerification,
  createInvestigation,
  linkEvidence,
  prepareTests,
  recomputeInvestigation,
  recordTestResult,
  rejectHypothesis,
  type CreateInvestigationInput,
} from "./investigation-engine";

interface InvestigationState {
  byId: Record<string, Investigation>;
  /** accountId → investigation ids, newest first. */
  byAccount: Record<string, string[]>;
}

const DEFAULT: InvestigationState = { byId: {}, byAccount: {} };
const TIMELINE_MAX = 400;
const PER_ACCOUNT_MAX = 25;

const store = createPersistedStore<InvestigationState>("aih:investigations:v1", DEFAULT);

function emit(
  type: AccEventType,
  accountId: string,
  metadata: Record<string, string | number | boolean>,
) {
  try {
    eventSpine.emit({ type, source: "investigation", accountId, metadata });
  } catch (err) {
    console.warn("[investigation-store] emit failed", err);
  }
}

/**
 * Announce timeline entries as durable events. Only lifecycle-meaningful kinds
 * are emitted — recomputed strength that lands on the same class is silent, so
 * the ledger records reasoning milestones rather than churn.
 */
function announce(inv: Investigation, entries: InvestigationTimelineEntry[]) {
  for (const e of entries) {
    const base = { investigationId: inv.id, ...(e.hypothesisId ? { hypothesisId: e.hypothesisId } : {}) };
    switch (e.kind) {
      case "investigation_created":
        emit("investigation.opened", inv.accountId, {
          ...base,
          observations: inv.observations.length,
        });
        break;
      case "hypothesis_proposed": {
        const h = inv.hypotheses.find((x) => x.id === e.hypothesisId);
        emit("investigation.hypothesis_proposed", inv.accountId, {
          ...base,
          hypothesisType: h?.hypothesisType ?? "unknown",
          origin: h?.origin ?? "system_generated",
          strength: h?.strength ?? "unsupported",
        });
        break;
      }
      case "hypothesis_rejected":
        emit("investigation.hypothesis_rejected", inv.accountId, base);
        break;
      case "hypothesis_verified":
        emit("investigation.hypothesis_verified", inv.accountId, base);
        break;
      case "test_prepared": {
        const t = inv.tests.find((x) => x.id === e.testId);
        emit("investigation.test_prepared", inv.accountId, {
          investigationId: inv.id,
          testId: e.testId ?? "",
          utility: t?.utility.klass ?? "useful",
          distinguishes: t?.utility.hypothesesDistinguished ?? 0,
        });
        break;
      }
      case "test_result_recorded": {
        const t = inv.tests.find((x) => x.id === e.testId);
        emit("investigation.test_result_recorded", inv.accountId, {
          investigationId: inv.id,
          testId: e.testId ?? "",
          outcomeKey: t?.result?.outcomeKey ?? "",
          outcome: t?.result?.outcome ?? "inconclusive",
        });
        break;
      }
      default:
        break;
    }
  }
}

function persist(inv: Investigation, entries: InvestigationTimelineEntry[]): Investigation {
  const trimmed: Investigation = {
    ...inv,
    calcVersion: HYPOTHESIS_CALC_VERSION,
    timeline: inv.timeline.slice(-TIMELINE_MAX),
  };
  store.update((s) => {
    const ids = s.byAccount[trimmed.accountId] ?? [];
    const nextIds = ids.includes(trimmed.id)
      ? ids
      : [trimmed.id, ...ids].slice(0, PER_ACCOUNT_MAX);
    const dropped = ids.filter((id) => !nextIds.includes(id));
    const byId = { ...s.byId, [trimmed.id]: trimmed };
    for (const id of dropped) delete byId[id];
    return { byId, byAccount: { ...s.byAccount, [trimmed.accountId]: nextIds } };
  });
  announce(trimmed, entries);
  return trimmed;
}

export const investigationStore = {
  get: (id: string): Investigation | undefined => store.get().byId[id],

  forAccount: (accountId: string): Investigation[] =>
    (store.get().byAccount[accountId] ?? [])
      .map((id) => store.get().byId[id])
      .filter((x): x is Investigation => Boolean(x)),

  open(input: CreateInvestigationInput): Investigation {
    const { investigation, entries } = createInvestigation(input);
    return persist(investigation, entries);
  },

  addObservation(id: string, observation: InvestigationObservation): Investigation | undefined {
    const inv = store.get().byId[id];
    if (!inv) return undefined;
    const next = recomputeInvestigation({
      ...inv,
      observations: [...inv.observations, observation],
      timeline: [
        ...inv.timeline,
        {
          id: `${observation.recordedAt}:observation_added:${observation.id}`,
          kind: "observation_added",
          at: observation.recordedAt,
          summary: observation.statement,
          evidenceId: observation.id,
        },
      ],
    });
    return persist(next.investigation, next.entries);
  },

  proposeHypotheses(id: string, hypotheses: Hypothesis[]): Investigation | undefined {
    const inv = store.get().byId[id];
    if (!inv) return undefined;
    const r = addHypotheses(inv, hypotheses);
    return persist(r.investigation, r.entries);
  },

  linkEvidence(id: string, links: HypothesisEvidenceLink[]): Investigation | undefined {
    const inv = store.get().byId[id];
    if (!inv) return undefined;
    const r = linkEvidence(inv, links);
    return persist(r.investigation, r.entries);
  },

  prepareTests(
    id: string,
    options?: { prerequisites?: { label: string; available: boolean }[] },
  ): Investigation | undefined {
    const inv = store.get().byId[id];
    if (!inv) return undefined;
    const r = prepareTests(inv, {
      prerequisites: options?.prerequisites,
      structuralCoverage: inv.scriptContext?.recognition,
    });
    return persist(r.investigation, r.entries);
  },

  /** Operator-recorded outcome. Interpretation was fixed at preparation time. */
  recordTestResult(id: string, testId: string, outcomeKey: string, notes?: string) {
    const inv = store.get().byId[id];
    if (!inv) return undefined;
    const r = recordTestResult(inv, testId, outcomeKey, { notes });
    return persist(r.investigation, r.entries);
  },

  reject(id: string, hypothesisId: string, reason: string): Investigation | undefined {
    const inv = store.get().byId[id];
    if (!inv) return undefined;
    const r = rejectHypothesis(inv, hypothesisId, reason);
    return persist(r.investigation, r.entries);
  },

  /**
   * Operator-driven verification attempt. Returns the unmet requirements when
   * the canonical rule is not satisfied — it never verifies "close enough".
   */
  verify(
    id: string,
    hypothesisId: string,
    operatorConfirmed: boolean,
  ): { investigation?: Investigation; unmet: string[] } {
    const inv = store.get().byId[id];
    if (!inv) return { unmet: ["Investigation not found"] };
    const r = attemptVerification(inv, hypothesisId, { operatorConfirmed });
    if (r.unmet.length > 0) return { unmet: r.unmet };
    return { investigation: persist(r.investigation, r.entries), unmet: [] };
  },

  close(id: string): Investigation | undefined {
    const inv = store.get().byId[id];
    if (!inv) return undefined;
    const next: Investigation = { ...inv, status: "concluded", updatedAt: new Date().toISOString() };
    emit("investigation.closed", inv.accountId, {
      investigationId: inv.id,
      conclusion: inv.conclusion.kind,
      hypotheses: inv.hypotheses.length,
      tests: inv.tests.length,
    });
    return persist(next, []);
  },
};

export function useInvestigations(accountId?: string): Investigation[] {
  const state = useStoreValue(store, DEFAULT);
  if (!accountId) return Object.values(state.byId);
  return (state.byAccount[accountId] ?? [])
    .map((id) => state.byId[id])
    .filter((x): x is Investigation => Boolean(x));
}

if (typeof window !== "undefined") {
  attachCloudSync<InvestigationState>({
    storeKey: "investigations",
    subscribe: store.subscribe,
    getSnapshot: () => store.get(),
    applyServerSnapshot: (next) => store.applyServerSnapshot(next),
    isEmpty: (s) => Object.keys(s.byId).length === 0,
  });
}
