/**
 * Durable action ledger — server authority for authentication, idempotency,
 * and the audit trail. RLS scopes every row to the acting operator; the unique
 * (operator_user_id, idempotency_key) index is what actually prevents a
 * duplicate execution, not a disabled button.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ACTION_TYPES = [
  "add_night_plan_item",
  "complete_night_plan_item",
  "set_ticket_classification",
  "start_timer",
] as const;

const ORIGINS = ["copilot", "operator", "awareness", "system"] as const;

/**
 * A reservation is a lease, not a permanent lock. If a client dies between
 * reserve and finalize, the row stays "executing"; once the lease expires the
 * next attempt is told the outcome is UNCERTAIN (not "already applied", not
 * "safe to rerun"), because the client mutation and this server row are two
 * separate writes and cannot be one atomic transaction.
 */
const LEASE_MS = 90_000;

const SNAPSHOT_KEYS = [
  "classification",
  "status",
  "priority",
  "itemId",
  "ticketId",
  "ticketNumber",
  "workItemId",
  "kind",
] as const;

/** Server-side re-validation: only allowlisted, small primitives survive. */
const snapshotSchema = z
  .object(
    Object.fromEntries(
      SNAPSHOT_KEYS.map((k) => [
        k,
        z.union([z.string().max(80), z.number(), z.boolean(), z.null()]).optional(),
      ]),
    ) as Record<string, z.ZodTypeAny>,
  )
  .strict()
  .nullable()
  .optional();

const reserveSchema = z
  .object({
    actionId: z.string().min(1).max(120),
    idempotencyKey: z.string().min(1).max(200),
    actionType: z.enum(ACTION_TYPES),
    origin: z.enum(ORIGINS),
    entityType: z.string().max(60).optional(),
    entityId: z.string().max(120).optional(),
    proposalId: z.string().max(120).optional(),
  })
  .strict();

const finalizeSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(200),
    status: z.enum(["success", "failed"]),
    before: snapshotSchema,
    after: snapshotSchema,
    entityType: z.string().max(60).optional(),
    entityId: z.string().max(120).optional(),
    error: z.string().max(300).optional(),
  })
  .strict();

/**
 * Claim the idempotency key. "reserved" means this caller owns the execution;
 * "duplicate" means it already ran (or is running) and must not run again.
 */
export const reserveAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reserveSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("action_ledger")
      .insert({
        action_id: data.actionId,
        idempotency_key: data.idempotencyKey,
        action_type: data.actionType,
        origin: data.origin,
        operator_user_id: userId,
        entity_type: data.entityType ?? null,
        entity_id: data.entityId ?? null,
        proposal_id: data.proposalId ?? null,
        status: "executing",
      })
      .select("id, status")
      .single();

    if (error) {
      // 23505 = unique violation on (operator_user_id, idempotency_key)
      if (error.code === "23505") {
        const { data: prior } = await supabase
          .from("action_ledger")
          .select("id, status, created_at, executed_at")
          .eq("operator_user_id", userId)
          .eq("idempotency_key", data.idempotencyKey)
          .maybeSingle();
        const priorStatus = (prior?.status as string | null) ?? null;
        const recordId = (prior?.id as string | null) ?? null;

        // Known success: the only case that may report a clean duplicate.
        if (priorStatus === "success") {
          return { outcome: "duplicate_success" as const, recordId, priorStatus };
        }

        // Known failure: nothing was applied, so hand the key back for a retry.
        if (priorStatus === "failed" && recordId) {
          await supabase
            .from("action_ledger")
            .update({ status: "executing", executed_at: new Date().toISOString(), error: null } as never)
            .eq("id", recordId)
            .eq("operator_user_id", userId);
          return { outcome: "retry" as const, recordId, priorStatus };
        }

        if (priorStatus === "executing") {
          const anchor = Date.parse(
            (prior?.executed_at as string | null) ?? (prior?.created_at as string) ?? "",
          );
          const fresh = Number.isFinite(anchor) && Date.now() - anchor < LEASE_MS;
          // Still inside the lease: another attempt owns it right now.
          if (fresh) return { outcome: "in_flight" as const, recordId, priorStatus };
          if (recordId) {
            await supabase
              .from("action_ledger")
              .update({
                status: "uncertain",
                error: "Reservation lease expired before the outcome was recorded.",
              } as never)
              .eq("id", recordId)
              .eq("operator_user_id", userId);
          }
          return { outcome: "uncertain" as const, recordId, priorStatus };
        }

        // Already marked uncertain — needs an operator decision, not a rerun.
        return { outcome: "uncertain" as const, recordId, priorStatus };
      }
      throw new Error(error.message);
    }
    return { outcome: "reserved" as const, recordId: row.id as string, priorStatus: null };
  });

/** Close out the reserved record with the outcome and minimal snapshots. */
export const finalizeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => finalizeSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: {
      status: string;
      executed_at: string;
      before_state: unknown;
      after_state: unknown;
      error: string | null;
      entity_type?: string;
      entity_id?: string;
    } = {
      status: data.status,
      executed_at: new Date().toISOString(),
      before_state: data.before ?? null,
      after_state: data.after ?? null,
      error: data.error ?? null,
    };
    if (data.entityType) patch.entity_type = data.entityType;
    if (data.entityId) patch.entity_id = data.entityId;
    const { error } = await supabase
      .from("action_ledger")
      .update(patch as never)
      .eq("operator_user_id", userId)
      .eq("idempotency_key", data.idempotencyKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Recent execution history for the signed-in operator. */
export const listActionLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("action_ledger")
      .select(
        "id, action_id, action_type, origin, status, entity_type, entity_id, before_state, after_state, error, created_at, executed_at",
      )
      .eq("operator_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
