import { Activity, Clock, Radar, ShieldCheck, TerminalSquare } from "lucide-react";
import { formatCentralDate, formatCentralTime, getGreeting, getShiftProgress, getShiftStatus } from "@/lib/shift";
import { useNow } from "@/hooks/use-now";
import { executionControl } from "@/lib/execution/kill-switch";
import { overallSyncLabel, useSyncHealth } from "@/lib/cloud-sync/sync-health";

/**
 * COMMAND HEADER — the operator's arrival strip.
 *
 * Presentation only, but every indicator reflects real local state: the shift
 * clock, the governed-execution control mode, and the cloud-sync health
 * registry. Nothing here asserts intelligence the system has not earned.
 */
function Pill({
  tone,
  icon: Icon,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "info" | "muted";
  icon: typeof ShieldCheck;
  children: React.ReactNode;
}) {
  return (
    <span className="cc-pill" data-tone={tone}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </span>
  );
}

export function CommandHeader({ name = "Luke" }: { name?: string }) {
  const now = useNow(1000);
  const control = executionControl.get();
  const sync = overallSyncLabel(useSyncHealth());
  const status = getShiftStatus(now);
  const pct = Math.round(getShiftProgress(now) * 100);

  const governedTone = control.mode === "enabled" ? "ok" : control.mode === "safe_mode" ? "warn" : "bad";
  const governedText =
    control.mode === "enabled"
      ? "Governed actions secured"
      : control.mode === "safe_mode"
        ? "Safe mode — execution paused"
        : "Emergency stop active";

  return (
    <header className="cc-surface cc-hero p-5 sm:p-7">
      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              <span aria-hidden className="cc-dot" style={{ color: "var(--cyan-glow)" }} />
              Account Command Center
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
              {getGreeting(now)}, {name}.
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              Live operational intelligence, governed actions and verified memory — held in one
              protected command environment.
            </p>
          </div>

          <div className="text-right">
            <div className="font-mono text-2xl leading-none text-foreground tabular-nums sm:text-3xl">
              {formatCentralTime(now)}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {formatCentralDate(now)} · Central
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={status === "active" || status === "near-end" ? "info" : "muted"} icon={Clock}>
            {status === "before"
              ? "Shift not started"
              : status === "complete"
                ? "Shift complete"
                : `Shift ${pct}% elapsed`}
          </Pill>
          <Pill tone={governedTone} icon={ShieldCheck}>
            {governedText}
          </Pill>
          <Pill tone={sync.tone === "ok" ? "ok" : sync.tone === "warn" ? "warn" : "bad"} icon={Activity}>
            {sync.text}
          </Pill>
          <Pill tone="info" icon={TerminalSquare}>
            Script Intelligence available
          </Pill>
          <Pill tone="muted" icon={Radar}>
            Autonomy capped at PREPARE
          </Pill>
        </div>

        <div
          aria-hidden
          className="h-px w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--cyan-glow), var(--violet-glow), transparent)",
            opacity: 0.55,
          }}
        />
      </div>
    </header>
  );
}
