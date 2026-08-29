import { Brain, Radar, ShieldCheck, Sparkles, TerminalSquare, Waypoints } from "lucide-react";

const CALLOUTS = [
  { icon: Brain, label: "Context-aware workspace" },
  { icon: ShieldCheck, label: "Capability-secured actions" },
  { icon: Waypoints, label: "Guided next steps" },
  { icon: Radar, label: "Verified operational memory" },
];

/**
 * Landing hero.
 *
 * Static capability statements only — these describe what the portal offers on
 * sign-in, not live telemetry (no session exists yet, so claiming live state
 * would be dishonest).
 */
const SYSTEM_LINES = [
  { icon: Brain, label: "Cortex ready" },
  { icon: TerminalSquare, label: "Script Intelligence online" },
  { icon: ShieldCheck, label: "Governed actions secured" },
  { icon: Radar, label: "System integrity active" },
];

export function PortalHero() {
  return (
    <div className="relative max-w-xl">
      <div
        className="auth-stagger inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.28em]"
        style={{
          color: "var(--cyan-glow)",
          background: "oklch(0.4 0.16 240 / 0.16)",
          border: "1px solid oklch(0.55 0.2 240 / 0.32)",
          animation: "auth-stagger-in 700ms 200ms ease-out both",
        }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: "var(--green-glow)",
            boxShadow: "0 0 10px var(--green-glow)",
            animation: "auth-breathe 2.6s ease-in-out infinite",
          }}
        />
        AnSer Ops · Night Floor
      </div>

      <h1
        className="auth-stagger mt-6 font-display text-4xl font-semibold leading-[1.03] tracking-tight text-foreground sm:text-5xl lg:text-[3.7rem]"
        style={{ animation: "auth-stagger-in 800ms 320ms ease-out both" }}
      >
        Account{" "}
        <span
          className="auth-title-shimmer"
          style={{
            background:
              "linear-gradient(100deg, var(--cyan-glow), var(--electric) 30%, var(--violet-glow) 50%, var(--electric) 70%, var(--cyan-glow))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 0 26px oklch(0.7 0.2 250 / 0.45))",
          }}
        >
          Command Center
        </span>
      </h1>

      <p
        className="auth-stagger mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground"
        style={{ animation: "auth-stagger-in 800ms 440ms ease-out both" }}
      >
        Operational intelligence, governed action and verified memory for the AnSer night floor —
        live account signal, guided workflow, and every change reviewed before it is applied.
      </p>

      <div
        className="auth-stagger mt-8 grid max-w-lg grid-cols-1 gap-2 sm:grid-cols-2"
        style={{ animation: "auth-stagger-in 800ms 560ms ease-out both" }}
      >
        {CALLOUTS.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="auth-chip flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} />
            {label}
          </div>
        ))}
      </div>

      <div
        className="auth-stagger mt-7 flex flex-wrap gap-1.5"
        style={{ animation: "auth-stagger-in 800ms 660ms ease-out both" }}
      >
        {SYSTEM_LINES.map(({ icon: Icon, label }) => (
          <span key={label} className="cc-pill" data-tone="ok">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </span>
        ))}
      </div>

      <div
        className="auth-stagger mt-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70"
        style={{ animation: "auth-stagger-in 800ms 760ms ease-out both" }}
      >
        <Sparkles className="h-3 w-3" style={{ color: "var(--violet-glow)" }} />
        HIPAA-Safeguarded · Internal Use Only
      </div>
    </div>
  );
}
