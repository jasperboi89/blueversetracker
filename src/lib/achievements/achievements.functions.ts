import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const unlockSchema = z
  .object({
    achievement_id: z.string().min(1).max(80),
    tier: z.enum(["bronze", "silver", "gold", "mythic"]),
    progress_snapshot: z.record(z.string(), z.any()).optional().default({}),
  })
  .strict();

export const listAchievements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("achievements_unlocked")
      .select("achievement_id, tier, progress_snapshot, unlocked_at")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      achievementId: r.achievement_id as string,
      tier: r.tier as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      progressSnapshot: (r.progress_snapshot ?? {}) as Record<string, any>,
      unlockedAt: r.unlocked_at as string,
    }));
  });

export const unlockAchievement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => unlockSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("achievements_unlocked")
      .insert({
        user_id: userId,
        achievement_id: data.achievement_id,
        tier: data.tier,
        progress_snapshot: data.progress_snapshot,
      });
    if (error) {
      // Ignore duplicate — already unlocked.
      if (!/duplicate key/i.test(error.message)) throw new Error(error.message);
      return { ok: true, duplicate: true };
    }
    return { ok: true, duplicate: false };
  });

export const getAchievementStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Discovery counts, grouped by kind
    const { data: discoveries, error: dErr } = await supabase
      .from("qb_discoveries")
      .select("kind, created_at, context")
      .eq("user_id", userId);
    if (dErr) throw new Error(dErr.message);

    const counts: Record<string, number> = {
      ticket: 0,
      dispatch: 0,
      night_plan: 0,
      shift: 0,
      cosmic: 0,
    };
    let overdueClears = 0;
    let nightHours = 0;
    for (const row of discoveries ?? []) {
      const kind = row.kind as string;
      counts[kind] = (counts[kind] ?? 0) + 1;
      const ctx = (row.context ?? {}) as Record<string, unknown>;
      if (kind === "shift" && (ctx.type === "overdue_cleared" || ctx.overdueCleared)) {
        overdueClears += 1;
      }
      if (row.created_at) {
        const hour = new Date(row.created_at as string).getHours();
        if (kind === "ticket" && hour >= 3 && hour < 5) nightHours += 1;
      }
    }

    // Knowledge notes count
    const { count: knowledgeCount, error: kErr } = await supabase
      .from("knowledge_notes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (kErr) throw new Error(kErr.message);

    return {
      counts,
      overdueClears,
      nightHours,
      knowledgeCount: knowledgeCount ?? 0,
    };
  });