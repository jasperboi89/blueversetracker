/**
 * Activation 4 — Amtelco IIF ingestion contracts.
 *
 * IS script exports (`.iif` and friends) are a vendor interchange format with
 * no published grammar available to this project. That fact is encoded in the
 * types rather than papered over:
 *
 * - Every construct the importer claims to understand is declared up front in
 *   {@link IIF_CONSTRUCTS} with an explicit {@link IifSupport} level. Nothing is
 *   silently "handled".
 * - Anything outside that registry becomes an `unrecognized` construct in the
 *   coverage report and a `ScriptUnknown` in the structure. Unparsed input is a
 *   reported gap, never a dropped line.
 * - `validatedAgainstRealExport` is hard-coded `false` on every provenance
 *   record. It stays false until a real Amtelco export has been run through the
 *   importer and the dialect confirmed. Downstream surfaces must show that.
 *
 * Autonomy is unchanged: OBSERVE / EXPLAIN / RECOMMEND / PREPARE. Nothing here
 * modifies, deploys, executes, or writes back to any IS system.
 */

import type { ScriptComponentKind, ScriptStructure, ScriptUnknown } from "./script-contract";

/** Bumped whenever recognition behaviour changes, so provenance stays honest. */
export const IIF_IMPORTER_VERSION = "activation4.1";

/* ------------------------------------------------------------------ */
/* Dialects                                                            */
/* ------------------------------------------------------------------ */

/**
 * The shapes observed in Amtelco/IS-adjacent exports. Detection is a *guess
 * about layout*, never about semantics — a mis-detected file yields unknowns,
 * not invented structure.
 */
export const IIF_DIALECTS = ["tab_records", "ini_sections", "xml_elements", "unknown"] as const;
export type IifDialect = (typeof IIF_DIALECTS)[number];

export const DIALECT_LABELS: Record<IifDialect, string> = {
  tab_records: "Tab-delimited records (!HDR rows)",
  ini_sections: "Bracketed sections with key = value",
  xml_elements: "Single-line XML-style elements",
  unknown: "Unrecognised layout",
};

/* ------------------------------------------------------------------ */
/* Support levels                                                      */
/* ------------------------------------------------------------------ */

/**
 * - `recognized` — the construct is parsed and mapped to a script component.
 * - `partial` — the line is located and counted, but its meaning is not mapped
 *   (it becomes context, not graph structure).
 * - `unrecognized` — not understood at all; recorded as an unknown.
 */
export type IifSupport = "recognized" | "partial" | "unrecognized";

export interface IifConstructSpec {
  /** Normalised record type as it appears in the file, lowercased. */
  id: string;
  dialects: readonly IifDialect[];
  label: string;
  support: IifSupport;
  /** Canonical component kind this maps to, when it maps at all. */
  mapsTo: ScriptComponentKind | null;
  note: string;
}

/**
 * The declared recognition surface. Adding a row here is the ONLY way to make
 * the importer understand a new construct — the mapper reads this registry, so
 * the coverage report and the parser can never drift apart.
 */
export const IIF_CONSTRUCTS: readonly IifConstructSpec[] = [
  {
    id: "script",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Script container",
    support: "recognized",
    mapsTo: "section",
    note: "Top-level script or page container.",
  },
  {
    id: "section",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Section / page / screen",
    support: "recognized",
    mapsTo: "section",
    note: "Grouping node operators navigate between.",
  },
  {
    id: "prompt",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Prompt / question",
    support: "recognized",
    mapsTo: "prompt",
    note: "Text read to or asked of the caller.",
  },
  {
    id: "field",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Data field",
    support: "recognized",
    mapsTo: "field",
    note: "Captured value on the form.",
  },
  {
    id: "variable",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Variable",
    support: "recognized",
    mapsTo: "variable",
    note: "Named value assigned or read within the script.",
  },
  {
    id: "branch",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Branch / condition",
    support: "recognized",
    mapsTo: "branch",
    note: "Conditional routing node. The condition expression itself is not evaluated.",
  },
  {
    id: "action",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Action / task",
    support: "recognized",
    mapsTo: "action",
    note: "Step the script performs. Never executed by this importer.",
  },
  {
    id: "calculation",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Calculation",
    support: "recognized",
    mapsTo: "calculation",
    note: "Derived value. The formula is recorded structurally, not computed.",
  },
  {
    id: "transfer",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Transfer / dispatch",
    support: "recognized",
    mapsTo: "transfer",
    note: "Hand-off to another destination.",
  },
  {
    id: "message",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Message / delivery",
    support: "recognized",
    mapsTo: "message",
    note: "Outbound message definition.",
  },
  {
    id: "include",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Include / linked script",
    support: "recognized",
    mapsTo: "include",
    note: "Reference to another script or shared module.",
  },
  {
    id: "comment",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Comment / annotation",
    support: "partial",
    mapsTo: null,
    note: "Located and counted; carries no structural meaning.",
  },
  {
    id: "metadata",
    dialects: ["tab_records", "ini_sections", "xml_elements"],
    label: "Export metadata",
    support: "partial",
    mapsTo: null,
    note: "Version/date/author headers. Recorded as provenance context only.",
  },
];

const BY_ID = new Map(IIF_CONSTRUCTS.map((c) => [c.id, c]));

export function constructFor(typeId: string): IifConstructSpec | undefined {
  return BY_ID.get(typeId);
}

/**
 * Vendor type names observed in the wild, folded onto registry ids. Aliases are
 * layout synonyms only — never a semantic guess about an unfamiliar node.
 */
export const IIF_TYPE_ALIASES: Readonly<Record<string, string>> = {
  page: "section",
  screen: "section",
  form: "section",
  folder: "section",
  group: "section",
  question: "prompt",
  ask: "prompt",
  say: "prompt",
  input: "field",
  answer: "field",
  var: "variable",
  set: "variable",
  assign: "variable",
  if: "branch",
  cond: "branch",
  condition: "branch",
  decision: "branch",
  exec: "action",
  task: "action",
  step: "action",
  do: "action",
  calc: "calculation",
  formula: "calculation",
  compute: "calculation",
  dispatch: "transfer",
  route: "transfer",
  connect: "transfer",
  msg: "message",
  page_out: "message",
  notify: "message",
  import: "include",
  link: "include",
  subscript: "include",
  rem: "comment",
  note: "comment",
  header: "metadata",
  hdr: "metadata",
  export: "metadata",
  info: "metadata",
};

export function canonicalType(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/^!+/, "");
  return IIF_TYPE_ALIASES[key] ?? key;
}

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/**
 * Where an imported structure came from. Every field is derived from the file
 * itself — nothing is supplied by the operator, so provenance cannot be
 * back-dated or relabelled after the fact.
 */
export interface IifProvenance {
  fileName: string;
  fileSizeBytes: number;
  /** Fingerprint of the REDACTED, normalised text. Never of raw secrets. */
  contentFingerprint: string;
  dialect: IifDialect;
  importerVersion: string;
  importedAt: string;
  lineCount: number;
  recordCount: number;
  /** Redaction hits removed before parsing, by category. */
  redactions: Record<string, number>;
  /**
   * Always false. Flips only after the importer has been exercised against a
   * genuine Amtelco export and the dialect confirmed by an operator.
   */
  validatedAgainstRealExport: false;
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

export interface IifConstructCoverage {
  typeId: string;
  label: string;
  support: IifSupport;
  count: number;
  /** How many of those became components in the dependency graph. */
  mappedCount: number;
  /** First line where this construct appeared — a jump-to hint. */
  firstLine: number;
}

export interface IifCoverageReport {
  dialect: IifDialect;
  lineCount: number;
  recognizedLines: number;
  /** 0–1 share of non-blank lines the parser positively classified. */
  lineCoverage: number;
  recordCount: number
  mappedComponentCount: number;
  unknownCount: number;
  constructs: IifConstructCoverage[];
  /** Construct ids seen in the file that are NOT in the registry. */
  unrecognizedTypes: string[];
  /** Plain-language statements of what this import does and does not know. */
  limitations: string[];
}

/* ------------------------------------------------------------------ */
/* Import result                                                       */
/* ------------------------------------------------------------------ */

export const IIF_REJECTION_REASONS = [
  "empty_file",
  "too_large",
  "binary_content",
  "unreadable_encoding",
] as const;

export type IifRejectionReason = (typeof IIF_REJECTION_REASONS)[number];

export interface IifImportRejected {
  accepted: false;
  reason: IifRejectionReason;
  detail: string;
}

export interface IifImportAccepted {
  accepted: true;
  provenance: IifProvenance;
  structure: ScriptStructure;
  coverage: IifCoverageReport;
  unknowns: ScriptUnknown[];
  /** Redacted, normalised text — safe to fingerprint, display, or send to AI. */
  safeText: string;
  /** Structural fingerprint, for duplicate + drift detection. */
  structureFingerprint: string;
}

export type IifImportResult = IifImportAccepted | IifImportRejected;

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

/** A pasted or dropped export must never be able to stall the UI thread. */
export const IIF_LIMITS = {
  maxBytes: 4_000_000,
  maxLines: 20_000,
  maxFieldsPerRecord: 60,
  maxValueLength: 400,
  maxUnrecognizedTypes: 40,
} as const;
