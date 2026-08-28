/**
 * Phase 4 — safe script ingestion pipeline.
 *
 * The single entry point that turns pasted script text into a `ScriptAnalysis`.
 * Ordering is a security property, not a style choice:
 *
 *   normalize → REDACT → extract → fingerprint → complexity
 *
 * Redaction runs before extraction so no component name, dependency key or
 * unknown-line excerpt can ever contain a credential or caller detail. Every
 * downstream Phase 4 artefact derives from the redacted text.
 */

import type { ScriptAnalysis } from "./script-contract";
import { contentFingerprint, normalizeScriptContent, structureFingerprint } from "./script-fingerprint";
import { extractStructure } from "./script-extract";
import { computeComplexity } from "./script-complexity";
import { redactScript } from "./script-redact";

export function ingestScript(rawSource: string): ScriptAnalysis {
  const normalized = normalizeScriptContent(rawSource ?? "");
  const redaction = redactScript(normalized);

  const structure = extractStructure(redaction.text);
  const complexity = computeComplexity(structure);

  return {
    // Fingerprint the redacted text: two scripts differing only in a redacted
    // secret are the same script structurally, and we must not hash a secret.
    contentFingerprint: contentFingerprint(redaction.text),
    structureFingerprint: structureFingerprint(structure),
    structure,
    complexity,
    redactions: redaction.counts,
  };
}
