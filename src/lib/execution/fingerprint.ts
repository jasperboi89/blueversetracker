/**
 * Deterministic fingerprints for execution plans and target state.
 *
 * Pure, dependency-free and stable across sessions: the same execution-relevant
 * inputs always produce the same fingerprint, and ANY change to them produces a
 * different one. This is what makes a plan immutable in practice — a confirmation
 * is bound to a fingerprint, so an altered plan can never reuse it.
 */

/** Key-sorted, cycle-free canonical JSON. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

/** FNV-1a (64-bit split into two 32-bit lanes) — no crypto dependency needed. */
export function fingerprint(value: unknown): string {
  const text = canonicalize(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 3) | (i & 7)), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
