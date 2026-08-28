/**
 * Phase 4 — Script Intelligence & Dependency Cortex: contracts.
 *
 * The single typed vocabulary for reasoning about IS scripts. Nothing in this
 * module executes, deploys, or mutates a script; Phase 4 autonomy is capped at
 * OBSERVE / EXPLAIN / RECOMMEND / PREPARE.
 *
 * Two hard boundaries this contract exists to enforce:
 *
 * 1. **Honesty about parsing.** IS scripts are an operator-authored DSL with no
 *    published grammar. The extractor recognises a bounded set of constructs
 *    and records everything else as an explicit `ScriptUnknown` rather than
 *    silently dropping it or guessing. Downstream intelligence must degrade its
 *    confidence when unknowns are present — see `coverageFor`.
 * 2. **No content leakage into the Event Spine.** Script bodies, credentials
 *    and caller/patient details never reach `operational_event_ledger`. Ledger
 *    events reference `scriptId` / `versionId` / fingerprints and counts only.
 */

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

/**
 * What a recognised chunk of a script *is*. Deliberately coarse: these map to
 * how an operator talks about a script, not to a parser's AST node types.
 */
export const SCRIPT_COMPONENT_KINDS = [
  "section",
  "prompt",
  "branch",
  "action",
  "variable",
  "calculation",
  "transfer",
  "message",
  "field",
  "include",
] as const;

export type ScriptComponentKind = (typeof SCRIPT_COMPONENT_KINDS)[number];

export interface ScriptComponent {
  /** Stable within a version: `${kind}:${normalized name}`. */
  id: string;
  kind: ScriptComponentKind;
  /** Operator-facing identifier as written in the script (redacted). */
  name: string;
  /** Lowercased, whitespace-collapsed name — the key dependencies resolve on. */
  key: string;
  /** 1-based line where the component was recognised. */
  line: number;
  /** How many times this component appears across the script. */
  occurrences: number;
}

/* ------------------------------------------------------------------ */
/* Dependencies                                                        */
/* ------------------------------------------------------------------ */

/**
 * How one component depends on another. `references` is the deliberate
 * catch-all for "these are clearly related but the relationship is not one we
 * can name with confidence".
 */
export const SCRIPT_DEPENDENCY_KINDS = [
  "branches_to",
  "calls",
  "includes",
  "reads",
  "writes",
  "transfers_to",
  "references",
] as const;

export type ScriptDependencyKind = (typeof SCRIPT_DEPENDENCY_KINDS)[number];

/** Whether the target was found in this script or points outside it. */
export type ScriptDependencyResolution = "internal" | "external" | "unresolved";

export interface ScriptDependency {
  id: string;
  kind: ScriptDependencyKind;
  /** Component id of the dependent (the "from" side). */
  fromId: string;
  /** Component key of the dependency target (the "to" side). */
  toKey: string;
  /** Component id of the target when it resolved inside this script. */
  toId?: string;
  resolution: ScriptDependencyResolution;
  line: number;
}

/* ------------------------------------------------------------------ */
/* Unknown / unsupported constructs                                    */
/* ------------------------------------------------------------------ */

/**
 * Why the extractor could not classify a line. These are surfaced to the
 * operator verbatim — an unparsed script is a *known* gap, never a silent one.
 */
export const SCRIPT_UNKNOWN_REASONS = [
  "unrecognized_construct",
  "ambiguous_reference",
  "unbalanced_delimiter",
  "truncated_line",
  "unsupported_syntax",
] as const;

export type ScriptUnknownReason = (typeof SCRIPT_UNKNOWN_REASONS)[number];

export interface ScriptUnknown {
  line: number;
  reason: ScriptUnknownReason;
  /** Short redacted excerpt so the operator can find the line. Never full source. */
  excerpt: string;
}

/* ------------------------------------------------------------------ */
/* Structure + complexity                                              */
/* ------------------------------------------------------------------ */

export interface ScriptStructure {
  components: ScriptComponent[];
  dependencies: ScriptDependency[];
  unknowns: ScriptUnknown[];
  /** Lines the extractor read (post-normalization). */
  lineCount: number;
  /** Lines it positively classified. */
  recognizedLines: number;
}

/**
 * Interpretable complexity. Every field is a plain count an operator can check
 * by eye — no opaque 0–100 "score" that cannot be argued with. `band` is a
 * summary of those counts, not an independent judgement.
 */
export interface ScriptComplexity {
  componentCount: number;
  branchCount: number;
  dependencyCount: number;
  unresolvedCount: number;
  maxDepth: number;
  cycleCount: number;
  unknownCount: number;
  /** 0–1 share of lines the extractor understood. */
  coverage: number;
  band: ScriptComplexityBand;
  /** Human-readable drivers, highest contribution first. */
  drivers: string[];
}

export type ScriptComplexityBand = "simple" | "moderate" | "involved" | "intricate";

/* ------------------------------------------------------------------ */
/* Versions                                                            */
/* ------------------------------------------------------------------ */

export interface ScriptVersion {
  id: string;
  scriptId: string;
  versionNumber: number;
  kind: string;
  title: string;
  /** Hash of redacted, normalized content — changes when any character changes. */
  contentFingerprint: string;
  /** Hash of components + dependencies only — stable across cosmetic edits. */
  structureFingerprint: string;
  structure: ScriptStructure;
  complexity: ScriptComplexity;
  ingestedAt: string;
}

/** What ingestion produces before it is persisted. */
export interface ScriptAnalysis {
  contentFingerprint: string;
  structureFingerprint: string;
  structure: ScriptStructure;
  complexity: ScriptComplexity;
  /** Redaction hits removed during safe ingestion, by category. */
  redactions: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Confidence                                                          */
/* ------------------------------------------------------------------ */

/**
 * Extraction coverage gates how strongly downstream intelligence may speak.
 * Below `MIN_TRUSTED_COVERAGE` the analysis is explicitly partial and every
 * consumer must say so.
 */
export const MIN_TRUSTED_COVERAGE = 0.6;

export function coverageFor(structure: ScriptStructure): number {
  if (structure.lineCount <= 0) return 1;
  return Math.min(1, structure.recognizedLines / structure.lineCount);
}

export function isPartialAnalysis(structure: ScriptStructure): boolean {
  return coverageFor(structure) < MIN_TRUSTED_COVERAGE || structure.unknowns.length > 0;
}

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

/**
 * Bounded everywhere. A pasted 50k-line script must not be able to stall the
 * UI thread or push an unbounded JSON blob into the versions table.
 */
export const SCRIPT_LIMITS = {
  maxLines: 4000,
  maxLineLength: 600,
  maxComponents: 800,
  maxDependencies: 2000,
  maxUnknowns: 200,
  maxExcerpt: 120,
  maxImpactNodes: 300,
} as const;

export function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

export function componentId(kind: ScriptComponentKind, name: string): string {
  return `${kind}:${normalizeKey(name)}`;
}
