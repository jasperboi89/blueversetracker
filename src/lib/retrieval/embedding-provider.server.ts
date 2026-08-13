// Server-only embedding provider. Never import from client bundles.
//
// Semantic search degrades to lexical-only whenever this file cannot produce
// vectors: no key, provider down, rate limited. It never throws upward.

export const EMBEDDING_MODEL = "google/gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 3072;
/** Bump when the projection or model changes so stale rows are re-embedded. */
export const EMBEDDING_VERSION = "v1";
export const EMBEDDING_BATCH_MAX = 100;

const EMBEDDINGS_URL = "https://ai.gateway.lovable.dev/v1/embeddings";

export type EmbedResult =
  | { ok: true; vectors: number[][] }
  | { ok: false; error: string; retryable: boolean };

export interface EmbeddingProvider {
  model: string;
  version: string;
  dimensions: number;
  embed(inputs: string[]): Promise<EmbedResult>;
}

function statusError(status: number): { error: string; retryable: boolean } {
  if (status === 429) return { error: "Embedding rate limit hit.", retryable: true };
  if (status === 402) return { error: "AI credits exhausted.", retryable: false };
  if (status === 403) return { error: "Lovable AI is disabled for this workspace.", retryable: false };
  if (status === 404) return { error: "Embeddings are not enabled for this workspace.", retryable: false };
  if (status >= 500) return { error: `Embedding provider error (${status}).`, retryable: true };
  return { error: `Embedding call failed (${status}).`, retryable: false };
}

export const lovableEmbeddingProvider: EmbeddingProvider = {
  model: EMBEDDING_MODEL,
  version: EMBEDDING_VERSION,
  dimensions: EMBEDDING_DIMENSIONS,
  async embed(inputs) {
    if (inputs.length === 0) return { ok: true, vectors: [] };
    if (inputs.length > EMBEDDING_BATCH_MAX) {
      return { ok: false, error: "Embedding batch too large.", retryable: false };
    }
    if (process.env.AI_DISABLED === "true") {
      return { ok: false, error: "AI is disabled by the administrator.", retryable: false };
    }
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false, error: "Embeddings unavailable: no API key.", retryable: false };

    let res: Response;
    try {
      res = await fetch(EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Embedding call failed.",
        retryable: true,
      };
    }
    if (!res.ok) {
      const { error, retryable } = statusError(res.status);
      return { ok: false, error, retryable };
    }
    let body: { data?: Array<{ index?: number; embedding?: number[] }> };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { ok: false, error: "Embedding response was unreadable.", retryable: true };
    }
    const rows = body.data ?? [];
    if (rows.length !== inputs.length) {
      return { ok: false, error: "Embedding response was incomplete.", retryable: true };
    }
    const vectors: number[][] = new Array(inputs.length);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const at = typeof row.index === "number" ? row.index : i;
      if (!Array.isArray(row.embedding) || row.embedding.length !== EMBEDDING_DIMENSIONS) {
        return { ok: false, error: "Embedding dimensions did not match.", retryable: false };
      }
      vectors[at] = row.embedding;
    }
    return { ok: true, vectors };
  },
};

/** pgvector literal form used when passing a query vector to a SQL function. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
