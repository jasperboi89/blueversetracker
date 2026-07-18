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