import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";
import { ledgerCategory, ledgerSensitivity, LEDGER_SCHEMA_VERSION } from "./ledger-events";
import type { AccEventType } from "./events";

/**
 * Server-backed Operational Event Ledger — append + query (Phase 3, Part 1).
 *
 * The durable backing behind the Phase 2 ledger API. Append is idempotent
 * (unique operator_user_id + event_id), the table is append-only (no
 * update/delete grant), and reads are per-operator via RLS. Callers treat every
 * call as best-effort: on failure the client keeps operating from the local
 * bounded cache, so a ledger outage never takes the portal down.
 *
 * The generated Supabase `Database` type does not yet include this table (its
 * migration ships in this PR and types are regenerated post-deploy), so the
 * query builder is accessed through a localized `as any`, exactly as
 * `cloud-sync/blob-sync.ts` does for its untyped upsert.
 */

const TABLE = "operational_event_ledger";

export interface ServerLedgerEvent {
  eventId: string;
  type: string;
  category: string;
  source: string;
  sensitivity: string;
  accountId: string;
  ticketId: string;
  workItemId: string;
  dispatchId: string;
  occurredAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

const MetaValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

const EventInput = z.object({
  eventId: z.string().min(1).max(80),
  type: z.string().min(1).max(80),
  source: z.string().min(1).max(40),
  accountId: z.string().max(40).optional().default(""),
  ticketId: z.string().max(80).optional().default(""),
  workItemId: z.string().max(80).optional().default(""),
  dispatchId: z.string().max(80).optional().default(""),
  occurredAt: z.string().max(40),
  metadata: z.record(MetaValue).optional().default({}),
});

const AppendSchema = z.object({ events: z.array(EventInput).max(200) });

const QuerySchema = z
  .object({
    accountId: z.string().max(40).optional(),
    ticketId: z.string().max(80).optional(),
    workItemId: z.string().max(80).optional(),
    types: z.array(z.string().max(80)).max(40).optional(),
    sinceIso: z.string().max(40).optional(),
    untilIso: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(500).optional().default(200),
  })
  .default({});

interface LedgerRow {
  event_id?: string;
  type?: string;
  category?: string;
  source?: string;
  sensitivity?: string;
  account_id?: string;
  ticket_id?: string;
  work_item_id?: string;
  dispatch_id?: string;
  occurred_at?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

function mapRow(r: LedgerRow): ServerLedgerEvent {
  return {
    eventId: r.event_id ?? "",
    type: r.type ?? "",
    category: r.category ?? "operational",
    source: r.source ?? "system",
    sensitivity: r.sensitivity ?? "operational",
    accountId: r.account_id ?? "",
    ticketId: r.ticket_id ?? "",
    workItemId: r.work_item_id ?? "",
    dispatchId: r.dispatch_id ?? "",
    occurredAt: r.occurred_at ?? "",
    metadata: r.metadata ?? {},
  };
}

/** Append a batch of already-sanitized, allowlisted durable events. Idempotent. */
export const appendLedgerEvents = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => AppendSchema.parse(input))
  .handler(async ({ context, data }): Promise<{ inserted: number }> => {
    if (data.events.length === 0) return { inserted: 0 };
    const rows = data.events.map((e) => ({
      operator_user_id: context.userId,
      event_id: e.eventId,
      schema_version: LEDGER_SCHEMA_VERSION,
      type: e.type,
      category: ledgerCategory(e.type as AccEventType) ?? "operational",
      source: e.source,
      sensitivity: ledgerSensitivity(e.type as AccEventType),
      account_id: e.accountId,
      ticket_id: e.ticketId,
      work_item_id: e.workItemId,
      dispatch_id: e.dispatchId,
      occurred_at: e.occurredAt,
      metadata: e.metadata,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any)
      .from(TABLE)
      .upsert(rows, { onConflict: "operator_user_id,event_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

/** Query the durable ledger. Deterministic, bounded, per-operator. */
export const queryLedgerEvents = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => QuerySchema.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<{ events: ServerLedgerEvent[] }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (context.supabase as any)
      .from(TABLE)
      .select(
        "event_id,type,category,source,sensitivity,account_id,ticket_id,work_item_id,dispatch_id,occurred_at,metadata",
      )
      .eq("operator_user_id", context.userId);

    if (data.accountId) query = query.eq("account_id", data.accountId);
    if (data.ticketId) query = query.eq("ticket_id", data.ticketId);
    if (data.workItemId) query = query.eq("work_item_id", data.workItemId);
    if (data.types && data.types.length) query = query.in("type", data.types);
    if (data.sinceIso) query = query.gte("occurred_at", data.sinceIso);
    if (data.untilIso) query = query.lte("occurred_at", data.untilIso);

    const { data: rows, error } = await query
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { events: ((rows ?? []) as LedgerRow[]).map(mapRow) };
  });
