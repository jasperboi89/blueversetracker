/**
 * Phase 9 — the single canonical read surface handed to workers.
 *
 * Workers never reach into stores themselves. An adapter builds a BOUNDED,
 * account-scoped, as-of-filtered snapshot and hands it in. That gives us three
 * properties for free:
 *
 *  - shared truth: every worker reads the same canonical projection;
 *  - cross-account isolation: filtering happens once, here;
 *  - temporal integrity: historical mode drops evidence recorded after `asOf`.
 */

import type { EvidenceKind, WorkerEvidenceRef } from "./worker-contract";

export interface CanonicalRecord {
  id: string;
  accountId?: string;
  /** ISO timestamp the record was recorded/observed at. */
  at?: string;
  /** Short, non-sensitive label. */
  label: string;
}

export interface CanonicalHypothesis extends CanonicalRecord {
  status: "proposed" | "supported" | "weakened" | "rejected" | "verified";
  strengthClass: "weak" | "moderate" | "strong";
  contradictionCount: number;
  verificationReopenedAt?: string;
}

export interface CanonicalInvestigation extends CanonicalRecord {
  status: "open" | "narrowing" | "concluded" | "closed";
  hypotheses: CanonicalHypothesis[];
  contradictions: string[];
  preparedTests: Array<CanonicalRecord & { utility: "high" | "medium" | "low"; discriminates: string[] }>;
  conclusion?: string;
}

export interface CanonicalAnomaly extends CanonicalRecord {
  kind: string;
  state: "active" | "resolved" | "insufficient_baseline";
  severity: "low" | "medium" | "high";
  baselineSamples: number;
}

export interface CanonicalForecast extends CanonicalRecord {
  type: string;
  state: "active" | "resolved" | "expired" | "insufficient_evidence";
  band: "typical" | "elevated" | "high" | "insufficient_evidence";
  horizonDays: number;
  evidenceQuality: "strong" | "moderate" | "weak" | "insufficient";
  comparableCount: number;
  windowEndsAt?: string;
}

export interface CanonicalComparableState extends CanonicalRecord {
  similarity: number;
  outcomeKey: string;
}

export interface CanonicalSimulation extends CanonicalRecord {
  scriptId: string;
  status: "complete" | "partial" | "truncated" | "insufficient_structure" | "invalid_scenario";
  confidence: "high" | "moderate" | "partial" | "insufficient";
  terminal?: string;
  pathLength: number;
  structureFingerprint?: string;
  liveTestRequired: true;
}

export interface CanonicalScriptStructure extends CanonicalRecord {
  scriptId: string;
  version: number;
  fingerprint: string;
  recognitionCoverage: number;
  componentCount: number;
}

export interface CanonicalResolution extends CanonicalRecord {
  verified: boolean;
  outcome: string;
}

export interface CanonicalKnowledgeNote extends CanonicalRecord {
  /** Raw body — sanitised as DATA before it reaches any worker prompt. */
  body: string;
  collection?: string;
}

export interface CanonicalSnapshot {
  now: string;
  accountId?: string;
  asOf?: string;
  investigations: CanonicalInvestigation[];
  anomalies: CanonicalAnomaly[];
  forecasts: CanonicalForecast[];
  comparableStates: CanonicalComparableState[];
  simulations: CanonicalSimulation[];
  scriptStructures: CanonicalScriptStructure[];
  patterns: CanonicalRecord[];
  resolutions: CanonicalResolution[];
  knowledgeNotes: CanonicalKnowledgeNote[];
  completedWork: CanonicalRecord[];
  changeRecords: CanonicalRecord[];
  ledgerEvents: CanonicalRecord[];
  /** Sources that could not be read this run — drives fail-soft degradation. */
  unavailableSources: EvidenceKind[];
}

export function emptySnapshot(now = new Date().toISOString()): CanonicalSnapshot {
  return {
    now,
    investigations: [],
    anomalies: [],
    forecasts: [],
    comparableStates: [],
    simulations: [],
    scriptStructures: [],
    patterns: [],
    resolutions: [],
    knowledgeNotes: [],
    completedWork: [],
    changeRecords: [],
    ledgerEvents: [],
    unavailableSources: [],
  };
}

/* ------------------------------------------------------------------ */
/* Scoping                                                             */
/* ------------------------------------------------------------------ */

function inScope<T extends CanonicalRecord>(rows: T[], accountId?: string, asOf?: string): T[] {
  return rows.filter((r) => {
    if (accountId && r.accountId && r.accountId !== accountId) return false;
    if (asOf && r.at && r.at > asOf) return false;
    return true;
  });
}

/**
 * Apply account scoping and the historical `asOf` boundary to a whole snapshot.
 * Called once by the Orchestrator; workers receive only the scoped result.
 */
export function scopeSnapshot(
  snapshot: CanonicalSnapshot,
  accountId?: string,
  asOf?: string,
): CanonicalSnapshot {
  const scoped: CanonicalSnapshot = {
    ...snapshot,
    ...(accountId ? { accountId } : {}),
    ...(asOf ? { asOf } : {}),
    investigations: inScope(snapshot.investigations, accountId, asOf).map((inv) => ({
      ...inv,
      hypotheses: inScope(inv.hypotheses, accountId, asOf),
      preparedTests: inScope(inv.preparedTests, accountId, asOf),
    })),
    anomalies: inScope(snapshot.anomalies, accountId, asOf),
    forecasts: inScope(snapshot.forecasts, accountId, asOf),
    comparableStates: inScope(snapshot.comparableStates, accountId, asOf),
    simulations: inScope(snapshot.simulations, accountId, asOf),
    scriptStructures: inScope(snapshot.scriptStructures, accountId, asOf),
    patterns: inScope(snapshot.patterns, accountId, asOf),
    resolutions: inScope(snapshot.resolutions, accountId, asOf),
    knowledgeNotes: inScope(snapshot.knowledgeNotes, accountId, asOf),
    completedWork: inScope(snapshot.completedWork, accountId, asOf),
    changeRecords: inScope(snapshot.changeRecords, accountId, asOf),
    ledgerEvents: inScope(snapshot.ledgerEvents, accountId, asOf),
  };
  return scoped;
}

export function refFor(
  kind: EvidenceKind,
  record: CanonicalRecord,
): WorkerEvidenceRef {
  return {
    kind,
    id: record.id,
    ...(record.accountId ? { accountId: record.accountId } : {}),
    label: record.label,
    ...(record.at ? { at: record.at } : {}),
  };
}

/** Bounded evidence selection (§36) — newest first, hard-capped. */
export function selectEvidence<T extends CanonicalRecord>(rows: T[], limit: number): T[] {
  return rows
    .slice()
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "") || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}
