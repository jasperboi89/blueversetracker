/**
 * Intelligence Core — Phase 13: promotion service.
 *
 * Prepares Promotion Packets (read-only, bounded) and routes an operator's
 * approval through the Safe Action Executor. This module never writes to an
 * authoritative destination itself.
 */

import { executeAction } from "@/lib/core/action-executor";
import { createProposedAction, type ActionExecutionResult, type ActionType } from "@/lib/core/actions";
import { eventSpine } from "@/lib/core/event-spine";
import { allMemories } from "@/lib/memory/memory-store";
import type { OperationalMemory } from "@/lib/memory/memory-contract";
import { listKnowledgeVault } from "@/lib/knowledge/knowledge.functions";
import { findResolutionMemories } from "@/lib/resolution/resolution-service";
import {
  canPromoteResolution,
  type CuratedMemoryCandidate,
  type PromotionOperation,
  type PromotionPacket,
} from "./curator-contract";
import { matchExistingKnowledge, type KnowledgePools } from "./knowledge-match";
import { buildPromotionPacket } from "./promotion-packet";
import { allCandidates, appendHistory, getCandidate, patchCandidate, savePacket, setLifecycle } from "./curator-store";

/* ------------------------------------------------------------------ */
/* Preparation                                                         */
/* ------------------------------------------------------------------ */

/** Bounded pool fetch: only what the packet needs, never the whole Vault. */
async function loadPools(candidate: CuratedMemoryCandidate): Promise<KnowledgePools> {
  const account = candidate.relatedEntities.find((e) => e.type === "account")?.id;
  const [vault, resolutions] = await Promise.all([
    listKnowledgeVault().catch(() => ({ notes: [], folders: [] })),
    findResolutionMemories(account ? { accountNumber: account, limit: 20 } : { limit: 20 }).catch(() => []),
  ]);
  return {
    notes: vault.notes.slice(0, 200),
    resolutions: resolutions.slice(0, 40),
    candidates: allCandidates().filter((c) => c.id !== candidate.id).slice(0, 100),
  };
}

export function supportingMemoriesFor(candidate: CuratedMemoryCandidate): OperationalMemory[] {
  const ids = new Set(candidate.sourceMemoryIds);
  return allMemories().filter((m) => ids.has(m.id));
}

export interface PreparedPromotion {
  packet: PromotionPacket;
  candidate: CuratedMemoryCandidate;
}

/**
 * Build the packet the operator reviews. Returns null when the proposal can't
 * be shown safely (e.g. sensitive content) — nothing is persisted in that case.
 */
export async function preparePromotion(
  candidateId: string,
  options: { generatedBody?: string } = {},
): Promise<PreparedPromotion | null> {
  const candidate = getCandidate(candidateId);
  if (!candidate) return null;
  try {
    const pools = await loadPools(candidate);
    const matches = matchExistingKnowledge(candidate, pools);
    const withMatches = { ...candidate, existingKnowledgeMatches: matches };
    patchCandidate(candidateId, (c) => ({ ...c, existingKnowledgeMatches: matches }));

    const packet = buildPromotionPacket({
      candidate: withMatches,
      memories: supportingMemoriesFor(candidate),
      matches,
      ...(options.generatedBody ? { generatedBody: options.generatedBody } : {}),
    });
    if (!packet) return null;

    savePacket(packet);
    setLifecycle(candidateId, "under_review", "packet prepared");
    eventSpine.emit({
      type: "curator.promotion.prepared",
      source: "curator",
      metadata: {
        candidateId,
        packetId: packet.id,
        destination: packet.suggestedDestination,
        operation: packet.proposedOperation,
        risk: packet.risk,
      },
    });
    return { packet, candidate: withMatches };
  } catch (err) {
    console.warn("[memory-curator] packet preparation failed", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Approval → Safe Action Executor                                     */
/* ------------------------------------------------------------------ */

export type PromotionChoice =
  | { operation: "keep_as_memory" }
  | { operation: "create"; destination: "knowledge_vault" }
  | { operation: "create"; destination: "resolution_memory"; accountNumber: string }
  | { operation: "update" | "merge"; noteId: string }
  | { operation: "supersede"; noteId: string }
  | { operation: "reinforce"; resolutionId: string }
  | { operation: "dismiss" }
  | { operation: "archive" };

function actionFor(
  packet: PromotionPacket,
  choice: PromotionChoice,
): { type: ActionType; payload: Record<string, unknown> } | null {
  const base = { candidateId: packet.candidateId, packetId: packet.id };
  const body = packet.proposedKnowledge.body ?? packet.proposedKnowledge.summary;

  switch (choice.operation) {
    case "create":
      if (choice.destination === "knowledge_vault") {
        return {
          type: "create_knowledge_draft",
          payload: { ...base, title: packet.proposedKnowledge.title, body },
        };
      }
      return {
        type: "create_resolution",
        payload: {
          ...base,
          accountNumber: choice.accountNumber,
          problem: packet.proposedKnowledge.title,
          resolution: packet.proposedKnowledge.summary,
        },
      };
    case "update":
    case "merge":
      return {
        type: "update_knowledge_note",
        payload: { ...base, noteId: choice.noteId, body, merge: choice.operation === "merge" },
      };
    case "supersede":
      return {
        type: "supersede_knowledge",
        payload: { ...base, noteId: choice.noteId, title: packet.proposedKnowledge.title, body },
      };
    case "reinforce":
      return { type: "reinforce_resolution", payload: { ...base, resolutionId: choice.resolutionId } };
    case "dismiss":
      return { type: "dismiss_candidate", payload: base };
    case "archive":
      return { type: "archive_candidate", payload: base };
    default:
      return null;
  }
}

export interface ApprovalResult {
  ok: boolean;
  message: string;
  result?: ActionExecutionResult;
}

/**
 * Knowledge Promotion Approval — deliberately distinct from confirming that a
 * memory accurately describes what happened.
 */
export async function approvePromotion(
  packet: PromotionPacket,
  choice: PromotionChoice,
): Promise<ApprovalResult> {
  const candidate = getCandidate(packet.candidateId);
  if (!candidate) return { ok: false, message: "That candidate no longer exists." };

  if (choice.operation === "keep_as_memory") {
    setLifecycle(candidate.id, "supported", "kept as memory");
    return { ok: true, message: "Kept as experience only — no knowledge was published." };
  }

  if (packet.risk === "blocked") {
    return { ok: false, message: "Promotion is blocked: resolve the conflicting evidence first." };
  }
  if (choice.operation === "create" && choice.destination === "resolution_memory" && !canPromoteResolution(candidate)) {
    return {
      ok: false,
      message: "Resolution Memory needs verified outcomes across at least two episodes on a known account.",
    };
  }

  const spec = actionFor(packet, choice);
  if (!spec) return { ok: false, message: "That promotion isn't available." };

  eventSpine.emit({
    type: "curator.promotion.approved",
    source: "curator",
    metadata: { candidateId: candidate.id, packetId: packet.id, operation: choice.operation },
  });
  appendHistory({
    id: `hist_${Date.now().toString(36)}_a`,
    packetId: packet.id,
    candidateId: candidate.id,
    operation: choice.operation,
    destination: packet.suggestedDestination,
    status: "approved",
    at: new Date().toISOString(),
  });

  const action = createProposedAction({
    type: spec.type,
    payload: spec.payload as never,
    origin: "operator",
    reason: `Knowledge promotion: ${choice.operation}`,
  });
  const result = await executeAction(action as never, { confirmed: true });

  if (result.status !== "success") {
    setLifecycle(candidate.id, "review_ready", `promotion ${result.status}`);
  }
  return {
    ok: result.status === "success",
    message: result.message ?? (result.status === "success" ? "Done." : "The promotion didn't complete."),
    result,
  };
}

/** Operator says "yes, this describes what happened" — episode-level only. */
export function confirmMemoryAccuracy(candidateId: string, note?: string): void {
  patchCandidate(candidateId, (c) => ({
    ...c,
    reality: { origin: "operator_confirmed", confidence: "probable" },
    supportLog: [
      ...c.supportLog,
      { memoryId: `operator:${Date.now()}`, at: new Date().toISOString(), supportType: "operator", confidence: "verified" },
    ],
    support: { ...c.support, verifiedEvidenceCount: c.support.verifiedEvidenceCount + 1 },
    updatedAt: new Date().toISOString(),
  }));
  // Confirming an episode is NOT approving a reusable procedure.
  const c = getCandidate(candidateId);
  if (c && (c.lifecycle === "new" || c.lifecycle === "supported" || c.lifecycle === "recurring")) {
    setLifecycle(candidateId, "review_ready", note ?? "memory confirmed as accurate");
  }
}
