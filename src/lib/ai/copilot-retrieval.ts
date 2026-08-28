/**
 * Contextual Copilot retrieval selection (Phase 3, Part 8).
 *
 * Phase 2 always appended the Account World Model to Copilot context. Phase 3
 * SELECTS which bounded context blocks to include based on the operator's
 * question, so relevance goes up without the prompt growing without bound. This
 * is deterministic keyword routing (same spirit as the AI Router's
 * deterministic intercept) — no model call, no second Copilot. The caller then
 * assembles only the chosen blocks from the existing context systems.
 */

export const RETRIEVAL_BLOCKS = [
  "world_model",
  "timeline",
  "resolutions",
  "patterns",
  "changes",
  "evidence",
  "current_work",
] as const;
export type RetrievalBlock = (typeof RETRIEVAL_BLOCKS)[number];

export interface RetrievalPlan {
  /** Ordered by priority; the assembler includes them until its budget is spent. */
  blocks: RetrievalBlock[];
  /** Short machine/debug reason for the selection. */
  reason: string;
}

/** At most this many blocks — keeps the assembled context bounded. */
export const MAX_RETRIEVAL_BLOCKS = 4;

interface Rule {
  test: RegExp;
  blocks: RetrievalBlock[];
  reason: string;
}

const RULES: Rule[] = [
  {
    test: /\b(fixed|fix(ed)?\s+(this|it)|resolv|how did we|what solved|prior fix|worked before)\b/i,
    blocks: ["resolutions", "patterns", "world_model"],
    reason: "resolution lookup intent",
  },
  {
    test: /\b(why|repeat|repeatedly|again|keep(s)?|recurring|pattern|trend)\b/i,
    blocks: ["patterns", "timeline", "world_model"],
    reason: "pattern/recurrence intent",
  },
  {
    test: /\b(what changed|change(s|d)?|deploy|config|programming|rollout)\b/i,
    blocks: ["changes", "timeline", "world_model"],
    reason: "change intent",
  },
  {
    test: /\b(recent|recently|lately|happened|timeline|history|last (few|week|shift))\b/i,
    blocks: ["timeline", "world_model", "current_work"],
    reason: "recent-history intent",
  },
  {
    test: /\b(evidence|proof|source|how do you know|citation|basis|why do you (think|say))\b/i,
    blocks: ["evidence", "patterns", "world_model"],
    reason: "evidence intent",
  },
  {
    test: /\b(what should i|investigate|focus|next|priorit|where to start|triage)\b/i,
    blocks: ["world_model", "patterns", "resolutions", "current_work"],
    reason: "guidance intent",
  },
];

/** A lean default when nothing matches — never "include everything". */
const DEFAULT_PLAN: RetrievalPlan = {
  blocks: ["world_model", "current_work", "timeline"],
  reason: "default (no specific intent detected)",
};

export function planRetrieval(question: string): RetrievalPlan {
  const q = (question ?? "").trim();
  if (!q) return DEFAULT_PLAN;
  for (const rule of RULES) {
    if (rule.test.test(q)) {
      return { blocks: dedupe(rule.blocks).slice(0, MAX_RETRIEVAL_BLOCKS), reason: rule.reason };
    }
  }
  return DEFAULT_PLAN;
}

function dedupe(blocks: RetrievalBlock[]): RetrievalBlock[] {
  return [...new Set(blocks)];
}

export function planIncludes(plan: RetrievalPlan, block: RetrievalBlock): boolean {
  return plan.blocks.includes(block);
}
