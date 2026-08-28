/**
 * Phase 4 — deterministic script fingerprints.
 *
 * Two distinct hashes, because they answer two different operator questions:
 *
 * - `contentFingerprint` — "is this byte-for-byte the script I already have?"
 *   Used for idempotent ingestion (the unique index on `script_versions`).
 * - `structureFingerprint` — "did the *shape* change, or just the wording?"
 *   Retyping a prompt's text leaves it untouched; adding a branch changes it.
 *
 * Synchronous FNV-1a double-hash, matching `resolutionFingerprint`. These are
 * change-detection fingerprints, not a security primitive — `crypto.subtle` is
 * async and would force every call site to become a promise for no benefit.
 */

import type { ScriptStructure } from "./script-contract";

function fnv(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

/**
 * Normalize away things that are not meaningful changes: line endings, trailing
 * whitespace, and blank-line runs. An operator reformatting indentation should
 * not manufacture a new version.
 */
export function normalizeScriptContent(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function contentFingerprint(normalized: string): string {
  return fnv(normalized);
}

/**
 * Hash of the extracted shape only. Sorted so extraction order can never make
 * an unchanged script look changed.
 */
export function structureFingerprint(structure: ScriptStructure): string {
  const components = structure.components
    .map((c) => `${c.kind}|${c.key}`)
    .sort()
    .join("\n");
  const dependencies = structure.dependencies
    .map((d) => `${d.kind}|${d.fromId}|${d.toKey}|${d.resolution}`)
    .sort()
    .join("\n");
  return fnv(`C:${components}\nD:${dependencies}`);
}
