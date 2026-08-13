import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ThemeName } from "./theme-store";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const setSchema = z
  .object({
    theme: z.enum(["blueverse", "quantum-bloom", "holoquiet"]).optional(),
    qbFirstEntryCompleted: z.boolean().optional(),
  })
  .strict();

export const getThemePrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_theme_prefs")
      .select("theme, qb_first_entry_completed")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      const ins = await supabase
        .from("user_theme_prefs")
        .insert({ user_id: userId })
        .select("theme, qb_first_entry_completed")
        .single();
      if (ins.error) throw new Error(ins.error.message);
      return {
        theme: ins.data.theme as ThemeName,
        qbFirstEntryCompleted: ins.data.qb_first_entry_completed,
      };
    }
    return {
      theme: data.theme as ThemeName,
      qbFirstEntryCompleted: data.qb_first_entry_completed,
    };
  });

export const setThemePrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const row: {
      user_id: string;
      theme?: string;
      qb_first_entry_completed?: boolean;
    } = { user_id: userId };
    if (data.theme !== undefined) row.theme = data.theme;
    if (data.qbFirstEntryCompleted !== undefined)
      row.qb_first_entry_completed = data.qbFirstEntryCompleted;
    const { error } = await supabase
      .from("user_theme_prefs")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });