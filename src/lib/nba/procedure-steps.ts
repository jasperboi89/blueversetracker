/**
 * Phase 14 — procedure decomposition.
 *
 * Curated Knowledge and Resolution Memory often describe reusable steps in
 * prose. This module extracts a *temporary structured interpretation* so the
 * engine can reason about which steps remain unverified. It never rewrites the
 * source: derivation is recorded, and parsed structure is treated as inferred.
 */

import type { ContextEvidence } from "@/lib/core/portal-context";
import { actionFingerprint } from "./nba-contract";

export type ProcedureStepStatus =
  | "completed"
  | "remaining"
  | "not_applicable"
  | "blocked"
  | "unknown";

export interface ProcedureStep {
  id: string;
  /** Stable fingerprint shared with the candidate action for this step. */
  fingerprint: string;
  index: number;
  label: string;
  /** True when the step reads/verifies rather than changes something. */
  verification: boolean;
  /** Where the structure came from — parsed prose is never treated as canon. */
  derivation: "structured" | "parsed" | "inferred";
  sourceType: string;
  sourceId: string;
  status: ProcedureStepStatus;
}

export interface ProcedureInterpretation {
  sourceId: string;
  sourceType: string;
  title?: string;
  steps: ProcedureStep[];
  /** Guidance older than its domain window: follow only after re-verification. */
  stale: boolean;
  superseded: boolean;
  confidence: "verified" | "probable" | "unknown";
  derivation: "structured" | "parsed" | "inferred";
}

const STEP_SPLIT = /(?:\r?\n|(?<=[.;])\s+(?=\d+[.)]\s)|\s*(?:→|->|;)\s*)/g;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s*/;

const MUTATION_WORDS =
  /\b(restart|reboot|change|update|delete|remove|create|rebuild|reset|apply|enable|disable|send|dispatch|modify|set)\b/i;
const VERIFY_WORDS = /\b(verify|check|confirm|review|compare|inspect|look\s?up|validate|ensure)\b/i;

function cleanStep(raw: string): string {
  return raw.replace(BULLET, "").replace(/\s+/g, " ").trim();
}

/** Deterministic prose -> steps. Returns [] when no step-like structure exists. */
export function parseProcedureSteps(text: string): string[] {
  if (!text) return [];
  const parts = text
    .split(STEP_SPLIT)
    .map(cleanStep)
    .filter((s) => s.length >= 4 && s.length <= 160);
  // A single sentence is prose, not a procedure.
  const stepLike = parts.filter((p) => VERIFY_WORDS.test(p) || MUTATION_WORDS.test(p));
  return stepLike.length >= 2 ? stepLike.slice(0, 8) : [];
}

export interface InterpretOptions {
  /** Fingerprints already established in this episode. */
  completedChecks?: readonly string[];
  /** Fingerprints that cannot proceed right now. */
  blockedFingerprints?: readonly string[];
}

/**
 * Interpret one piece of guidance evidence. Only knowledge, runbook and
 * resolution evidence can define procedure structure.
 */
export function interpretProcedure(
  evidence: ContextEvidence,
  options: InterpretOptions = {},
): ProcedureInterpretation | null {
  if (!["knowledge", "runbook", "resolution"].includes(evidence.sourceType)) return null;
  const labels = parseProcedureSteps(evidence.summary ?? "");
  if (!labels.length) return null;

  const completed = new Set(options.completedChecks ?? []);
  const blocked = new Set(options.blockedFingerprints ?? []);

  const steps: ProcedureStep[] = labels.map((label, index) => {
    const verification = VERIFY_WORDS.test(label) || !MUTATION_WORDS.test(label);
    const fingerprint = actionFingerprint(verification ? "VERIFY" : "PREPARE_ACTION", label);
    const status: ProcedureStepStatus = completed.has(fingerprint)
      ? "completed"
      : blocked.has(fingerprint)
        ? "blocked"
        : "remaining";
    return {
      id: `${evidence.sourceType}:${evidence.sourceId}#${index}`,
      fingerprint,
      index,
      label,
      verification,
      derivation: "parsed",
      sourceType: evidence.sourceType,
      sourceId: evidence.sourceId,
      status,
    };
  });

  return {
    sourceId: evidence.sourceId,
    sourceType: evidence.sourceType,
    title: evidence.title,
    steps,
    stale: evidence.freshness === "stale" || evidence.freshness === "historical",
    superseded: Boolean(evidence.superseded) || evidence.freshness === "superseded",
    confidence: evidence.confidence ?? "unknown",
    derivation: "parsed",
  };
}

export function interpretProcedures(
  evidence: readonly ContextEvidence[],
  options: InterpretOptions = {},
): ProcedureInterpretation[] {
  const out: ProcedureInterpretation[] = [];
  for (const e of evidence) {
    const p = interpretProcedure(e, options);
    if (p) out.push(p);
  }
  return out;
}