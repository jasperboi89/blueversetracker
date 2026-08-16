import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoginCard } from "@/components/auth/LoginCard";
import { AuthAtmosphere } from "@/components/auth/AuthAtmosphere";
import { PortalHero } from "@/components/auth/PortalHero";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign In — Account Intel Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuthPage,
});

function isSafeRelativePath(p: string | undefined): p is string {
  return !!p && p.startsWith("/") && !p.startsWith("//");
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const safeNext = isSafeRelativePath(next) ? next : undefined;
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        if (safeNext) {
          window.location.replace(safeNext);
        } else {
          navigate({ to: "/", replace: true });
        }
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, safeNext]);

  if (checking) return null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <AuthAtmosphere />
      <div className="relative grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_460px] lg:gap-16">
        <PortalHero />
        <div className="w-full justify-self-center" style={{ perspective: "1400px" }}>
          <LoginCard next={safeNext} />
        </div>
      </div>
    </div>
  );
}