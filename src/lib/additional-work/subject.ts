import { SUBJECT_STARTERS } from "@/lib/settings/subject-presets-store";

export interface SubjectAccount {
  accountNumber?: string;
  accountName?: string;
}

export interface SubjectParts {
  /** Starter label including its trailing separator, e.g. "Client change — " */
  label: string;
  /** The free-text / AI-summarised remainder. */
  body: string;
}

/** "1042 · Acme Dental — " (empty when no account is set). */
export function accountPrefix({ accountNumber, accountName }: SubjectAccount): string {
  const num = (accountNumber ?? "").trim();
  const name = (accountName ?? "").trim();
  if (!num && !name) return "";
  const head = num && name ? `${num} · ${name}` : num || name;
  return `${head} — `;
}

/** Remove any leading account prefix (the current one, or a stale one). */
export function stripAccountPrefix(value: string, account: SubjectAccount = {}): string {
  let v = value ?? "";
  const current = accountPrefix(account);
  if (current && v.startsWith(current)) return v.slice(current.length);
  // Stale prefix from a previously selected account. Only strip heads that look
  // like an account: "<number> · <name> — " or a bare "<number> — ".
  return v.replace(/^\s*[A-Za-z0-9-]{1,20}(?:\s·\s[^—]{1,80})?\s—\s(?=\S)/, "");
}

/** Split the non-prefix portion into a starter label and the remaining body. */
export function splitLabel(rest: string): SubjectParts {
  const match = SUBJECT_STARTERS.find((s) => rest.startsWith(s));
  if (match) return { label: match, body: rest.slice(match.length) };
  return { label: "", body: rest };
}

export function parseSubject(value: string, account: SubjectAccount = {}): SubjectParts {
  return splitLabel(stripAccountPrefix(value, account));
}

export function buildSubject(
  account: SubjectAccount,
  parts: { label?: string; body?: string },
): string {
  return `${accountPrefix(account)}${parts.label ?? ""}${parts.body ?? ""}`;
}

/** Re-apply the current account prefix to a subject, replacing any stale one. */
export function withAccountPrefix(value: string, account: SubjectAccount): string {
  const { label, body } = parseSubject(value, account);
  if (!label && !body) return "";
  return buildSubject(account, { label, body });
}
