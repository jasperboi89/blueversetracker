/**
 * Safe projections of the Account Context Pack.
 *
 * The AI layer never receives raw records — only short, bounded,
 * operator-visible facts with their source labelled.
 */
import type { AccountContextPack } from "./account-context";

const MAX_CHARS = 2400;

/** Compact text projection for Copilot / focus prompts. */
export function toCopilotAccountContext(pack: AccountContextPack): string {
  const lines: string[] = [];
  const name = pack.account.name ? ` ${pack.account.name}` : "";
  lines.push(`ACCOUNT ${pack.account.accountNumber}${name}`);

  if (pack.warnings.length) {
    lines.push("Warnings:");
    for (const w of pack.warnings.slice(0, 5)) lines.push(`- [${w.severity}] ${w.label}`);
  }
  if (pack.recentTickets.length) {
    lines.push("Recent tickets:");
    for (const t of pack.recentTickets.slice(0, 6)) {
      lines.push(
        `- #${t.number} ${t.status}${t.classification ? ` · ${t.classification}` : ""}${t.subject ? ` · ${t.subject}` : ""}`,
      );
    }
  }
  if (pack.recentChanges.length) {
    lines.push("Recent changes:");
    for (const c of pack.recentChanges.slice(0, 4)) {
      lines.push(`- ${c.title} (${c.changeType}, ${c.status}, risk ${c.risk})`);
    }
  }
  if (pack.knownFixes.length) {
    lines.push("Known fixes:");
    for (const f of pack.knownFixes.slice(0, 4)) {
      const origin = f.kind === "resolution" ? "resolution memory" : "change record";
      lines.push(
        `- [${f.confidence} · ${origin}]${f.problem ? ` ${f.problem} →` : ""} ${f.label}`,
      );
    }
  }
  if (pack.recurringPatterns.length) {
    lines.push("Patterns:");
    for (const p of pack.recurringPatterns) lines.push(`- ${p.label}`);
  }
  if (pack.coverage && (pack.coverage.watched || pack.coverage.gaps.length)) {
    const cov = pack.coverage;
    lines.push(
      `Coverage: ${cov.watched ? "watched" : "not watched"}${cov.onCallThrough ? `, on-call through ${cov.onCallThrough}` : ""}${cov.gaps.length ? `, ${cov.gaps.length} gap(s)` : ""}`,
    );
  }
  if (pack.recentWork.length) {
    lines.push("Recent work:");
    for (const w of pack.recentWork.slice(0, 4)) lines.push(`- ${w.label}`);
  }
  if (pack.runbooks.length) {
    lines.push("Related notes:");
    for (const r of pack.runbooks.slice(0, 4)) lines.push(`- ${r.title} (${r.relevance})`);
  }
  if (pack.errors.length) {
    lines.push(
      `Context gaps: ${pack.errors.map((e) => e.source).join(", ")} unavailable — treat as unknown, not empty.`,
    );
  }
  lines.push(`Context assembled ${pack.generatedAt}.`);

  const out = lines.join("\n");
  return out.length > MAX_CHARS ? `${out.slice(0, MAX_CHARS)}\n…(truncated)` : out;
}
