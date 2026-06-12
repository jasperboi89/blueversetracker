import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PublicEventSchema = z.object({
  type: z.enum(["login_failed", "access_denied"]),
  email: z.string().email().max(320).optional(),
});

const AuthedEventSchema = z.object({
  type: z.enum(["logout", "session_timeout", "role_check_failed"]),
});

function safeUserAgent() {
  const ua = getRequestHeader("user-agent") ?? null;
  return ua ? ua.slice(0, 500) : null;
}

function safeIp() {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? null;
  } catch {
    return null;
  }
}

/** Public — used before/at sign-in. Records failed attempts and denials. */
export const logAuthEventPublic = createServerFn({ method: "POST" })
  .inputValidator((input) => PublicEventSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("auth_audit_log").insert({
      event_type: data.type,
      email: data.email ?? null,
      ip: safeIp(),
      user_agent: safeUserAgent(),
    });
    return { ok: true };
  });

/** Authenticated — logout, session timeout. */
export const logAuthEventAuthed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AuthedEventSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claims = context.claims as { email?: string } | null;
    const { data: row } = await supabaseAdmin
      .from("authorized_users")
      .select("role,email")
      .eq("user_id", context.userId)
      .maybeSingle();
    await supabaseAdmin.from("auth_audit_log").insert({
      event_type: data.type,
      user_id: context.userId,
      email: row?.email ?? claims?.email ?? null,
      role: row?.role ?? null,
      ip: safeIp(),
      user_agent: safeUserAgent(),
    });
    return { ok: true };
  });