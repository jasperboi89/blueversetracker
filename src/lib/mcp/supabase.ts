import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/**
 * Build a Supabase client that forwards the MCP caller's bearer token so RLS
 * runs as the signed-in user. Never returns/logs the token.
 */
export function supabaseForCaller(ctx: ToolContext): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env not configured on server");
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Read a per-user JSON blob from user_store_blobs. */
export async function readStoreBlob<T>(ctx: ToolContext, storeKey: string): Promise<T | null> {
  const sb = supabaseForCaller(ctx);
  const { data, error } = await sb
    .from("user_store_blobs")
    .select("data")
    .eq("user_id", ctx.getUserId())
    .eq("store_key", storeKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.data ?? null) as T | null;
}

export function notAuthed() {
  return { content: [{ type: "text" as const, text: "Not authenticated" }], isError: true };
}

export function json(value: unknown) {
  const text = JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text }] };
}