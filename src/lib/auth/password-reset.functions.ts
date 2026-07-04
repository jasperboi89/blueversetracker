import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const Schema = z.object({
  email: z.string().email().max(320),
  redirectTo: z.string().url().max(2048),
});

/**
 * The recovery link redirect must land on this deployment, never on an
 * attacker-supplied host (open-redirect / phishing vector). Compare the
 * requested redirect host against the host serving this request.
 */
function isSameDeployment(redirectTo: string): boolean {
  try {
    const target = new URL(redirectTo);
    if (target.protocol !== "https:" && target.protocol !== "http:") return false;
    const requestHost = getRequestHeader("x-forwarded-host") ?? getRequestHeader("host") ?? null;
    if (!requestHost) return false;
    return target.host === requestHost;
  } catch {
    return false;
  }
}

/**
 * Always returns the same shape regardless of whether the email exists,
 * to prevent account enumeration.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data }) => {
    if (!isSameDeployment(data.redirectTo)) {
      // Same response shape as success — no oracle for probing.
      console.warn("[requestPasswordReset] rejected off-site redirectTo", data.redirectTo);
      return { ok: true };
    }
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
