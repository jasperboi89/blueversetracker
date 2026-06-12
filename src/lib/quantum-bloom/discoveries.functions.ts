import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = ["ticket", "dispatch", "night_plan", "shift"] as const;

const recordSchema = z
  .object({
    kind: z.enum(KINDS),
    label: z.string().min(1).max(200),
    context: z.record(z.string(), z.any()).optional().default({}),
  })
  .strict();

export const listDiscoveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("qb_discoveries")
      .select("id, kind, label, context, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      kind: r.kind as (typeof KINDS)[number],
      label: r.label as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context: (r.context ?? {}) as Record<string, any>,
      createdAt: r.created_at as string,
    }));
  });

export const recordDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("qb_discoveries").insert({
      user_id: userId,
      kind: data.kind,
      label: data.label,
      context: data.context,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetDiscoveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("qb_discoveries")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
