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

export function LoginCard({ next }: { next?: string } = {}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function goAfterAuth() {
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      window.location.replace(next);
    } else {
      navigate({ to: "/", replace: true });
    }
  }

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
      goAfterAuth();
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
      className="auth-card-in auth-terminal relative w-full max-w-md overflow-hidden rounded-[26px] px-6 py-7 sm:px-8 sm:py-9"
      style={{
        animation:
          "auth-card-in 1100ms cubic-bezier(0.16, 1, 0.3, 1) both, float-y 9s ease-in-out 1400ms infinite",
        transformStyle: "preserve-3d",
      }}
    >
      <span
        aria-hidden
        className="auth-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/2"
        style={{
          background:
            "linear-gradient(100deg, transparent, oklch(1 0 0 / 0.14), transparent)",
          animation: "auth-sweep 1500ms 500ms ease-out both",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 -top-px h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--cyan-glow), transparent)",
          opacity: 0.7,
        }}
      />
      <div className="auth-stagger mb-5 flex items-center justify-between text-[9px] uppercase tracking-[0.26em] text-muted-foreground/70"
        style={{ animation: "auth-stagger-in 700ms 380ms ease-out both" }}
      >
        <span>Secure Access Terminal</span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--green-glow)",
              boxShadow: "0 0 8px var(--green-glow)",
              animation: "auth-breathe 2.4s ease-in-out infinite",
            }}
          />
          Ready
        </span>
      </div>
      <div
        className="auth-stagger flex flex-col items-center text-center"
        style={{ animation: "auth-stagger-in 700ms 450ms ease-out both" }}
      >
        <ShieldIcon3D />
        <h2 className="mt-4 text-lg font-semibold tracking-wide text-foreground">
          Authorized Sign-In
        </h2>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Account Intel Hub · AnSer Ops
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

      <p
        className="auth-stagger mt-5 text-[12px] leading-relaxed text-muted-foreground"
        style={{ animation: "auth-stagger-in 700ms 600ms ease-out both" }}
      >
        <span className="font-medium text-foreground">Authorized access only.</span>{" "}
        This system may contain confidential operational and protected information.
        Access is restricted to approved personnel only.
      </p>

      {mode === "signin" ? (
        <form
          onSubmit={handleSignIn}
          className="auth-stagger mt-5 flex flex-col gap-3"
          style={{ animation: "auth-stagger-in 700ms 720ms ease-out both" }}
        >
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
          <Button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 w-full border-0 text-primary-foreground transition-transform hover:-translate-y-0.5"
            style={{
              background:
                "linear-gradient(100deg, var(--electric), var(--violet-glow))",
              boxShadow:
                "0 12px 34px -14px oklch(0.6 0.22 270 / 0.9), inset 0 1px 0 oklch(1 0 0 / 0.25)",
            }}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="text-[12px] uppercase tracking-[0.22em]">Enter Hub</span>
            )}
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
        <form
          onSubmit={handleForgot}
          className="auth-stagger mt-5 flex flex-col gap-3"
          style={{ animation: "auth-stagger-in 500ms ease-out both" }}
        >
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

      <div
        className="auth-stagger mt-5 border-t border-border/40 pt-3 text-center text-[11px] leading-relaxed text-muted-foreground/80"
        style={{ animation: "auth-stagger-in 700ms 840ms ease-out both" }}
      >
        By signing in, you agree to use this system only for authorized work purposes.
      </div>
    </div>
  );
}