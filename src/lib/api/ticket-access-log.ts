import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

export type TicketAccessAction = "pull" | "sync" | "search" | "conversations" | "coverage";

/**
 * HIPAA access-audit trail: record every ticket/PHI access that flows through
 * the Freshdesk server functions. Failures are logged but never block the
 * request — the audit write must not take the portal down.
 */
export async function logTicketAccess(entry: {
  userId: string;
  email?: string | null;
  action: TicketAccessAction;
  ticketNumber?: string;
  query?: string;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ip: string | null = null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
    } catch {
      /* no request context */
    }
    const ua = getRequestHeader("user-agent")?.slice(0, 500) ?? null;
    await supabaseAdmin.from("ticket_access_log").insert({
      user_id: entry.userId,
      email: entry.email ?? null,
      action: entry.action,
      ticket_number: entry.ticketNumber ?? null,
      query: entry.query?.slice(0, 500) ?? null,
      ip,
      user_agent: ua,
    });
  } catch (err) {
    console.warn("[ticket-access-log] write failed", err);
  }
}

/** Pull the signed-in user's email out of the auth middleware's JWT claims. */
export function emailFromClaims(claims: unknown): string | null {
  return (claims as { email?: string } | null)?.email ?? null;
}
