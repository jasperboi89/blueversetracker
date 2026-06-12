import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoginCard } from "@/components/auth/LoginCard";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign In — Account Intel Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        navigate({ to: "/", replace: true });
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <LoginCard />
    </div>
  );
}