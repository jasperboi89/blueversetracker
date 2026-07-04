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

// Best-effort per-IP throttle so the unauthenticated endpoint can't be used
// to flood auth_audit_log. In-memory per instance — a cap, not a guarantee.
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_EVENTS = 20;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function allowPublicEvent(ip: string | null): boolean {
  const key = ip ?? "unknown";
  const now = Date.now();
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (now > v.resetAt) rateBuckets.delete(k);
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_MAX_EVENTS) return false;
  bucket.count += 1;
  return true;
}

/** Public — used before/at sign-in. Records failed attempts and denials. */
export const logAuthEventPublic = createServerFn({ method: "POST" })
  .inputValidator((input) => PublicEventSchema.parse(input))
  .handler(async ({ data }) => {
    if (!allowPublicEvent(safeIp())) return { ok: true };
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