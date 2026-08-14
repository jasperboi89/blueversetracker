import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoginCard } from "@/components/auth/LoginCard";

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
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-10">
      <div
        aria-hidden
        className="auth-aura pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, oklch(0.6 0.2 250 / 0.22), oklch(0.6 0.2 300 / 0.1) 45%, transparent 70%)",
          filter: "blur(50px)",
          animation: "auth-aura-in 1400ms ease-out both",
        }}
      />
      <div className="relative w-full max-w-md" style={{ perspective: "1200px" }}>
        <LoginCard next={safeNext} />
      </div>
    </div>
  );
}