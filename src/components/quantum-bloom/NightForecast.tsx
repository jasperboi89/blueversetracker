import { Sparkles } from "lucide-react";
import { useTickets } from "@/lib/tickets-store";
import { getActivePhase, isShiftActive } from "./phases";
import { useNow } from "@/hooks/use-now";

/**
 * Atmospheric one-line forecast computed from real portal data.
 * Only shown when Quantum Bloom is the active theme (parent decides).
 */
export function NightForecast() {
  const now = useNow(60_000);
  const { tickets } = useTickets();
  const phase = getActivePhase(now);
  const active = isShiftActive(now);

  const open = tickets.filter((t) => t.status !== "completed").length;

  const headline = active
    ? `${phase.label}`
    : "Aurora Engine resting · Quantum Bloom Core in low-power mode";

  const detail = active
    ? open === 0
      ? "All clear. The nebula is calm."
      : open === 1
        ? "One ticket holds your focus tonight."
        : `${open} tickets pulse in the work queue.`
    : "Quantum Bloom will re-ignite at 10:00 PM Central.";

  return (
    <div className="cc-ribbon">
      <span
        aria-hidden
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
        style={{
          background:
            "linear-gradient(135deg, var(--qb-phase-primary, var(--electric)), var(--qb-phase-secondary, var(--violet-glow)))",
          boxShadow: "0 0 14px var(--qb-phase-accent, var(--cyan-glow))",
        }}
      >
        <Sparkles className="h-3 w-3 text-background" />
      </span>
      <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Night Forecast
      </span>
      <span className="truncate text-xs font-medium text-foreground">{headline}</span>
      <span className="hidden truncate text-xs text-muted-foreground sm:inline">· {detail}</span>
    </div>
  );
}
