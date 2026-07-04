import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

export type AuthorizedRole = "admin" | "programmer" | "viewer";

/**
 * Stricter wall than `requireSupabaseAuth`: a valid Supabase session is not
 * enough — the user must also be on the authorized_users allowlist with
 * status = 'active'. Every server function that proxies Freshdesk (ticket
 * bodies can contain PHI) or exposes operational data must use this.
 *
 * The lookup runs with the caller's own RLS-scoped client ("Users can view
 * own authorized row" policy), so no service-role key is involved.
 */
export const requireActiveAuthorizedUser = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase
      .from("authorized_users")
      .select("role, status")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error || !data || data.status !== "active") {
      throw new Error("Forbidden: account is not authorized for this portal");
    }

    return next({
      context: {
        role: data.role as AuthorizedRole,
      },
    });
  });
