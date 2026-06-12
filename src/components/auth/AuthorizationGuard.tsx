import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthorization, type AuthorizationResult } from "@/lib/auth/authorization.functions";
import { HubIdentityProvider } from "@/lib/auth/role-context";

type State =
  | { kind: "loading" }
  | { kind: "ok"; userId: string; email: string; role: AuthorizationResult & { ok: true }["role"] }
  | { kind: "denied" }
  | { kind: "signed_out" };

export function AuthorizationGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data.user) {
        setState({ kind: "signed_out" });
        navigate({ to: "/auth", replace: true });
        return;
      }
      try {
        const result = await checkAuthorization();
        if (cancelled) return;
        if (!result.ok) {
          await supabase.auth.signOut();
          setState({ kind: "denied" });
          navigate({ to: "/access-denied", replace: true });
          return;
        }
        setState({
          kind: "ok",
          userId: data.user.id,
          email: result.email,
          role: result.role,
        });
      } catch (err) {
        console.error("[AuthorizationGuard]", err);
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (state.kind !== "ok") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <HubIdentityProvider
      value={{ userId: state.userId, email: state.email, role: state.role }}
    >
      {children}
    </HubIdentityProvider>
  );
}