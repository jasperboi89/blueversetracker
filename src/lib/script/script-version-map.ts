/**
 * Phase 4 — row ⇄ domain mapping for `script_versions`.
 *
 * Kept out of the `.functions.ts` wrapper so server-function splitting cannot
 * strip it, and so the same mapper is usable in tests without a database.
 *
 * The table is append-only, so mapping is one-directional in practice: rows are
 * written once and read many times.
 */

import type { Json } from "@/integrations/supabase/types";
import type {
  ScriptAnalysis,
  ScriptComplexity,
  ScriptStructure,
  ScriptVersion,
} from "./script-contract";

export interface ScriptVersionRow {
  id: string;
  script_id: string;
  version_number: number;
  kind: string;
  title: string;
  content_fingerprint: string;
  structure_fingerprint: string;
  structure: unknown;
  complexity: unknown;
  ingested_at: string;
}

const EMPTY_STRUCTURE: ScriptStructure = {
  components: [],
  dependencies: [],
  unknowns: [],
  lineCount: 0,
  recognizedLines: 0,
};

const EMPTY_COMPLEXITY: ScriptComplexity = {
  componentCount: 0,
  branchCount: 0,
  dependencyCount: 0,
  unresolvedCount: 0,
  maxDepth: 0,
  cycleCount: 0,
  unknownCount: 0,
  coverage: 0,
  band: "simple",
  drivers: [],
};

/**
 * Tolerant of older rows: a row written by an earlier schema version must still
 * render rather than crash the history view.
 */
export function rowToVersion(row: ScriptVersionRow): ScriptVersion {
  const structure = (row.structure ?? {}) as Partial<ScriptStructure>;
  const complexity = (row.complexity ?? {}) as Partial<ScriptComplexity>;

  return {
    id: row.id,
    scriptId: row.script_id,
    versionNumber: row.version_number,
    kind: row.kind,
    title: row.title,
    contentFingerprint: row.content_fingerprint,
    structureFingerprint: row.structure_fingerprint,
    structure: { ...EMPTY_STRUCTURE, ...structure },
    complexity: { ...EMPTY_COMPLEXITY, ...complexity },
    ingestedAt: row.ingested_at,
  };
}

export function versionInsert(params: {
  operatorUserId: string;
  scriptId: string;
  versionNumber: number;
  kind: string;
  title: string;
  analysis: ScriptAnalysis;
}) {
  const { analysis } = params;
  return {
    operator_user_id: params.operatorUserId,
    script_id: params.scriptId,
    version_number: params.versionNumber,
    kind: params.kind,
    title: params.title.slice(0, 200),
    content_fingerprint: analysis.contentFingerprint,
    structure_fingerprint: analysis.structureFingerprint,
    // Denormalised counts so list views never have to parse the JSONB blobs.
    component_count: analysis.complexity.componentCount,
    dependency_count: analysis.complexity.dependencyCount,
    unknown_count: analysis.complexity.unknownCount,
    // Plain JSON-serialisable objects; cast satisfies the generated Json type.
    structure: analysis.structure as unknown as Json,
    complexity: analysis.complexity as unknown as Json,
  };
}
