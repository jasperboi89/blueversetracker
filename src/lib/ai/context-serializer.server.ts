import type { ContextBudget } from "@/lib/ai/router/task-types";
import { trimEvidence, activeEntityIds } from "@/lib/core/context-priority";
import type { ContextEvidence, PortalContextEnvelope } from "@/lib/core/portal-context";

/**
 * Portal Context -> Copilot prompt sections (Phase 10 §16).
 *
 * Clearly delimited bounded sections — never one free-form blob — and every
 * section obeys the Task/Model Router's context budget. The router stays
 * authoritative; this module only decides how much of the already-safe
 * projection fits and in what order.
 */

export interface SerializedContext {
  text: string;
  evidenceIncluded: number;
  evidenceTrimmed: number;
  contextChars: number;
  truncated: boolean;
  sections: string[];
  accountContextIncluded: boolean;
  retrievalUsed: boolean;
  degraded: boolean;
}

function line(label: string, value: string | undefined | false): string | null {
  return value ? `${label}: ${value}` : null;
}

function evidenceLine(e: ContextEvidence, index: number): string {
  const bits = [
    `${index + 1}. [${e.sourceType}:${e.sourceId}]`,
    e.title ? `"${e.title}"` : "",
    `— ${e.summary}`,
    `(origin ${e.origin}`,
    e.confidence ? `, confidence ${e.confidence}` : "",
    e.freshness ? `, ${e.freshness}` : "",
    e.status ? `, status ${e.status}` : "",
    ")",
  ];
  return bits.filter(Boolean).join(" ").replace(/ \(/, " (").replace(/\( /, "(");
}

export function serializeEnvelope(
  env: PortalContextEnvelope,
  budget: ContextBudget,
): SerializedContext {
  const sections: string[] = [];

  /* CURRENT WORK — what the operator is doing right now. */
  const current: string[] = [
    `Location: ${env.location.area}/${env.location.routeId} (${env.location.label})`,
  ];
  const a = env.active;
  if (a.ticket) {
    current.push(
      `Active ticket: ${a.ticket.id}${a.ticket.label ? ` — ${a.ticket.label}` : ""}${a.ticket.onScreen ? " (on screen)" : " (working context, operator navigated away)"}`,
    );
  }
  if (a.account) {
    current.push(
      `Active account: ${a.account.id}${a.account.name ? ` (${a.account.name})` : ""} [origin ${a.account.origin}]`,
    );
  }
  if (a.workItem) current.push(`Active work item: ${a.workItem.id}${a.workItem.title ? ` — ${a.workItem.title}` : ""}`);
  if (a.dispatch) current.push(`Active dispatch session: ${a.dispatch.id}`);
  if (a.knowledgeNote) {
    current.push(
      `Knowledge Vault note selected: ${a.knowledgeNote.id}${a.knowledgeNote.title ? ` — "${a.knowledgeNote.title}"` : ""}${a.knowledgeNote.status ? ` (${a.knowledgeNote.status})` : ""}. The note body is NOT included; use a tool if you need it.`,
    );
  }
  const w = env.workState;
  current.push(
    `Timer: ${w.running ? `running${w.elapsedMs ? ` (${Math.round(w.elapsedMs / 60000)} min)` : ""}` : w.paused ? "paused" : "not running"}`,
  );
  if (w.unsavedChanges) {
    current.push(
      `Unsaved changes present on: ${w.unsavedEntities.join(", ")}. The draft content is deliberately withheld — you may mention the unsaved state, never its contents.`,
    );
  }
  current.push(`Shift: ${env.shiftKey}`);
  sections.push(`## CURRENT WORK\n${current.filter(Boolean).join("\n")}`);

  /* KNOWN CONTEXT — authoritative or retrieved facts. */
  const known: string[] = [];
  if (env.recentActivity.length && budget.allowShiftContext) {
    known.push(
      `Recent shift activity:\n${env.recentActivity
        .slice(0, 6)
        .map((x) => `- ${x.kind}: ${x.label}${x.complete ? " (complete)" : ""} @ ${x.at}`)
        .join("\n")}`,
    );
  }
  const accountContextIncluded = Boolean(env.accountContext && budget.allowAccountContext);
  if (env.accountContext && accountContextIncluded) {
    known.push(
      `Account context (${env.accountContext.freshness}, generated ${env.accountContext.generatedAt}):\n${env.accountContext.summary}`,
    );
    if (env.accountContext.unavailable.length) {
      known.push(
        `Account context sources unavailable: ${env.accountContext.unavailable.join(", ")} — unknown, not empty.`,
      );
    }
  }
  if (known.length) sections.push(`## KNOWN CONTEXT\n${known.join("\n\n")}`);

  /* EVIDENCE — bounded, prioritised, provenance preserved. */
  const { kept, dropped } = trimEvidence(env.evidence, budget.maxEvidenceItems, activeEntityIds(env));
  if (kept.length) {
    sections.push(
      [
        "## EVIDENCE",
        "Potentially relevant material, not conclusions. Historical or superseded items must never be presented as current.",
        ...kept.map(evidenceLine),
      ].join("\n"),
    );
  }

  /* WARNINGS / BLOCKERS */
  const alerts: string[] = [];
  for (const b of env.blockers) alerts.push(`- BLOCKER ${b.type}: ${b.label} (since ${b.since})`);
  for (const s of env.awareness) alerts.push(`- ${s.severity.toUpperCase()}: ${s.message}`);
  for (const wn of env.warnings) alerts.push(`- ${wn.code}${wn.source ? ` (${wn.source})` : ""}: ${wn.message}`);
  if (alerts.length) sections.push(`## WARNINGS / BLOCKERS\n${alerts.join("\n")}`);

  /* INFERENCES — only facts already labelled as inference. */
  const inferred = [
    a.account?.origin === "inferred"
      ? `- Account ${a.account.id} is associated with the current work by navigation history, not confirmed by the record.`
      : null,
    ...env.evidence
      .filter((e) => e.origin === "inferred" || e.origin === "uncertain")
      .slice(0, 3)
      .map((e) => `- ${e.title ?? e.sourceId}: ${e.summary} (${e.origin})`),
  ].filter(Boolean) as string[];
  if (inferred.length) sections.push(`## INFERENCES\n${inferred.join("\n")}`);

  let text = sections.join("\n\n");
  let truncated = false;
  if (text.length > budget.maxContextChars) {
    text = `${text.slice(0, Math.max(0, budget.maxContextChars - 1))}…`;
    truncated = true;
  }

  return {
    text,
    evidenceIncluded: kept.length,
    evidenceTrimmed: dropped,
    contextChars: text.length,
    truncated,
    sections: sections.map((s) => s.split("\n")[0].replace(/^##\s*/, "")),
    accountContextIncluded,
    retrievalUsed: env.evidence.some((e) => e.origin === "retrieved"),
    degraded: env.warnings.some((x) => x.code === "context_degraded" || x.code === "source_unavailable"),
  };
}

const AGGREGATE_KEY: keyof SerializedContext = "text";
void AGGREGATE_KEY;
