import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HubRole = "admin" | "programmer" | "viewer";

export type AuthorizationResult =
  | { ok: true; role: HubRole; email: string }
  | { ok: false; reason: "disabled" | "not_found"; email: string | null };

function safeIp() {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? null;
  } catch {
    return null;
  }
}

function safeUa() {
  const ua = getRequestHeader("user-agent") ?? null;
  return ua ? ua.slice(0, 500) : null;
}

/**
 * Server-side check that the signed-in user is on the authorized_users list
 * and Active. Updates last_login_at and writes the appropriate audit event.
 */
export const checkAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuthorizationResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claims = context.claims as { email?: string } | null;
    const email = claims?.email ?? null;

    const { data: row } = await supabaseAdmin
      .from("authorized_users")
      .select("id, user_id, email, role, status")
      .eq("user_id", context.userId)
      .maybeSingle();

    // Fallback link-by-email in case trigger missed (e.g. case sensitivity)
    let resolved = row;
    if (!resolved && email) {
      const { data: byEmail } = await supabaseAdmin
        .from("authorized_users")
        .select("id, user_id, email, role, status")
        .ilike("email", email)
        .maybeSingle();
      if (byEmail) {
        if (!byEmail.user_id) {
          await supabaseAdmin
            .from("authorized_users")
            .update({ user_id: context.userId })
            .eq("id", byEmail.id);
        }
        resolved = byEmail;
      }
    }

    const ip = safeIp();
    const ua = safeUa();

    if (!resolved) {
      await supabaseAdmin.from("auth_audit_log").insert({
        event_type: "access_denied",
        user_id: context.userId,
        email,
        ip,
        user_agent: ua,
        meta: { reason: "not_found" },
      });
      return { ok: false, reason: "not_found", email };
    }

    if (resolved.status !== "active") {
      await supabaseAdmin.from("auth_audit_log").insert({
        event_type: "access_denied",
        user_id: context.userId,
        email: resolved.email,
        role: resolved.role,
        ip,
        user_agent: ua,
        meta: { reason: "disabled" },
      });
      return { ok: false, reason: "disabled", email: resolved.email };
    }

    await supabaseAdmin
      .from("authorized_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", resolved.id);

    await supabaseAdmin.from("auth_audit_log").insert({
      event_type: "login_success",
      user_id: context.userId,
      email: resolved.email,
      role: resolved.role,
      ip,
      user_agent: ua,
    });

    return { ok: true, role: resolved.role as HubRole, email: resolved.email };
  });