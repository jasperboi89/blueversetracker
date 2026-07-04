import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";

const PageSchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().min(0).max(50_000).default(0),
});

export interface TicketAccessRow {
  id: string;
  created_at: string;
  email: string | null;
  action: string;
  ticket_number: string | null;
  query: string | null;
  ip: string | null;
}

export interface AuthEventRow {
  id: string;
  created_at: string;
  email: string | null;
  event_type: string;
  role: string | null;
  ip: string | null;
  user_agent: string | null;
}

/**
 * Both readers run on the caller's own RLS-scoped client — the admin-only
 * SELECT policies on these tables are the enforcement, the role check here
 * is just a fast, explicit wall in front of it.
 */
export const adminListTicketAccess = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => PageSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (context.role !== "admin") throw new Error("Forbidden");
    const {
      data: rows,
      error,
      count,
    } = await context.supabase
      .from("ticket_access_log")
      .select("id, created_at, email, action, ticket_number, query, ip", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, rows: (rows ?? []) as TicketAccessRow[], total: count ?? 0 };
  });

export const adminListAuthEvents = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => PageSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (context.role !== "admin") throw new Error("Forbidden");
    const {
      data: rows,
      error,
      count,
    } = await context.supabase
      .from("auth_audit_log")
      .select("id, created_at, email, event_type, role, ip, user_agent", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, rows: (rows ?? []) as AuthEventRow[], total: count ?? 0 };
  });
