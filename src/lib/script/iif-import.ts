/**
 * Activation 4 — the safe IIF ingestion pipeline.
 *
 * Single entry point from operator input to a canonical, provenanced script
 * structure. Ordering is a security property, not a style choice:
 *
 *   validate → normalize → REDACT → parse → map → fingerprint → provenance
 *
 * Redaction runs before the parser sees a single character, so no component
 * name, dependency key, unknown excerpt, coverage sample, fingerprint or
 * AI-bound payload derived from this pipeline can contain a credential or
 * caller/patient detail. `safeText` is the ONLY text this module exposes, and
 * it is post-redaction by construction.
 *
 * Autonomy: OBSERVE / EXPLAIN / RECOMMEND / PREPARE. Import records structure.
 * It never modifies, deploys, executes or writes back to any IS system.
 */

import { contentFingerprint, normalizeScriptContent, structureFingerprint } from "./script-fingerprint";
import { redactScript } from "./script-redact";
import { computeComplexity } from "./script-complexity";
import { parseIif } from "./iif-parse";
import { mapRecordsToStructure } from "./iif-map";
import {
  IIF_IMPORTER_VERSION,
  IIF_LIMITS,
  type IifDialect,
  type IifImportResult,
  type IifProvenance,
} from "./iif-contract";
import type { ScriptComplexity } from "./script-contract";

export interface IifImportInput {
  fileName: string;
  /** Raw file text as read from disk or pasted. */
  text: string;
  /** Byte size when known; falls back to the text length. */
  sizeBytes?: number;
  /** Operator override when detection is wrong. Detection is used otherwise. */
  dialect?: IifDialect;
  /** Injectable for deterministic tests. */
  now?: Date;
}

/** Control characters that indicate a binary payload rather than script text. */
const BINARY = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export function importIif(input: IifImportInput): IifImportResult {
  const raw = input.text ?? "";
  const sizeBytes = input.sizeBytes ?? raw.length;

  /* -------- 1. validate before anything touches the content -------- */

  if (sizeBytes > IIF_LIMITS.maxBytes) {
    return {
      accepted: false,
      reason: "too_large",
      detail: `File is ${(sizeBytes / 1_000_000).toFixed(1)} MB; the limit is ${
        IIF_LIMITS.maxBytes / 1_000_000
      } MB. Split the export and import each part.`,
    };
  }
  if (raw.trim().length === 0) {
    return { accepted: false, reason: "empty_file", detail: "The file contains no text." };
  }
  if (raw.includes("\uFFFD")) {
    return {
      accepted: false,
      reason: "unreadable_encoding",
      detail:
        "This file could not be decoded as UTF-8 text \u2014 it appears to use a binary format that this importer does not currently support. If your Amtelco IS toolset can re-export the script as plain text (tab-delimited, CSV, or XML), import that instead.",
    };
  }
  if (BINARY.test(raw.slice(0, 20_000))) {
    return {
      accepted: false,
      reason: "binary_content",
      detail:
        "This file appears to use a binary format that this importer does not currently support, so nothing was parsed. If your Amtelco IS toolset can re-export the script as plain text (tab-delimited, CSV, or XML), import that instead.",
    };
  }

  /* -------- 2. normalize, then redact BEFORE parsing -------- */

  const normalized = normalizeScriptContent(raw);
  const redaction = redactScript(normalized);
  const safeText = redaction.text;

  /* -------- 3. parse + map the redacted text -------- */

  const parsed = parseIif(safeText, input.dialect);
  const { structure, coverage } = mapRecordsToStructure(parsed);

  const provenance: IifProvenance = {
    fileName: sanitizeFileName(input.fileName),
    fileSizeBytes: sizeBytes,
    contentFingerprint: contentFingerprint(safeText),
    dialect: parsed.dialect,
    importerVersion: IIF_IMPORTER_VERSION,
    importedAt: (input.now ?? new Date()).toISOString(),
    lineCount: parsed.lineCount,
    recordCount: parsed.records.length,
    redactions: redaction.counts,
    validatedAgainstRealExport: false,
  };

  return {
    accepted: true,
    provenance,
    structure,
    coverage,
    unknowns: structure.unknowns,
    safeText,
    structureFingerprint: structureFingerprint(structure),
  };
}

/** Interpretable complexity for an imported structure, reusing Phase 4 scoring. */
export function complexityForImport(result: IifImportResult): ScriptComplexity | null {
  return result.accepted ? computeComplexity(result.structure) : null;
}

/**
 * File names are operator-supplied and end up on screen and in provenance, so
 * strip path separators and control characters and cap the length.
 */
function sanitizeFileName(name: string): string {
  return (name || "untitled")
    .replace(/[\\/]/g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F<>"']/g, "")
    .trim()
    .slice(0, 160) || "untitled";
}

/**
 * Duplicate detection for a candidate import against already-recorded versions.
 * Identical content is a re-import; identical structure with different content
 * is a cosmetic revision worth telling the operator about before they record a
 * new version.
 */
export function classifyAgainstExisting(
  candidate: { contentFingerprint: string; structureFingerprint: string },
  existing: ReadonlyArray<{ contentFingerprint: string; structureFingerprint: string; versionNumber: number }>,
): { kind: "new" | "duplicate" | "cosmetic_revision"; matchedVersion?: number } {
  const exact = existing.find((v) => v.contentFingerprint === candidate.contentFingerprint);
  if (exact) return { kind: "duplicate", matchedVersion: exact.versionNumber };
  const sameShape = existing.find((v) => v.structureFingerprint === candidate.structureFingerprint);
  if (sameShape) return { kind: "cosmetic_revision", matchedVersion: sameShape.versionNumber };
  return { kind: "new" };
}
