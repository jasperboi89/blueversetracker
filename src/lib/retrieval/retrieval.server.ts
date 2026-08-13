// Server-only retrieval engine. Never import from client bundles.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  EMBEDDING_BATCH_MAX,
  lovableEmbeddingProvider,
  toVectorLiteral,
  type EmbeddingProvider,
} from "./embedding-provider.server";
import { fuseCandidates, parseIdentifiers } from "./fusion";
import {
  RETRIEVAL_CANDIDATE_LIMIT,
  type LexicalCandidate,
  type RetrievalDocumentInput,
  type RetrievalResponse,
  type RetrievalSourceType,
  type SearchOperationalKnowledgeInput,
  type SemanticCandidate,
} from "./retrieval-types";
import {
  changeRecordToRetrievalDocument,
  knowledgeToRetrievalDocuments,
  resolutionToRetrievalDocument,
} from "./projections";
import { mapResolutionRow, SELECT_COLUMNS as RESOLUTION_COLUMNS } from "@/lib/resolution/resolution-map";
import type { AccountChangeRecord } from "@/lib/changes/changes.functions";
import type { KnowledgeNote } from "@/lib/knowledge/knowledge.functions";

export type Client = SupabaseClient<Database>;

type CandidateRow = {
  id: string;
  source_type: string;
  source_id: string;
  chunk_id: string;
  account_number: string;
  title: string;
  lexical_text: string;
  source_status: string;
  confidence: string;
  source_created_at: string | null;
  source_updated_at: string | null;
  embedding_status: string;
};

function baseCandidate(r: CandidateRow) {
  return {
    id: r.id,
    sourceType: r.source_type as RetrievalSourceType,
    sourceId: r.source_id,
    chunkId: r.chunk_id ?? "",
    accountNumber: r.account_number ?? "",
    title: r.title ?? "",
    text: r.lexical_text ?? "",
    sourceStatus: r.source_status ?? "",
    confidence: (r.confidence ?? "") as LexicalCandidate["confidence"],
    ...(r.source_created_at ? { sourceCreatedAt: r.source_created_at } : {}),
    ...(r.source_updated_at ? { sourceUpdatedAt: r.source_updated_at } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Indexing                                                            */
/* ------------------------------------------------------------------ */

export interface IndexResult {
  upserted: number;
  unchanged: number;
}

/**
 * Upsert projected documents. Embedding work is only re-queued when the
 * content hash actually changed, so re-indexing is cheap and idempotent.
 */
export async function upsertDocuments(
  client: Client,
  userId: string,
  docs: RetrievalDocumentInput[],
): Promise<IndexResult> {
  if (docs.length === 0) return { upserted: 0, unchanged: 0 };

  const { data: existing } = await client
    .from("retrieval_documents")
    .select("source_type,source_id,chunk_id,content_hash")
    .eq("operator_user_id", userId)
    .in(
      "source_id",
      Array.from(new Set(docs.map((d) => d.sourceId))),
    );
  const seen = new Map<string, string>();
  for (const row of existing ?? []) {
    seen.set(`${row.source_type}:${row.source_id}:${row.chunk_id ?? ""}`, row.content_hash);
  }

  const changed = docs.filter(
    (d) => seen.get(`${d.sourceType}:${d.sourceId}:${d.chunkId}`) !== d.contentHash,
  );
  if (changed.length === 0) return { upserted: 0, unchanged: docs.length };

  const payload = changed.map((d) => ({
    operator_user_id: userId,
    source_type: d.sourceType,
    source_id: d.sourceId,
    chunk_id: d.chunkId,
    account_number: d.accountNumber,
    title: d.title,
    lexical_text: d.lexicalText,
    semantic_text: d.semanticText,
    source_status: d.sourceStatus,
    confidence: d.confidence,
    source_created_at: d.sourceCreatedAt ?? null,
    source_updated_at: d.sourceUpdatedAt ?? null,
    content_hash: d.contentHash,
    // Content changed: the old vector no longer describes this row.
    embedding_status: d.semanticText ? "pending" : "skipped",
    embedding_error: "",
    embedding_attempts: 0,
  }));

  const { error } = await client
    .from("retrieval_documents")
    .upsert(payload, { onConflict: "operator_user_id,source_type,source_id,chunk_id" });
  if (error) throw new Error(error.message);
  return { upserted: changed.length, unchanged: docs.length - changed.length };
}

export async function removeDocuments(
  client: Client,
  userId: string,
  sourceType: RetrievalSourceType,
  sourceId: string,
): Promise<void> {
  const { error } = await client
    .from("retrieval_documents")
    .delete()
    .eq("operator_user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Embedding queue                                                     */
/* ------------------------------------------------------------------ */

export interface EmbedQueueResult {
  processed: number;
  embedded: number;
  failed: number;
  remaining: number;
  error?: string;
}

const MAX_EMBED_ATTEMPTS = 3;

/**
 * Drain a slice of the pending-embedding queue. Failures are recorded on the
 * row and never surfaced as a search outage: the document stays lexically
 * searchable the whole time.
 */
export async function processEmbeddingQueue(
  client: Client,
  userId: string,
  opts: { limit?: number; provider?: EmbeddingProvider } = {},
): Promise<EmbedQueueResult> {
  const provider = opts.provider ?? lovableEmbeddingProvider;
  const limit = Math.min(opts.limit ?? 25, EMBEDDING_BATCH_MAX);

  const { data: rows, error } = await client
    .from("retrieval_documents")
    .select("id,semantic_text,content_hash,embedding_attempts")
    .eq("operator_user_id", userId)
    .eq("embedding_status", "pending")
    .lt("embedding_attempts", MAX_EMBED_ATTEMPTS)
    .neq("semantic_text", "")
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const pending = rows ?? [];
  if (pending.length === 0) return { processed: 0, embedded: 0, failed: 0, remaining: 0 };

  const res = await provider.embed(pending.map((r) => r.semantic_text));
  if (!res.ok) {
    for (const row of pending) {
      await client
        .from("retrieval_documents")
        .update({
          embedding_attempts: (row.embedding_attempts ?? 0) + 1,
          embedding_error: res.error.slice(0, 300),
          embedding_status:
            !res.retryable || (row.embedding_attempts ?? 0) + 1 >= MAX_EMBED_ATTEMPTS
              ? "failed"
              : "pending",
        })
        .eq("id", row.id);
    }
    return {
      processed: pending.length,
      embedded: 0,
      failed: pending.length,
      remaining: pending.length,
      error: res.error,
    };
  }

  let embedded = 0;
  for (let i = 0; i < pending.length; i += 1) {
    const row = pending[i]!;
    const vector = res.vectors[i];
    if (!vector) continue;
    const { error: upErr } = await client
      .from("retrieval_documents")
      .update({
        embedding: toVectorLiteral(vector),
        embedded_content_hash: row.content_hash,
        embedding_model: provider.model,
        embedding_version: provider.version,
        embedding_status: "ready",
        embedding_error: "",
        embedded_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      // Only claim freshness if the row has not changed underneath us.
      .eq("content_hash", row.content_hash);
    if (!upErr) embedded += 1;
  }

  const { count } = await client
    .from("retrieval_documents")
    .select("id", { count: "exact", head: true })
    .eq("operator_user_id", userId)
    .eq("embedding_status", "pending");

  return { processed: pending.length, embedded, failed: pending.length - embedded, remaining: count ?? 0 };
}

/* ------------------------------------------------------------------ */
/* Hybrid search                                                       */
/* ------------------------------------------------------------------ */

export async function searchKnowledge(
  client: Client,
  input: SearchOperationalKnowledgeInput,
  opts: { provider?: EmbeddingProvider } = {},
): Promise<RetrievalResponse> {
  const provider = opts.provider ?? lovableEmbeddingProvider;
  const query = input.query.trim();
  const warnings: string[] = [];
  const limit = input.limit ?? 8;
  if (!query) {
    return { results: [], modeUsed: "lexical", semanticAvailable: false, warnings: ["Empty query."] };
  }

  const filters = {
    p_query: query,
    ...(input.accountNumber ? { p_account_number: input.accountNumber } : {}),
    ...(input.sourceTypes ? { p_source_types: input.sourceTypes as string[] } : {}),
    ...(input.confidence ? { p_confidences: input.confidence as string[] } : {}),
    p_include_historical: input.includeHistorical ?? false,
    p_limit: RETRIEVAL_CANDIDATE_LIMIT,
  };

  const lexicalPromise = client.rpc("retrieval_lexical_candidates", filters);

  // Semantic is best-effort: any failure downgrades the mode, never the call.
  const semanticPromise = (async (): Promise<SemanticCandidate[] | { error: string }> => {
    const embedded = await provider.embed([query]);
    if (!embedded.ok) return { error: embedded.error };
    const vector = embedded.vectors[0];
    if (!vector) return { error: "No query embedding was returned." };
    const { data, error } = await client.rpc("retrieval_semantic_candidates", {
      p_embedding: toVectorLiteral(vector),
      p_model: provider.model,
      ...(input.accountNumber ? { p_account_number: input.accountNumber } : {}),
      ...(input.sourceTypes ? { p_source_types: input.sourceTypes as string[] } : {}),
      ...(input.confidence ? { p_confidences: input.confidence as string[] } : {}),
      p_include_historical: input.includeHistorical ?? false,
      p_limit: RETRIEVAL_CANDIDATE_LIMIT,
    });
    if (error) return { error: error.message };
    return ((data ?? []) as unknown as Array<CandidateRow & { distance: number }>).map((r) => ({
      ...baseCandidate(r),
      distance: Number(r.distance ?? 1),
    }));
  })().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : "Semantic search failed.",
  }));

  const [lexicalRes, semanticRes] = await Promise.all([lexicalPromise, semanticPromise]);
  if (lexicalRes.error) throw new Error(lexicalRes.error.message);

  const lexical: LexicalCandidate[] = (
    (lexicalRes.data ?? []) as unknown as Array<CandidateRow & { lexical_score: number }>
  ).map((r) => ({ ...baseCandidate(r), lexicalScore: Number(r.lexical_score ?? 0) }));

  let semantic: SemanticCandidate[] = [];
  let semanticAvailable = true;
  if (Array.isArray(semanticRes)) semantic = semanticRes;
  else {
    semanticAvailable = false;
    warnings.push(`Semantic search unavailable — showing keyword results only. (${semanticRes.error})`);
  }

  const identifiers = parseIdentifiers(query);
  const results = fuseCandidates(lexical, semantic, {
    identifiers,
    ...(input.accountNumber ? { accountNumber: input.accountNumber } : {}),
    limit,
  });

  return {
    results,
    modeUsed: semanticAvailable ? "hybrid" : "lexical",
    semanticAvailable,
    warnings,
    ...(input.diagnostics
      ? {
          diagnostics: {
            query,
            identifiers: identifiers.all,
            lexicalCount: lexical.length,
            semanticCount: semantic.length,
            order: results.map((r) => ({
              sourceType: r.sourceType,
              sourceId: r.sourceId,
              ...(r.lexicalRank !== undefined ? { lexicalRank: r.lexicalRank } : {}),
              ...(r.semanticRank !== undefined ? { semanticRank: r.semanticRank } : {}),
              fusionScore: r.fusionScore,
              finalScore: r.finalScore,
              matchedBy: r.matchedBy,
            })),
          },
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Backfill from authoritative sources                                 */
/* ------------------------------------------------------------------ */

export interface BackfillResult {
  resolutions: number;
  changeRecords: number;
  knowledge: number;
  upserted: number;
}

export async function backfillFromSources(
  client: Client,
  userId: string,
  limitPerSource = 300,
): Promise<BackfillResult> {
  const docs: RetrievalDocumentInput[] = [];

  const { data: resolutions } = await client
    .from("resolution_memories")
    .select(RESOLUTION_COLUMNS)
    .eq("operator_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limitPerSource);
  for (const row of resolutions ?? []) {
    docs.push(resolutionToRetrievalDocument(mapResolutionRow(row as Record<string, unknown>)));
  }

  const { data: changes } = await client
    .from("account_change_records")
    .select(
      "id,account_number,account_name,title,change_type,risk,status,rollback_note,ticket_number,created_at,updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limitPerSource);
  for (const row of changes ?? []) {
    const r = row as Record<string, unknown>;
    docs.push(
      changeRecordToRetrievalDocument({
        id: String(r.id),
        accountNumber: String(r.account_number ?? ""),
        accountName: String(r.account_name ?? ""),
        title: String(r.title ?? ""),
        changeType: String(r.change_type ?? ""),
        risk: String(r.risk ?? ""),
        status: String(r.status ?? ""),
        rollbackNote: String(r.rollback_note ?? ""),
        ticketNumber: String(r.ticket_number ?? ""),
        createdAt: String(r.created_at ?? ""),
        updatedAt: String(r.updated_at ?? ""),
      } as AccountChangeRecord),
    );
  }

  const { data: notes } = await client
    .from("knowledge_notes")
    .select("id,title,content_html,note_type,tags,is_archived,created_at,updated_at")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false })
    .limit(limitPerSource);
  for (const row of notes ?? []) {
    const r = row as Record<string, unknown>;
    docs.push(
      ...knowledgeToRetrievalDocuments({
        id: String(r.id),
        title: String(r.title ?? ""),
        contentHtml: String(r.content_html ?? ""),
        noteType: String(r.note_type ?? "note"),
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        isArchived: Boolean(r.is_archived),
        createdAt: String(r.created_at ?? ""),
        updatedAt: String(r.updated_at ?? ""),
      } as KnowledgeNote),
    );
  }

  const out = await upsertDocuments(client, userId, docs);
  return {
    resolutions: (resolutions ?? []).length,
    changeRecords: (changes ?? []).length,
    knowledge: (notes ?? []).length,
    upserted: out.upserted,
  };
}
