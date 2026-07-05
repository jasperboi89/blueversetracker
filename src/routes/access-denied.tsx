import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ShieldIcon3D } from "@/components/auth/ShieldIcon3D";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/access-denied")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Access Denied — Account Intel Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  const navigate = useNavigate();
  async function returnToLogin() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div
        className="glass-panel w-full max-w-md rounded-2xl px-6 py-7 text-center sm:px-8 sm:py-8"
        style={{
          boxShadow:
            "0 0 60px oklch(0.55 0.2 240 / 0.18), inset 0 1px 0 oklch(1 0 0 / 0.08)",
        }}
      >
        <div className="flex justify-center">
          <ShieldIcon3D />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-wide text-foreground">
          Access Denied
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your account is not authorized to access Account Intel Hub. Please contact
          an administrator if you believe this is a mistake.
        </p>
        <Button onClick={returnToLogin} className="mt-6 w-full">
          Return to Login
        </Button>
      </div>
    </div>
  );
}