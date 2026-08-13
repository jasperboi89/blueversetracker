import type { ContextBudget, RoutingDecision } from "./task-types";

/**
 * Bounded context assembly. The allowed *fields* never change with tier —
 * only how much of the already-safe projections fit.
 */
export interface ContextParts {
  /** Safe account context projection (already scrubbed upstream). */
  accountContext?: string;
  /** Shift working context summary. */
  shiftContext?: string;
  /** Bounded retrieval evidence, most relevant first. */
  evidence?: string[];
  /** Directly relevant structured values for the task. */
  structured?: string;
}

export interface BuiltContext {
  text: string;
  includedEvidence: number;
  droppedEvidence: number;
  truncated: boolean;
}

function clamp(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, Math.max(0, max - 1))}…`, truncated: true };
}

export function buildContext(parts: ContextParts, budget: ContextBudget): BuiltContext {
  const evidence = parts.evidence ?? [];
  const kept = evidence.slice(0, budget.maxEvidenceItems);
  const sections: string[] = [];

  if (parts.structured) sections.push(parts.structured);
  if (parts.shiftContext && budget.allowShiftContext) {
    sections.push(`Shift context:\n${parts.shiftContext}`);
  }
  if (parts.accountContext && budget.allowAccountContext) {
    sections.push(`Account context:\n${parts.accountContext}`);
  }
  if (kept.length > 0) {
    sections.push(`Evidence:\n${kept.map((e, i) => `${i + 1}. ${e}`).join("\n")}`);
  }

  const { text, truncated } = clamp(sections.join("\n\n"), budget.maxContextChars);
  return {
    text,
    includedEvidence: kept.length,
    droppedEvidence: evidence.length - kept.length,
    truncated,
  };
}

export function buildContextFor(parts: ContextParts, decision: RoutingDecision): BuiltContext {
  return buildContext(parts, decision.contextBudget);
}

/**
 * Grounding instruction shared by every tier: provenance rules are not
 * relaxed for stronger models.
 */
export const GROUNDING_RULES = [
  "Ground every claim in the supplied evidence.",
  "Label statements as: known (stated by a source), inferred (reasoned from evidence), or uncertain.",
  "A probable or unverified resolution memory is never presented as verified fact.",
  "If the evidence does not answer the question, say so plainly.",
].join(" ");