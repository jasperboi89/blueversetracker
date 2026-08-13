/**
 * Phase 7 — Hybrid Knowledge Retrieval contracts.
 *
 * The retrieval index is an INDEX, never a source of truth. Every row points
 * back at an authoritative record (Resolution Memory, Change Record,
 * Knowledge Vault note, Freshdesk ticket) through sourceType + sourceId.
 */
import type { ResolutionConfidence } from "@/lib/resolution/resolution-types";

export const RETRIEVAL_SOURCE_TYPES = [
  "resolution",
  "change_record",
  "knowledge",
  "runbook",
  "freshdesk_ticket",
] as const;
export type RetrievalSourceType = (typeof RETRIEVAL_SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABEL: Record<RetrievalSourceType, string> = {
  resolution: "Resolution",
  change_record: "Change record",
  knowledge: "Knowledge note",
  runbook: "Runbook",
  freshdesk_ticket: "Freshdesk ticket",
};

export type EmbeddingStatus = "pending" | "ready" | "failed" | "disabled" | "skipped";

/** A safe, projected document ready to be upserted into the index. */
export interface RetrievalDocumentInput {
  sourceType: RetrievalSourceType;
  sourceId: string;
  /** Non-empty only for chunked documents (long Knowledge Vault notes). */
  chunkId: string;
  accountNumber: string;
  title: string;
  /** Text used for PostgreSQL full-text search. */
  lexicalText: string;
  /** Bounded, privacy-checked text used for embeddings. "" = lexical only. */
  semanticText: string;
  sourceStatus: string;
  confidence: ResolutionConfidence | "";
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
  contentHash: string;
}

export type MatchSignal =
  | "exact"
  | "lexical"
  | "semantic"
  | "account"
  | "confidence"
  | "source"
  | "recency"
  | "historical";

export interface RetrievalProvenance {
  source: RetrievalSourceType;
  sourceId: string;
  chunkId?: string;
  retrievedAt: string;
}

export interface RetrievalCandidate {
  id: string;
  sourceType: RetrievalSourceType;
  sourceId: string;
  chunkId: string;
  accountNumber: string;
  title: string;
  text: string;
  sourceStatus: string;
  confidence: ResolutionConfidence | "";
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
}

export interface LexicalCandidate extends RetrievalCandidate {
  lexicalScore: number;
}

export interface SemanticCandidate extends RetrievalCandidate {
  /** Cosine distance: 0 identical, larger = less similar. */
  distance: number;
}

export interface RetrievalResult {
  sourceType: RetrievalSourceType;
  sourceId: string;
  chunkId?: string;
  accountNumber?: string;
  title: string;
  snippet: string;
  matchedBy: MatchSignal[];
  lexicalRank?: number;
  semanticRank?: number;
  fusionScore: number;
  finalScore: number;
  confidence?: ResolutionConfidence;
  sourceStatus?: string;
  sourceUpdatedAt?: string;
  provenance: RetrievalProvenance;
}

export type RetrievalMode = "hybrid" | "lexical";

export interface RetrievalResponse {
  results: RetrievalResult[];
  modeUsed: RetrievalMode;
  semanticAvailable: boolean;
  warnings: string[];
  /** Development/debug only — never rendered in normal UI. */
  diagnostics?: RetrievalDiagnostics;
}

export interface RetrievalDiagnostics {
  query: string;
  identifiers: string[];
  lexicalCount: number;
  semanticCount: number;
  order: Array<{
    sourceType: RetrievalSourceType;
    sourceId: string;
    lexicalRank?: number;
    semanticRank?: number;
    fusionScore: number;
    finalScore: number;
    matchedBy: MatchSignal[];
  }>;
}

export interface SearchOperationalKnowledgeInput {
  query: string;
  accountNumber?: string;
  sourceTypes?: RetrievalSourceType[];
  confidence?: ResolutionConfidence[];
  limit?: number;
  includeHistorical?: boolean;
  diagnostics?: boolean;
}

export const RETRIEVAL_MAX_LIMIT = 20;
export const RETRIEVAL_DEFAULT_LIMIT = 8;
export const RETRIEVAL_CANDIDATE_LIMIT = 30;
