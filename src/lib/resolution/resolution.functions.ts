import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";
import {
  RESOLUTION_CONFIDENCES,
  RESOLUTION_LIMITS as L,
  RESOLUTION_STATUSES,
  resolutionFingerprint,
  type ResolutionMemory,
} from "./resolution-types";
import { mapResolutionRow, SELECT_COLUMNS } from "./resolution-map";

const text = (max: number) => z.string().trim().max(max);

const SourceSchema = z
  .object({
    ticketId: text(L.sourceId).optional(),
    ticketNumber: text(L.sourceId).optional(),
    changeRecordId: z.string().uuid().optional(),
    workItemId: text(L.sourceId).optional(),
    dispatchId: text(L.sourceId).optional(),
  })
  .default({});

const BodySchema = z.object({
  accountNumber: text(L.accountNumber).optional().default(""),
  accountName: text(L.accountName).optional().default(""),
  problem: text(L.problem).min(1),
  rootCause: text(L.rootCause).optional().default(""),
  resolution: text(L.resolution).min(1),
  testing: text(L.testing).optional().default(""),
  rollback: text(L.rollback).optional().default(""),
  affectedArea: text(L.affectedArea).optional().default(""),
  /**
   * Confidence is always an explicit operator choice. There is no default and
   * no path that infers "verified" from a completed ticket or an AI draft.
   */
  confidence: z.enum(RESOLUTION_CONFIDENCES),
});

const CreateSchema = BodySchema.extend({
  source: SourceSchema,
  supersedesId: z.string().uuid().optional(),
});

const ListSchema = z
  .object({
    accountNumber: text(L.accountNumber).optional(),
    affectedArea: text(L.affectedArea).optional(),
    confidence: z.enum(RESOLUTION_CONFIDENCES).optional(),
    status: z.enum(RESOLUTION_STATUSES).optional(),
    sourceTicketId: text(L.sourceId).optional(),
    includeInactive: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(100).optional().default(50),
  })
  .default({});

function rowPayload(
  userId: string,
  data: z.infer<typeof CreateSchema>,
): Record<string, unknown> {
  return {
    operator_user_id: userId,
    account_number: data.accountNumber,
    account_name: data.accountName,
    problem: data.problem,
    root_cause: data.rootCause,
    resolution: data.resolution,
    testing: data.testing,
    rollback: data.rollback,
    affected_area: data.affectedArea,
    confidence: data.confidence,
    source_ticket_id: data.source.ticketId ?? data.source.ticketNumber ?? "",
    source_change_record_id: data.source.changeRecordId ?? null,
    source_work_item_id: data.source.workItemId ?? "",
    source_dispatch_id: data.source.dispatchId ?? "",
    fingerprint: resolutionFingerprint(data.problem, data.resolution),
  };
}

/** Deterministic, filter-based lookup — no embeddings, no similarity (Phase 7). */
export const listResolutionMemories = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => ListSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    let query = context.supabase
      .from("resolution_memories")
      .select(SELECT_COLUMNS)
      .eq("operator_user_id", context.userId);

    if (data.accountNumber) query = query.eq("account_number", data.accountNumber);
    if (data.affectedArea) query = query.eq("affected_area", data.affectedArea);
    if (data.confidence) query = query.eq("confidence", data.confidence);
    if (data.sourceTicketId) query = query.eq("source_ticket_id", data.sourceTicketId);
    if (data.status) query = query.eq("status", data.status);
    else if (!data.includeInactive) query = query.eq("status", "active");

    const { data: rows, error } = await query
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return {
      memories: (rows ?? []).map((r) => mapResolutionRow(r as Record<string, unknown>)),
    };
  });

export const getResolutionMemory = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("resolution_memories")
      .select(SELECT_COLUMNS)
      .eq("operator_user_id", context.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? mapResolutionRow(row as Record<string, unknown>) : null;
  });

export interface CreateResolutionResult {
  memory: ResolutionMemory;
  /** True when an identical capture for the same source already existed. */
  duplicate: boolean;
  supersededId?: string;
}

export const createResolutionMemory = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ context, data }): Promise<CreateResolutionResult> => {
    const { supabase, userId } = context;

    // Supersession target must exist, belong to the operator, and be live.
    if (data.supersedesId) {
      const { data: prior, error: priorErr } = await supabase
        .from("resolution_memories")
        .select("id,status")
        .eq("operator_user_id", userId)
        .eq("id", data.supersedesId)
        .maybeSingle();
      if (priorErr) throw new Error(priorErr.message);
      if (!prior) throw new Error("Supersession target not found.");
      if ((prior as { status: string }).status !== "active") {
        throw new Error("Only an active resolution can be superseded.");
      }
    }

    const payload = {
      ...rowPayload(userId, data),
      ...(data.supersedesId ? { supersedes_id: data.supersedesId } : {}),
    };

    const { data: row, error } = await supabase
      .from("resolution_memories")
      .insert(payload)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      // Unique source+content index — a repeated save returns the original.
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("resolution_memories")
          .select(SELECT_COLUMNS)
          .eq("operator_user_id", userId)
          .eq("fingerprint", payload.fingerprint as string)
          .eq("source_ticket_id", payload.source_ticket_id as string)
          .neq("status", "archived")
          .maybeSingle();
        if (existing) {
          return {
            memory: mapResolutionRow(existing as Record<string, unknown>),
            duplicate: true,
          };
        }
      }
      throw new Error(error.message);
    }

    const memory = mapResolutionRow(row as Record<string, unknown>);

    if (data.supersedesId) {
      const { error: supErr } = await supabase
        .from("resolution_memories")
        .update({ status: "superseded" })
        .eq("operator_user_id", userId)
        .eq("id", data.supersedesId)
        .eq("status", "active");
      if (supErr) {
        // Keep the pair consistent: no orphaned "replacement" record.
        await supabase
          .from("resolution_memories")
          .delete()
          .eq("operator_user_id", userId)
          .eq("id", memory.id);
        throw new Error(`Couldn't supersede the prior resolution: ${supErr.message}`);
      }
      return { memory, duplicate: false, supersededId: data.supersedesId };
    }

    return { memory, duplicate: false };
  });

const UpdateSchema = BodySchema.partial().extend({ id: z.string().uuid() });

export const updateResolutionMemory = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { id, ...fields } = data;
    const patch: Record<string, unknown> = {};
    if (fields.problem !== undefined) patch.problem = fields.problem;
    if (fields.rootCause !== undefined) patch.root_cause = fields.rootCause;
    if (fields.resolution !== undefined) patch.resolution = fields.resolution;
    if (fields.testing !== undefined) patch.testing = fields.testing;
    if (fields.rollback !== undefined) patch.rollback = fields.rollback;
    if (fields.affectedArea !== undefined) patch.affected_area = fields.affectedArea;
    if (fields.confidence !== undefined) patch.confidence = fields.confidence;
    if (fields.accountNumber !== undefined) patch.account_number = fields.accountNumber;
    if (fields.accountName !== undefined) patch.account_name = fields.accountName;
    if (fields.problem !== undefined || fields.resolution !== undefined) {
      const { data: current, error: curErr } = await context.supabase
        .from("resolution_memories")
        .select("problem,resolution")
        .eq("operator_user_id", context.userId)
        .eq("id", id)
        .maybeSingle();
      if (curErr) throw new Error(curErr.message);
      if (!current) throw new Error("Resolution not found.");
      const cur = current as { problem: string; resolution: string };
      patch.fingerprint = resolutionFingerprint(
        (fields.problem ?? cur.problem) as string,
        (fields.resolution ?? cur.resolution) as string,
      );
    }

    const { data: row, error } = await context.supabase
      .from("resolution_memories")
      .update(patch)
      .eq("operator_user_id", context.userId)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return mapResolutionRow(row as Record<string, unknown>);
  });

export const archiveResolutionMemory = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("resolution_memories")
      .update({ status: "archived" })
      .eq("operator_user_id", context.userId)
      .eq("id", data.id)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return mapResolutionRow(row as Record<string, unknown>);
  });
