/**
 * Intelligence Core — Phase 13: Promotion Packets.
 *
 * The packet is the artefact the operator reviews. It is assembled
 * deterministically from the candidate, its supporting memories, the evidence
 * that backs them, the conflicts that oppose them, and the knowledge that
 * already exists. It proposes; it never writes.
 */

import { containsSensitive } from "@/lib/core/reality-boundary";
import type { OperationalMemory } from "@/lib/memory/memory-contract";
import {
  canCreateKnowledgeDraft,
  canPromoteResolution,
  canSupersedeKnowledge,
  hasCriticalConflict,
  type CuratedMemoryCandidate,
  type EvidenceReference,
  type ExistingKnowledgeMatch,
  type KnowledgeDiffLine,
  type MemoryReference,
  type PromotionOperation,
  type PromotionPacket,
  type PromotionRisk,
} from "./curator-contract";
import { isCrossAccount } from "./curator-engine";
import { stripHtml, suggestDestination } from "./knowledge-match";

/* ------------------------------------------------------------------ */
/* Draft safety                                                        */
/* ------------------------------------------------------------------ */

/** Language that promises more than any bounded evidence set can support. */
const OVERBROAD = [
  /\balways\b/gi,
  /\bnever fails?\b/gi,
  /\ball (?:tickets|accounts|cases|customers)\b/gi,
  /\bevery (?:ticket|account|case|customer)\b/gi,
  /\bwill (?:fix|resolve|solve)\b/gi,
  /\bguaranteed\b/gi,
];

export interface DraftSafetyResult {
  ok: boolean;
  body: string;
  removedClaims: string[];
  reason?: "sensitive_content";
}

/**
 * Bound a proposed draft to its evidence. Sensitive content is dropped
 * outright (never masked and stored); overbroad claims are qualified rather
 * than published as universal guidance.
 */
export function enforceDraftSafety(
  body: string,
  scope: { accountCount: number; episodeCount: number },
): DraftSafetyResult {
  const clean = body.replace(/\s+\n/g, "\n").trim();
  if (containsSensitive(clean)) {
    return { ok: false, body: "", removedClaims: [], reason: "sensitive_content" };
  }

  const removed: string[] = [];
  let safe = clean;
  for (const pattern of OVERBROAD) {
    safe = safe.replace(pattern, (match) => {
      removed.push(match);
      return "in the observed cases";
    });
  }

  if (scope.accountCount <= 1) {
    safe += `\n\nScope: observed on ${scope.accountCount || 1} account across ${scope.episodeCount} episode(s). Confirm before applying to other accounts.`;
  } else {
    safe += `\n\nScope: observed across ${scope.accountCount} accounts and ${scope.episodeCount} episodes. Account-specific exceptions still apply.`;
  }

  return { ok: true, body: safe, removedClaims: removed };
}

/** Deterministic draft used when no model is available (or as the base prompt). */
export function baselineDraft(
  candidate: CuratedMemoryCandidate,
  memories: OperationalMemory[],
): string {
  const steps = memories
    .flatMap((m) => m.episode?.actions ?? [])
    .filter((a, i, all) => all.indexOf(a) === i)
    .slice(0, 6);
  const lines = [candidate.proposedStatement];
  if (steps.length) {
    lines.push("", "Observed sequence:");
    steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  const conflicts = candidate.conflicts.filter((c) => c.status === "unresolved");
  if (conflicts.length) {
    lines.push("", `Unresolved conflicting evidence: ${conflicts.length}. Review before use.`);
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Diff                                                                */
/* ------------------------------------------------------------------ */

/** Line-level diff. The previous version is always shown, never hidden. */
export function knowledgeDiff(current: string, proposed: string): KnowledgeDiffLine[] {
  const a = stripHtml(current).split(/\n|(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
  const b = proposed.split("\n").map((s) => s.trim()).filter(Boolean);
  const bSet = new Set(b);
  const aSet = new Set(a);
  const out: KnowledgeDiffLine[] = [];
  for (const line of a) out.push({ kind: bSet.has(line) ? "context" : "removed", text: line });
  for (const line of b) if (!aSet.has(line)) out.push({ kind: "added", text: line });
  return out.slice(0, 60);
}

/* ------------------------------------------------------------------ */
/* Risk                                                                */
/* ------------------------------------------------------------------ */

export function assessRisk(
  candidate: CuratedMemoryCandidate,
  operation: PromotionOperation,
): PromotionRisk {
  if (hasCriticalConflict(candidate)) return "blocked";
  if (!candidate.sourceMemoryIds.length) return "blocked";
  if (containsSensitive(`${candidate.title} ${candidate.proposedStatement}`)) return "blocked";

  if (operation === "supersede") return "high";
  if (isCrossAccount(candidate) && operation !== "keep_as_memory") return "high";
  if (operation === "keep_as_memory") return "low";
  if (operation === "update" || operation === "merge") return "medium";
  if (candidate.reality.confidence === "unknown") return "medium";
  if (candidate.support.verifiedEvidenceCount >= 2 && candidate.support.episodeCount >= 2) return "low";
  return "medium";
}

/* ------------------------------------------------------------------ */
/* Packet                                                              */
/* ------------------------------------------------------------------ */

export interface BuildPacketInput {
  candidate: CuratedMemoryCandidate;
  memories: OperationalMemory[];
  matches: ExistingKnowledgeMatch[];
  /** Optional model-authored body. Always treated as `generated`. */
  generatedBody?: string;
  now?: number;
}

export function buildPromotionPacket(input: BuildPacketInput): PromotionPacket | null {
  const { candidate } = input;
  const now = input.now ?? Date.now();
  const at = new Date(now).toISOString();
  const suggestion = suggestDestination(candidate, input.matches);

  const supportingMemories: MemoryReference[] = input.memories.slice(0, 12).map((m) => ({
    memoryId: m.id,
    title: m.title,
    occurredAt: m.occurredAt,
    confidence: m.confidence,
  }));

  const supportingEvidence: EvidenceReference[] = input.memories
    .flatMap((m) => m.evidence.map((e) => ({
      sourceType: e.sourceType,
      ...(e.sourceId ? { sourceId: e.sourceId } : {}),
      ...(e.title ? { title: e.title } : {}),
      ...(e.factId ? { factId: e.factId } : {}),
      confidence: m.confidence,
    })))
    .slice(0, 20);

  const rawBody = input.generatedBody?.trim() || baselineDraft(candidate, input.memories);
  const safety = enforceDraftSafety(rawBody, {
    accountCount: candidate.support.accountCount,
    episodeCount: candidate.support.episodeCount,
  });
  if (!safety.ok) return null;

  const target = input.matches.find((m) => m.sourceId === suggestion.targetId);
  const needsDiff =
    suggestion.operation === "update" ||
    suggestion.operation === "merge" ||
    suggestion.operation === "supersede";

  const signals: string[] = [
    `${candidate.support.episodeCount} supporting episode(s)`,
    `${candidate.support.verifiedEvidenceCount} verified outcome(s)`,
    `observed across ${Math.max(1, candidate.support.accountCount)} account(s)`,
    candidate.conflicts.filter((c) => c.status === "unresolved").length
      ? `${candidate.conflicts.filter((c) => c.status === "unresolved").length} unresolved conflict(s)`
      : "no active conflicts",
  ];
  if (target) signals.push(`existing ${target.sourceType.replace("_", " ")} match found`);
  if (safety.removedClaims.length) signals.push(`${safety.removedClaims.length} overbroad claim(s) qualified`);

  return {
    id: `pkt_${candidate.id}_${now.toString(36)}`,
    candidateId: candidate.id,
    type: candidate.type,
    proposedKnowledge: {
      title: candidate.title,
      summary: candidate.proposedStatement.slice(0, 400),
      body: safety.body,
    },
    supportingMemories,
    supportingEvidence,
    conflicts: candidate.conflicts,
    recurrence: candidate.support,
    relatedAccounts: candidate.relatedEntities.filter((e) => e.type === "account"),
    relatedTickets: candidate.relatedEntities.filter((e) => e.type === "ticket"),
    currentKnowledgeMatches: input.matches,
    suggestedDestination: suggestion.destination,
    proposedOperation: suggestion.operation,
    ...(suggestion.targetId ? { targetId: suggestion.targetId } : {}),
    ...(needsDiff && target?.currentText
      ? { diff: knowledgeDiff(target.currentText, safety.body) }
      : {}),
    // AI wording never inherits the candidate's strength.
    reality: {
      origin: input.generatedBody ? "generated" : "inferred",
      confidence: candidate.reality.confidence,
    },
    risk: assessRisk(candidate, suggestion.operation),
    readinessSignals: signals,
    createdAt: at,
  };
}

/** Which promotion actions may safely be offered for this packet. */
export function allowedOperations(
  candidate: CuratedMemoryCandidate,
  packet: PromotionPacket,
): PromotionOperation[] {
  const out: PromotionOperation[] = ["keep_as_memory"];
  if (packet.risk === "blocked") return out;
  if (canCreateKnowledgeDraft(candidate)) {
    out.push("create");
    if (packet.targetId) out.push("update", "merge", "reinforce");
  }
  if (canSupersedeKnowledge(candidate) && packet.targetId) out.push("supersede");
  if (canPromoteResolution(candidate)) out.push("create");
  return Array.from(new Set(out));
}
