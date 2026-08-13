/**
 * Client-side retrieval access.
 *
 * Retrieval is an assist: every failure path returns an empty, explained
 * result instead of throwing into the UI. Index freshness is driven off the
 * Event Spine so nothing has to remember to re-index by hand.
 */
import { eventSpine } from "@/lib/core/event-spine";
import type { AccEventType } from "@/lib/core/events";
import {
  backfillRetrievalIndex,
  reindexRetrievalSource,
  runEmbeddingQueue,
  searchOperationalKnowledge,
} from "./retrieval.functions";
import type {
  RetrievalResponse,
  RetrievalSourceType,
  SearchOperationalKnowledgeInput,
} from "./retrieval-types";

export async function findKnowledge(
  input: SearchOperationalKnowledgeInput,
): Promise<RetrievalResponse> {
  try {
    return (await searchOperationalKnowledge({ data: input })) as RetrievalResponse;
  } catch (e) {
    return {
      results: [],
      modeUsed: "lexical",
      semanticAvailable: false,
      warnings: [e instanceof Error ? e.message : "Search failed."],
    };
  }
}

/** Fire-and-forget: a failed re-index must never break the write it followed. */
export function queueReindex(sourceType: RetrievalSourceType, sourceId: string): void {
  if (!sourceId) return;
  void reindexRetrievalSource({ data: { sourceType, sourceId } })
    .then(() => runEmbeddingQueue({ data: { limit: 10 } }))
    .catch(() => undefined);
}

const RESOLUTION_EVENTS: AccEventType[] = [
  "resolution.created",
  "resolution.updated",
  "resolution.superseded",
  "resolution.archived",
];
const CHANGE_EVENTS: AccEventType[] = ["change.created", "change.applied", "change.verified"];
const KNOWLEDGE_EVENTS: AccEventType[] = ["knowledge.created", "knowledge.updated"];

let syncStarted = false;

/**
 * Keep the index in step with authoritative writes. Runs once per session;
 * a one-time backfill picks up anything created before Phase 7 existed.
 */
export function startRetrievalSync(): () => void {
  if (syncStarted) return () => undefined;
  syncStarted = true;

  void backfillRetrievalIndex({ data: {} })
    .then(() => runEmbeddingQueue({ data: { limit: 25 } }))
    .catch(() => undefined);

  const off = eventSpine.subscribe((event) => {
    const meta = event.metadata ?? {};
    if (RESOLUTION_EVENTS.includes(event.type)) {
      const id = typeof meta.resolutionId === "string" ? meta.resolutionId : "";
      queueReindex("resolution", id);
    } else if (CHANGE_EVENTS.includes(event.type)) {
      const id = typeof meta.itemId === "string" ? meta.itemId : "";
      queueReindex("change_record", id);
    } else if (KNOWLEDGE_EVENTS.includes(event.type)) {
      const id = typeof meta.itemId === "string" ? meta.itemId : "";
      queueReindex("knowledge", id);
    }
  });

  return () => {
    off();
    syncStarted = false;
  };
}
