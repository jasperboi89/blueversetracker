import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// The Supabase JS `auth.oauth` namespace is beta and not yet in the shipped types.
// Wrap the three methods we use with narrow types so the route stays type-safe.
interface OAuthDetails {
  client?: { name?: string; client_uri?: string; logo_uri?: string } | null;
  redirect_url?: string;
  redirect_to?: string;
}
interface OAuthResult {
  data: { redirect_url?: string; redirect_to?: string } | null;
  error: { message: string } | null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const oauthApi = (supabase.auth as any).oauth as {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8 text-center text-sm">
      Could not load this authorization request: {String((error as Error)?.message ?? error)}
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthApi.approveAuthorization(authorization_id)
      : await oauthApi.denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned by the authorization server."); return; }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
      <div className="glass-panel space-y-4 p-6">
        <h1 className="text-lg font-semibold text-foreground">
          Connect {clientName} to Account Intel Hub
        </h1>
        <p className="text-sm text-muted-foreground">
          This will let {clientName} read your Account Intel Hub data (contact dispatch
          sessions, tracked tickets, saved accounts, and the current night plan) as you.
          It cannot make changes.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => decide(false)}>Deny</Button>
          <Button
            disabled={busy}
            onClick={() => decide(true)}
            style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
          >
            {busy ? "Working…" : "Approve"}
          </Button>
        </div>
      </div>
    </main>
  );
}