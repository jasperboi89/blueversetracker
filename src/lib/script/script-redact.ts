/**
 * Phase 4 — safe script ingestion.
 *
 * Scripts are pasted by operators from live systems, so they can contain
 * credentials and caller/patient details that must not survive into derived
 * artefacts (structural history, radar observations, Copilot context, or the
 * event ledger). Redaction runs *before* any parsing, so no downstream stage
 * can ever observe the original secret.
 *
 * This is deliberately aggressive and lossy. A false positive costs an operator
 * one masked token in a derived view; a false negative persists a credential.
 */

export type RedactionCategory =
  | "credential"
  | "apiKey"
  | "phone"
  | "email"
  | "ssn"
  | "creditCard"
  | "dob";

interface Rule {
  category: RedactionCategory;
  pattern: RegExp;
  replace: string;
}

/**
 * Order matters: the specific structured identifiers run before the looser
 * numeric patterns so a card number is not first eaten by the phone rule.
 */
const RULES: Rule[] = [
  {
    category: "credential",
    // key/value forms: password = hunter2, "pwd": hunter2, token: abc
    pattern:
      /\b(pass(?:word|phrase|wd)?|secret|token|bearer|api[_-]?key|auth|credential)\b\s*[:=]\s*("[^"\n]*"|'[^'\n]*'|\S+)/gi,
    replace: "$1: [REDACTED:credential]",
  },
  {
    category: "apiKey",
    // long opaque strings that look like keys/JWTs rather than script identifiers
    pattern: /\b(?:sk|pk|rk|ey)[A-Za-z0-9_-]{18,}\b/g,
    replace: "[REDACTED:apiKey]",
  },
  {
    category: "creditCard",
    pattern: /\b(?:\d[ -]*?){13,16}\b/g,
    replace: "[REDACTED:creditCard]",
  },
  {
    category: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replace: "[REDACTED:ssn]",
  },
  {
    category: "phone",
    pattern: /(?:\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g,
    replace: "[REDACTED:phone]",
  },
  {
    category: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replace: "[REDACTED:email]",
  },
  {
    category: "dob",
    pattern: /\b(?:dob|date of birth|birth ?date)\b\s*[:=]?\s*[\d/.-]{6,10}/gi,
    replace: "[REDACTED:dob]",
  },
];

export interface RedactionResult {
  text: string;
  /** Hit counts by category — safe to persist and to put on an event. */
  counts: Record<string, number>;
  total: number;
}

/**
 * Strip secrets and personal identifiers from script text.
 *
 * Placeholders are left in place (rather than deleting the line) so line
 * numbers, structure and dependency edges stay faithful to the original.
 */
export function redactScript(input: string): RedactionResult {
  const counts: Record<string, number> = {};
  let text = input;

  for (const rule of RULES) {
    let hits = 0;
    text = text.replace(rule.pattern, (...args) => {
      hits += 1;
      // Only the credential rule uses a capture group in its replacement.
      return rule.category === "credential"
        ? rule.replace.replace("$1", String(args[1] ?? "value"))
        : rule.replace;
    });
    if (hits > 0) counts[rule.category] = hits;
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { text, counts, total };
}

/**
 * A short, safe excerpt for showing an operator *where* something is. Already
 * redacted input is assumed; the length cap is the second line of defence
 * against a whole record being smuggled through one long line.
 */
export function safeExcerpt(line: string, max: number): string {
  const collapsed = line.trim().replace(/\s+/g, " ");
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}
