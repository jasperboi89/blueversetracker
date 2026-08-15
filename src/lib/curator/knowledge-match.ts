/**
 * Intelligence Core — Phase 13: existing-knowledge discovery.
 *
 * Before anything new is proposed, the Curator asks: does something
 * equivalent already exist? Deterministic metadata and token overlap decide
 * the relationship; similarity alone never does.
 */

import type { KnowledgeNote } from "@/lib/knowledge/knowledge.functions";
import type { ResolutionMemory } from "@/lib/resolution/resolution-types";
import { jaccard, topicTokens } from "./curator-engine";
import type {
  CuratedMemoryCandidate,
  ExistingKnowledgeMatch,
  PromotionDestination,
  PromotionOperation,
} from "./curator-contract";

export const EQUIVALENT_THRESHOLD = 0.55;
export const OVERLAP_THRESHOLD = 0.25;

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function relationshipFor(similarity: number, conflicting: boolean, superseded: boolean):
  ExistingKnowledgeMatch["relationship"] {
  if (superseded) return "superseded";
  if (conflicting) return "conflicting";
  if (similarity >= EQUIVALENT_THRESHOLD) return "equivalent";
  if (similarity >= OVERLAP_THRESHOLD) return "overlapping";
  return "complementary";
}

export interface KnowledgePools {
  notes: KnowledgeNote[];
  resolutions: ResolutionMemory[];
  candidates?: CuratedMemoryCandidate[];
}

export function matchExistingKnowledge(
  candidate: CuratedMemoryCandidate,
  pools: KnowledgePools,
  limit = 5,
): ExistingKnowledgeMatch[] {
  const needle = topicTokens(`${candidate.title} ${candidate.proposedStatement}`);
  const conflicted = candidate.conflicts.some((c) => c.status === "unresolved");
  const out: ExistingKnowledgeMatch[] = [];

  for (const note of pools.notes) {
    if (note.isArchived) continue;
    const body = stripHtml(note.contentHtml).slice(0, 4000);
    const similarity = Math.round(jaccard(needle, topicTokens(`${note.title} ${body}`)) * 100) / 100;
    if (similarity < OVERLAP_THRESHOLD) continue;
    out.push({
      sourceType: "knowledge_vault",
      sourceId: note.id,
      title: note.title,
      similarity,
      relationship: relationshipFor(similarity, conflicted, false),
      realityStatus: "active",
      currentText: body.slice(0, 1200),
    });
  }

  for (const r of pools.resolutions) {
    const text = `${r.problem} ${r.rootCause} ${r.resolution} ${r.affectedArea}`;
    const similarity = Math.round(jaccard(needle, topicTokens(text)) * 100) / 100;
    if (similarity < OVERLAP_THRESHOLD) continue;
    out.push({
      sourceType: "resolution_memory",
      sourceId: r.id,
      title: r.problem.slice(0, 120),
      similarity,
      relationship: relationshipFor(similarity, conflicted, r.status === "superseded"),
      realityStatus: r.status === "superseded" ? "superseded" : "active",
      currentText: r.resolution.slice(0, 1200),
    });
  }

  for (const other of pools.candidates ?? []) {
    if (other.id === candidate.id || other.lifecycle === "merged") continue;
    const similarity =
      Math.round(jaccard(needle, topicTokens(`${other.title} ${other.proposedStatement}`)) * 100) / 100;
    if (similarity < EQUIVALENT_THRESHOLD) continue;
    out.push({
      sourceType: "candidate",
      sourceId: other.id,
      title: other.title,
      similarity,
      relationship: "equivalent",
    });
  }

  return out.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

/**
 * Destination + operation are chosen deterministically. Reflections never go
 * to Resolution Memory; equivalent existing knowledge is always preferred
 * over creating a near-duplicate note.
 */
export function suggestDestination(
  candidate: CuratedMemoryCandidate,
  matches: ExistingKnowledgeMatch[],
): { destination: PromotionDestination; operation: PromotionOperation; targetId?: string } {
  if (candidate.type === "reflection") {
    return { destination: "improvement", operation: "keep_as_memory" };
  }

  const vaultMatch = matches.find((m) => m.sourceType === "knowledge_vault");
  const resolutionMatch = matches.find(
    (m) => m.sourceType === "resolution_memory" && m.relationship !== "superseded",
  );

  if (resolutionMatch && resolutionMatch.relationship === "equivalent") {
    return {
      destination: "resolution_memory",
      operation: "reinforce",
      targetId: resolutionMatch.sourceId,
    };
  }

  if (vaultMatch) {
    if (vaultMatch.relationship === "conflicting") {
      return { destination: "knowledge_vault", operation: "supersede", targetId: vaultMatch.sourceId };
    }
    if (vaultMatch.relationship === "equivalent") {
      return { destination: "knowledge_vault", operation: "update", targetId: vaultMatch.sourceId };
    }
    return { destination: "knowledge_vault", operation: "merge", targetId: vaultMatch.sourceId };
  }

  if (candidate.type === "resolution_candidate") {
    return { destination: "resolution_memory", operation: "create" };
  }
  if (candidate.support.episodeCount >= 2) {
    return { destination: "knowledge_vault", operation: "create" };
  }
  return { destination: "operational_memory", operation: "keep_as_memory" };
}
