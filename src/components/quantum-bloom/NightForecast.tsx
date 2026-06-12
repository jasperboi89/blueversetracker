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

  const open = tickets.filter(
    (t) => t.status !== "completed" && t.status !== "closed",
  ).length;

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
    <div
      className="crystal-glass relative overflow-hidden p-4"
      style={{
        borderColor: "color-mix(in oklab, var(--qb-phase-accent, var(--cyan-glow)) 40%, transparent)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{
            background:
              "linear-gradient(135deg, var(--qb-phase-primary, var(--electric)), var(--qb-phase-secondary, var(--violet-glow)))",
            boxShadow: "0 0 20px var(--qb-phase-accent, var(--cyan-glow))",
          }}
        >
          <Sparkles className="h-4 w-4 text-background" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Night Forecast
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground">
            {headline}
          </div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
      </div>
    </div>
  );
}