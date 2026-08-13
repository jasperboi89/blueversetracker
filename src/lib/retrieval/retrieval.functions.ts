import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";
import { RESOLUTION_CONFIDENCES } from "@/lib/resolution/resolution-types";
import { RETRIEVAL_SOURCE_TYPES } from "./retrieval-types";

const SearchSchema = z.object({
  query: z.string().trim().min(1).max(400),
  accountNumber: z.string().trim().max(40).optional(),
  sourceTypes: z.array(z.enum(RETRIEVAL_SOURCE_TYPES)).min(1).max(5).optional(),
  confidence: z.array(z.enum(RESOLUTION_CONFIDENCES)).min(1).max(3).optional(),
  limit: z.number().int().min(1).max(20).optional().default(8),
  includeHistorical: z.boolean().optional().default(false),
  diagnostics: z.boolean().optional().default(false),
});

const IndexSchema = z.object({
  sourceType: z.enum(RETRIEVAL_SOURCE_TYPES),
  sourceId: z.string().trim().min(1).max(120),
});

/** Hybrid search across the operator's own operational knowledge. */
export const searchOperationalKnowledge = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => SearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { searchKnowledge } = await import("./retrieval.server");
    return searchKnowledge(context.supabase, data);
  });

/** Re-project one authoritative record into the index (create/update). */
export const reindexRetrievalSource = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => IndexSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { reindexOneSource } = await import("./retrieval-index.server");
    return reindexOneSource(context.supabase, context.userId, data.sourceType, data.sourceId);
  });

/** Drop a record from the index when the authoritative record is deleted. */
export const removeRetrievalSource = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => IndexSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { removeDocuments } = await import("./retrieval.server");
    await removeDocuments(context.supabase, context.userId, data.sourceType, data.sourceId);
    return { ok: true as const };
  });

/** Index everything the operator already has. Safe to run repeatedly. */
export const backfillRetrievalIndex = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) =>
    z
      .object({ limitPerSource: z.number().int().min(1).max(500).optional().default(300) })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { backfillFromSources } = await import("./retrieval.server");
    return backfillFromSources(context.supabase, context.userId, data.limitPerSource);
  });

/** Process a slice of the pending-embedding queue. */
export const runEmbeddingQueue = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).optional().default(25) }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { processEmbeddingQueue } = await import("./retrieval.server");
    return processEmbeddingQueue(context.supabase, context.userId, { limit: data.limit });
  });

/** Index health for the settings/debug surface. */
export const retrievalIndexStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .handler(async ({ context }) => {
    const { indexStatus } = await import("./retrieval-index.server");
    return indexStatus(context.supabase, context.userId);
  });
