import { Brain, Radar, ShieldCheck, Sparkles, Waypoints } from "lucide-react";

const CALLOUTS = [
  { icon: Brain, label: "Context-aware workspace" },
  { icon: ShieldCheck, label: "Capability-secured actions" },
  { icon: Waypoints, label: "Guided next steps" },
  { icon: Radar, label: "Verified operational memory" },
  { icon: Sparkles, label: "Live operational intelligence" },
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
        System online · AnSer Ops
      </div>

      <h1
        className="auth-stagger mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
        style={{ animation: "auth-stagger-in 800ms 320ms ease-out both" }}
      >
        Enter the{" "}
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
          Account Intel Hub
        </span>
      </h1>

      <p
        className="auth-stagger mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base"
        style={{ animation: "auth-stagger-in 800ms 440ms ease-out both" }}
      >
        A context-aware operational intelligence workspace for the AnSer night
        floor — live account signal, verified memory, and guided next steps held
        in one protected command environment.
      </p>

      <div
        className="auth-stagger mt-8 grid max-w-lg grid-cols-1 gap-2 sm:grid-cols-2"
        style={{ animation: "auth-stagger-in 800ms 560ms ease-out both" }}
      >
        {CALLOUTS.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="auth-chip flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12px] text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} />
            {label}
          </div>
        ))}
      </div>

      <div
        className="auth-stagger mt-7 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70"
        style={{ animation: "auth-stagger-in 800ms 680ms ease-out both" }}
      >
        <Sparkles className="h-3 w-3" style={{ color: "var(--violet-glow)" }} />
        HIPAA-Safeguarded · Internal Use Only
      </div>
    </div>
  );
}
