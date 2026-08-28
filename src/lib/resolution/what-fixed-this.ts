import type { ResolutionMemory } from "./resolution-types";

/**
 * "What Fixed This Before?" (Phase 3, Part 7) — a first-class investigative
 * lookup over Resolution Memory (and, as foundations, other evidence tiers).
 *
 * This module is the pure ranking + shaping layer. The retrieval ORDER is the
 * contract:
 *   1. verified, same-account resolutions
 *   2. same operational component/type (affected area)
 *   3. semantically similar cross-account resolutions (permissions permitting)
 *   4. relevant Freshdesk historical tickets   (foundation input)
 *   5. Knowledge Vault guidance                (foundation input)
 *
 * Results are INVESTIGATIVE EVIDENCE, never an instruction to blindly apply a
 * prior fix (`advisoryOnly` is always true).
 */

export const WHAT_FIXED_TIERS = [
  "same_account_verified",
  "same_account",
  "component",
  "cross_account",
  "freshdesk",
  "knowledge",
] as const;
export type WhatFixedTier = (typeof WHAT_FIXED_TIERS)[number];

const TIER_RANK: Record<WhatFixedTier, number> = {
  same_account_verified: 0,
  same_account: 1,
  component: 2,
  cross_account: 3,
  freshdesk: 4,
  knowledge: 5,
};

export interface WhatFixedThisResult {
  id: string;
  tier: WhatFixedTier;
  /** Short issue summary. */
  problem: string;
  /** The previous resolution text (bounded). */
  resolution: string;
  accountNumber: string;
  accountName?: string;
  /** verified | probable | unknown, or a source-specific label. */
  verification: string;
  date: string;
  /** Why this surfaced (the tier/relevance basis). */
  basis: string;
  /** Evidence/source reference. */
  evidence: { type: string; id: string };
  /** Recorded outcome when known. */
  outcome?: string;
  /** Always true — this is evidence to investigate, not a directive. */
  advisoryOnly: true;
}

const CONF_RANK: Record<string, number> = { verified: 0, probable: 1, unknown: 2 };

function basisFor(tier: WhatFixedTier): string {
  switch (tier) {
    case "same_account_verified":
      return "Verified fix on this account";
    case "same_account":
      return "Prior resolution on this account";
    case "component":
      return "Same operational component";
    case "cross_account":
      return "Similar issue on another account";
    case "freshdesk":
      return "Relevant historical Freshdesk ticket";
    case "knowledge":
      return "Knowledge Vault guidance";
  }
}

/** Assign a tier to a resolution memory relative to the active account + area. */
export function tierForResolution(
  memory: ResolutionMemory,
  accountNumber: string,
  affectedArea?: string,
): WhatFixedTier {
  const sameAccount = memory.accountNumber === accountNumber && !!accountNumber;
  if (sameAccount && memory.confidence === "verified") return "same_account_verified";
  if (sameAccount) return "same_account";
  if (
    affectedArea &&
    memory.affectedArea &&
    memory.affectedArea.toLowerCase() === affectedArea.toLowerCase()
  ) {
    return "component";
  }
  return "cross_account";
}

export function resolutionToResult(
  memory: ResolutionMemory,
  tier: WhatFixedTier,
): WhatFixedThisResult {
  return {
    id: memory.id,
    tier,
    problem: memory.problem,
    resolution: memory.resolution,
    accountNumber: memory.accountNumber,
    ...(memory.accountName ? { accountName: memory.accountName } : {}),
    verification: memory.confidence,
    date: memory.updatedAt || memory.createdAt,
    basis: basisFor(tier),
    evidence: { type: "resolution", id: memory.id },
    ...(memory.testing ? { outcome: memory.testing } : {}),
    advisoryOnly: true,
  };
}

/**
 * Rank results by tier, then verification, then recency. Pure and deterministic.
 * `limit` bounds the returned set (newest/strongest first).
 */
export function rankWhatFixedThis(
  results: WhatFixedThisResult[],
  limit = 8,
): WhatFixedThisResult[] {
  return [...results]
    .sort(
      (a, b) =>
        TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
        (CONF_RANK[a.verification] ?? 3) - (CONF_RANK[b.verification] ?? 3) ||
        b.date.localeCompare(a.date),
    )
    .slice(0, limit);
}

/**
 * Build ranked results from resolution memories for an account. Freshdesk /
 * Knowledge tiers are accepted as already-shaped `extra` results (wired by the
 * service as those retrievers come online) so the ordering contract holds
 * across all tiers.
 */
export function buildWhatFixedThis(params: {
  accountNumber: string;
  affectedArea?: string;
  memories: ResolutionMemory[];
  extra?: WhatFixedThisResult[];
  limit?: number;
}): WhatFixedThisResult[] {
  const fromMemories = params.memories
    .filter((m) => m.status === "active")
    .map((m) =>
      resolutionToResult(m, tierForResolution(m, params.accountNumber, params.affectedArea)),
    );
  return rankWhatFixedThis([...fromMemories, ...(params.extra ?? [])], params.limit ?? 8);
}
