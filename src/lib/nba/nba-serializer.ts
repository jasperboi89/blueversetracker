/**
 * Phase 14 — bounded Copilot section for the Next-Best-Action state.
 *
 * Deterministic text only: the model receives the *result* of the engine, so
 * it never has to reconstruct workflow state from raw context, and it can
 * never talk its way past the Recommendation Gate.
 */

import type { NbaResult } from "./nba-contract";

const MAX_CHARS = 1400;

export function serializeNextBestAction(result: NbaResult): string {
  const lines: string[] = ["## NEXT-BEST-ACTION STATE"];
  lines.push(
    "Deterministically computed from current context, evidence and work state. Rules:",
    "- A recommendation is a suggestion, never proof and never authorization.",
    "- Never present it as completed work, and never execute anything yourself.",
    "- If the state says WAIT or NO RECOMMENDATION, say so plainly instead of inventing work.",
  );

  if (result.outcome === "wait") {
    lines.push("", "STATUS: WAIT", `REASON: ${result.waitReason ?? "Waiting on an external dependency."}`);
  } else if (result.outcome === "no_recommendation" || !result.primary) {
    lines.push(
      "",
      "STATUS: NO RECOMMENDATION",
      `REASON: ${result.noRecommendationReason ?? "Insufficient evidence."}`,
    );
  } else {
    const p = result.primary;
    lines.push(
      "",
      `PRIMARY RECOMMENDATION (${p.kind}): ${p.title}`,
      "STATUS: Recommended",
      `CONFIDENCE: ${p.confidence} (evidence ${p.evidenceConfidence})`,
      `BASIS: ${p.reasonCodes.join(", ")}`,
      `WHY: ${p.explanation}`,
      `RISK: ${p.risk}`,
    );
    if (p.evidenceRefs.length) lines.push(`EVIDENCE: ${p.evidenceRefs.join(", ")}`);
    if (p.whatWouldChangeThis.length) {
      lines.push(`WOULD CHANGE IF: ${p.whatWouldChangeThis.join("; ")}`);
    }
    if (p.proposedSafeAction) {
      lines.push(
        `PREPARED ACTION: ${p.proposedSafeAction.type} — requires operator confirmation through the Safe Action Executor.`,
      );
    }
  }

  if (result.missingEvidence.length) {
    lines.push(`MISSING EVIDENCE: ${result.missingEvidence.slice(0, 5).map((m) => m.label).join("; ")}`);
  }
  if (result.blocked.length) {
    lines.push(
      `BLOCKED: ${result.blocked
        .slice(0, 3)
        .map((b) => `${b.title} (${b.blockers[0]?.label ?? "blocked"})`)
        .join("; ")}`,
    );
  } else {
    lines.push("BLOCKED: none");
  }
  if (result.alternatives.length) {
    lines.push(`ALTERNATIVES: ${result.alternatives.map((a) => a.title).join("; ")}`);
  }
  if (result.degraded) lines.push("NOTE: some context sources were unavailable — unknown, not empty.");

  const text = lines.join("\n");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;
}