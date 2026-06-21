import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FREQ = ["off", "low", "normal", "high"] as const;
const DENS = ["low", "medium", "high"] as const;

const setSchema = z
  .object({
    visualIntensity: z.number().int().min(1).max(5).optional(),
    eventFrequency: z.enum(FREQ).optional(),
    particleDensity: z.enum(DENS).optional(),
    sleepMode: z.boolean().optional(),
  })
  // Local-only keys (e.g. nightShiftSync, celebrations) are silently dropped.
  .passthrough();

export const getTuning = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("qb_tuning_prefs")
      .select("visual_intensity, event_frequency, particle_density, sleep_mode")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      const ins = await supabase
        .from("qb_tuning_prefs")
        .insert({ user_id: userId })
        .select("visual_intensity, event_frequency, particle_density, sleep_mode")
        .single();
      if (ins.error) throw new Error(ins.error.message);
      return shape(ins.data);
    }
    return shape(data);
  });

export const setTuning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const row = {
      user_id: userId,
      ...(data.visualIntensity !== undefined ? { visual_intensity: data.visualIntensity } : {}),
      ...(data.eventFrequency !== undefined ? { event_frequency: data.eventFrequency } : {}),
      ...(data.particleDensity !== undefined ? { particle_density: data.particleDensity } : {}),
      ...(data.sleepMode !== undefined ? { sleep_mode: data.sleepMode } : {}),
    };
    const { error } = await supabase
      .from("qb_tuning_prefs")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function shape(d: {
  visual_intensity: number;
  event_frequency: string;
  particle_density: string;
  sleep_mode: boolean;
}) {
  return {
    visualIntensity: d.visual_intensity,
    eventFrequency: d.event_frequency as (typeof FREQ)[number],
    particleDensity: d.particle_density as (typeof DENS)[number],
    sleepMode: d.sleep_mode,
  };
}
