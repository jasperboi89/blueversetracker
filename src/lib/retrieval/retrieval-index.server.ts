// Server-only: single-record re-projection + index health.
import type { Client } from "./retrieval.server";
import { removeDocuments, upsertDocuments } from "./retrieval.server";
import {
  changeRecordToRetrievalDocument,
  knowledgeToRetrievalDocuments,
  resolutionToRetrievalDocument,
} from "./projections";
import { mapResolutionRow, SELECT_COLUMNS as RESOLUTION_COLUMNS } from "@/lib/resolution/resolution-map";
import type { AccountChangeRecord } from "@/lib/changes/changes.functions";
import type { KnowledgeNote } from "@/lib/knowledge/knowledge.functions";
import type { RetrievalDocumentInput, RetrievalSourceType } from "./retrieval-types";

export async function reindexOneSource(
  client: Client,
  userId: string,
  sourceType: RetrievalSourceType,
  sourceId: string,
): Promise<{ indexed: number }> {
  let docs: RetrievalDocumentInput[] = [];

  if (sourceType === "resolution") {
    const { data } = await client
      .from("resolution_memories")
      .select(RESOLUTION_COLUMNS)
      .eq("operator_user_id", userId)
      .eq("id", sourceId)
      .maybeSingle();
    if (data) docs = [resolutionToRetrievalDocument(mapResolutionRow(data as Record<string, unknown>))];
  } else if (sourceType === "change_record") {
    const { data } = await client
      .from("account_change_records")
      .select(
        "id,account_number,account_name,title,change_type,risk,status,rollback_note,ticket_number,created_at,updated_at",
      )
      .eq("user_id", userId)
      .eq("id", sourceId)
      .maybeSingle();
    if (data) {
      const r = data as Record<string, unknown>;
      docs = [
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
      ];
    }
  } else if (sourceType === "knowledge" || sourceType === "runbook") {
    const { data } = await client
      .from("knowledge_notes")
      .select("id,title,content_html,note_type,tags,is_archived,created_at,updated_at")
      .eq("user_id", userId)
      .eq("id", sourceId)
      .maybeSingle();
    if (data) {
      const r = data as Record<string, unknown>;
      docs = knowledgeToRetrievalDocuments({
        id: String(r.id),
        title: String(r.title ?? ""),
        contentHtml: String(r.content_html ?? ""),
        noteType: String(r.note_type ?? "note"),
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        isArchived: Boolean(r.is_archived),
        createdAt: String(r.created_at ?? ""),
        updatedAt: String(r.updated_at ?? ""),
      } as KnowledgeNote);
      // A note can flip between knowledge and runbook; clear the other slot.
      const other = docs[0]?.sourceType === "runbook" ? "knowledge" : "runbook";
      await removeDocuments(client, userId, other, sourceId);
    }
  }

  if (docs.length === 0) {
    await removeDocuments(client, userId, sourceType, sourceId);
    return { indexed: 0 };
  }
  await upsertDocuments(client, userId, docs);
  return { indexed: docs.length };
}

export interface RetrievalIndexStatus {
  total: number;
  pending: number;
  ready: number;
  failed: number;
  stale: number;
}

export async function indexStatus(client: Client, userId: string): Promise<RetrievalIndexStatus> {
  const countFor = async (status?: string) => {
    let q = client
      .from("retrieval_documents")
      .select("id", { count: "exact", head: true })
      .eq("operator_user_id", userId);
    if (status) q = q.eq("embedding_status", status);
    const { count } = await q;
    return count ?? 0;
  };
  const [total, pending, ready, failed] = await Promise.all([
    countFor(),
    countFor("pending"),
    countFor("ready"),
    countFor("failed"),
  ]);
  return { total, pending, ready, failed, stale: pending + failed };
}
