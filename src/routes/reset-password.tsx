import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldIcon3D } from "@/components/auth/ShieldIcon3D";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset Password — Account Intel Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash automatically; just wait one tick.
    const t = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message || "Could not update password.");
      setLoading(false);
      return;
    }
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!ready) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div
        className="glass-pane w-full max-w-md rounded-2xl px-6 py-7 sm:px-8 sm:py-8"
        style={{
          boxShadow:
            "0 0 60px oklch(0.55 0.2 240 / 0.18), inset 0 1px 0 oklch(1 0 0 / 0.08)",
        }}
      >
        <div className="flex flex-col items-center text-center">
          <ShieldIcon3D />
          <h1 className="mt-4 text-xl font-semibold text-foreground">Reset Password</h1>
          <p className="mt-1 text-xs text-muted-foreground">Choose a new password for your account.</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            New password
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" autoComplete="new-password" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Confirm password
            <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-10" autoComplete="new-password" />
          </label>
          <Button type="submit" disabled={loading} className="mt-1 h-10 w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}