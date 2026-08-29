/**
 * Paired-field value encoding for the Twin renderer. A name/phone pair holds its
 * two halves in a single model value joined by U+001F (unit separator) — an
 * interior detail that never leaves the twin.
 */

const PAIR_SEP = String.fromCharCode(0x1f);

export function splitPair(v: string | undefined): [string, string] {
  const [a = "", b = ""] = (v ?? "").split(PAIR_SEP);
  return [a, b];
}

export function joinPair(a: string, b: string): string {
  return `${a}${PAIR_SEP}${b}`;
}
