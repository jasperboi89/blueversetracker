import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";

export interface HandoffItem {
  id: string;
  label: string;
  detail: string;
  /** Free-form origin tag, e.g. "ticket 12345" or "additional work". */
  source: string;
  done: boolean;
}

export interface ShiftHandoff {
  id: string;
  shiftKey: string;
  shiftDate: string;
  summary: string;
  watchItems: HandoffItem[];
  openItems: HandoffItem[];
  escalations: string;
  notes: string;
  status: "draft" | "published";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const SELECT_COLUMNS =
  "id,shift_key,shift_date,summary,watch_items,open_items,escalations,notes,status,published_at,created_at,updated_at";

const ItemsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      label: z.string().trim().min(1).max(400),
      detail: z.string().max(4000).optional().default(""),
      source: z.string().max(120).optional().default(""),
      done: z.boolean().optional().default(false),
    }),
  )
  .max(100);

function mapRow(row: Record<string, unknown>): ShiftHandoff {
  return {
    id: row.id as string,
    shiftKey: (row.shift_key as string) ?? "",
    shiftDate: (row.shift_date as string) ?? "",
    summary: (row.summary as string) ?? "",
    watchItems: Array.isArray(row.watch_items) ? (row.watch_items as HandoffItem[]) : [],
    openItems: Array.isArray(row.open_items) ? (row.open_items as HandoffItem[]) : [],
    escalations: (row.escalations as string) ?? "",
    notes: (row.notes as string) ?? "",
    status: ((row.status as string) === "published" ? "published" : "draft"),
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const listShiftHandoffs = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(60).optional().default(20) }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("shift_handoffs")
      .select(SELECT_COLUMNS)
      .eq("user_id", context.userId)
      .order("shift_key", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { handoffs: (rows ?? []).map((r) => mapRow(r as Record<string, unknown>)) };
  });

const SaveSchema = z.object({
  shiftKey: z.string().trim().min(1).max(32),
  summary: z.string().max(20000).optional().default(""),
  watchItems: ItemsSchema.optional().default([]),
  openItems: ItemsSchema.optional().default([]),
  escalations: z.string().max(20000).optional().default(""),
  notes: z.string().max(20000).optional().default(""),
  status: z.enum(["draft", "published"]).optional().default("draft"),
});

/** Create or update this shift's handoff (one row per shift key). */
export const saveShiftHandoff = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("shift_handoffs")
      .upsert(
        {
          user_id: context.userId,
          shift_key: data.shiftKey,
          summary: data.summary,
          watch_items: data.watchItems,
          open_items: data.openItems,
          escalations: data.escalations,
          notes: data.notes,
          status: data.status,
          published_at: data.status === "published" ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,shift_key" },
      )
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return mapRow(row as Record<string, unknown>);
  });

export const deleteShiftHandoff = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("shift_handoffs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });