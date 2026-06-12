import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Schema = z.object({
  email: z.string().email().max(320),
  redirectTo: z.string().url().max(2048),
});

/**
 * Always returns the same shape regardless of whether the email exists,
 * to prevent account enumeration.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Use the admin client's auth API to send a recovery link.
    try {
      await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
        redirectTo: data.redirectTo,
      });
    } catch (err) {
      // Swallow errors to avoid enumeration; log server-side only.
      console.warn("[requestPasswordReset]", err);
    }
    return { ok: true };
  });