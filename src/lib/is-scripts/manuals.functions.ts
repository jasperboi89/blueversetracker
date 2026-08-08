import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";

export const MANUAL_CATEGORIES = ["supervisor", "directory", "other"] as const;
export type ManualCategory = (typeof MANUAL_CATEGORIES)[number];

export interface IsManual {
  id: string;
  name: string;
  category: ManualCategory;
  pageCount: number;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
}

export interface ManualHit {
  manualId: string;
  manualName: string;
  category: ManualCategory;
  pageNumber: number;
  text: string;
}

const IdSchema = z.string().uuid();
const SELECT_COLUMNS = "id,name,category,page_count,size_bytes,storage_path,created_at";

function mapManual(row: {
  id: string;
  name: string;
  category: string;
  page_count: number;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}): IsManual {
  return {
    id: row.id,
    name: row.name,
    category: row.category as ManualCategory,
    pageCount: row.page_count,
    sizeBytes: Number(row.size_bytes ?? 0),
    storagePath: row.storage_path,
    createdAt: row.created_at,
  };
}

export const listIsManuals = createServerFn({ method: "GET" })
  .middleware([requireActiveAuthorizedUser])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("is_manuals")
      .select(SELECT_COLUMNS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { manuals: (data ?? []).map(mapManual) };
  });

const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum(MANUAL_CATEGORIES).optional().default("other"),
  storagePath: z.string().trim().min(1).max(400),
  sizeBytes: z.number().int().min(0).max(500_000_000),
  pages: z
    .array(z.object({ pageNumber: z.number().int().min(1), text: z.string().max(200000) }))
    .max(3000),
});

export const registerIsManual = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => RegisterSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("is_manuals")
      .insert({
        user_id: context.userId,
        name: data.name,
        category: data.category,
        storage_path: data.storagePath,
        size_bytes: data.sizeBytes,
        page_count: data.pages.length,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    const rows = data.pages.map((page) => ({
      manual_id: row.id,
      user_id: context.userId,
      page_number: page.pageNumber,
      text: page.text,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error: pageError } = await context.supabase
        .from("is_manual_pages")
        .insert(rows.slice(i, i + 200));
      if (pageError) throw new Error(pageError.message);
    }
    return mapManual(row);
  });

const UpdateManualSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(200).optional(),
  category: z.enum(MANUAL_CATEGORIES).optional(),
});

export const updateIsManual = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => UpdateManualSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { id, ...changes } = data;
    const { data: row, error } = await context.supabase
      .from("is_manuals")
      .update(changes)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return mapManual(row);
  });

export const deleteIsManual = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => z.object({ id: IdSchema }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("is_manuals")
      .select("storage_path")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("is_manuals")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (row?.storage_path) {
      await context.supabase.storage.from("is-manuals").remove([row.storage_path]);
    }
    return { ok: true as const };
  });

export const searchIsManuals = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(2).max(200) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase.rpc("search_is_manual_pages", {
      p_query: data.query,
      p_limit: 40,
    });
    if (error) throw new Error(error.message);
    const hits: ManualHit[] = (rows ?? []).map((row) => ({
      manualId: row.manual_id,
      manualName: row.manual_name,
      category: row.category as ManualCategory,
      pageNumber: row.page_number,
      text: row.text,
    }));
    return { hits };
  });

export const getIsManualUrl = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => z.object({ id: IdSchema }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("is_manuals")
      .select("storage_path")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    const { data: signed, error: signError } = await context.supabase.storage
      .from("is-manuals")
      .createSignedUrl(row.storage_path, 60 * 30);
    if (signError || !signed) throw new Error(signError?.message ?? "Could not open the manual.");
    return { url: signed.signedUrl };
  });