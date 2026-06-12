import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export const adminGetAccessSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: totalCount }, { count: activeCount }] = await Promise.all([
      supabaseAdmin.from("authorized_users").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("authorized_users")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
    ]);
    return {
      total: totalCount ?? 0,
      active: activeCount ?? 0,
    };
  });