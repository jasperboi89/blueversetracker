import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldIcon3D } from "./ShieldIcon3D";
import { checkAuthorization } from "@/lib/auth/authorization.functions";
import { logAuthEventPublic } from "@/lib/auth/audit.functions";
import { requestPasswordReset } from "@/lib/auth/password-reset.functions";

type Mode = "signin" | "forgot";

export function LoginCard() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        await logAuthEventPublic({ data: { type: "login_failed", email: email.trim() } }).catch(() => {});
        toast.error("Invalid email or password.");
        setLoading(false);
        return;
      }
      const result = await checkAuthorization();
      if (!result.ok) {
        await supabase.auth.signOut();
        navigate({ to: "/access-denied", replace: true });
        return;
      }
      navigate({ to: "/", replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      await requestPasswordReset({ data: { email: email.trim(), redirectTo } });
      toast.success("If an account exists, a reset link will be sent.");
      setMode("signin");
    } catch {
      toast.success("If an account exists, a reset link will be sent.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="glass-pane relative w-full max-w-md rounded-2xl px-6 py-7 sm:px-8 sm:py-8"
      style={{
        boxShadow:
          "0 0 60px oklch(0.55 0.2 240 / 0.18), inset 0 1px 0 oklch(1 0 0 / 0.08)",
      }}
    >
      <div className="flex flex-col items-center text-center">
        <ShieldIcon3D />
        <h1 className="mt-4 text-xl font-semibold tracking-wide text-foreground">
          Account Intel Hub
        </h1>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          AnSer Ops
        </div>
        <div
          className="mt-3 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]"
          style={{
            color: "var(--cyan-glow)",
            background: "oklch(0.4 0.16 240 / 0.18)",
            border: "1px solid oklch(0.55 0.2 240 / 0.35)",
          }}
        >
          HIPAA-Safeguarded · Internal Use
        </div>
      </div>

      <p className="mt-5 text-[12px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Authorized access only.</span>{" "}
        This system may contain confidential operational and protected information.
        Access is restricted to approved personnel only.
      </p>

      {mode === "signin" ? (
        <form onSubmit={handleSignIn} className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Email
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@anser.com"
              className="h-10"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Password
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10"
            />
          </label>
          <Button type="submit" disabled={loading} className="mt-1 h-10 w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
          </Button>
          <button
            type="button"
            onClick={() => setMode("forgot")}
            className="self-center text-[12px] text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </button>
        </form>
      ) : (
        <form onSubmit={handleForgot} className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Email
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@anser.com"
              className="h-10"
            />
          </label>
          <Button type="submit" disabled={loading} className="mt-1 h-10 w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reset Link"}
          </Button>
          <button
            type="button"
            onClick={() => setMode("signin")}
            className="self-center text-[12px] text-muted-foreground hover:text-foreground"
          >
            ← Back to sign in
          </button>
        </form>
      )}

      <div className="mt-5 border-t border-border/40 pt-3 text-center text-[11px] leading-relaxed text-muted-foreground/80">
        By signing in, you agree to use this system only for authorized work purposes.
      </div>
    </div>
  );
}