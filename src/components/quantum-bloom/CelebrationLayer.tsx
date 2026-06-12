import { useEffect, useState } from "react";
import { subscribeCelebrations, type CelebrationEvent } from "@/lib/quantum-bloom/celebration-bus";

const DURATIONS: Record<CelebrationEvent["kind"], number> = {
  ticket: 1200,
  dispatch: 2200,
  night_plan: 2600,
  shift: 3500,
};

/**
 * Renders the active Quantum Bloom celebration overlay.
 * Pure CSS/GPU animations — no per-frame React work.
 */
export function CelebrationLayer() {
  const [active, setActive] = useState<CelebrationEvent | null>(null);

  useEffect(() => {
    return subscribeCelebrations((e) => {
      if (document.hidden) return;
      setActive(e);
      const t = setTimeout(() => setActive(null), DURATIONS[e.kind] + 100);
      return () => clearTimeout(t);
    });
  }, []);

  if (!active) return null;

  if (active.kind === "ticket") {
    return (
      <div className="pointer-events-none fixed inset-0 z-[80]" aria-hidden>
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 220,
            height: 220,
            background: "radial-gradient(circle, var(--qb-phase-accent, var(--cyan-glow)) 0%, transparent 65%)",
            opacity: 0,
            filter: "blur(4px)",
            animation: "qb-bloom-pulse 1.2s ease-out forwards",
          }}
        />
      </div>
    );
  }

  if (active.kind === "dispatch") {
    return (
      <div className="pointer-events-none fixed inset-0 z-[80] grid place-items-center" aria-hidden>
        <div
          className="absolute h-48 w-48 rounded-full"
          style={{
            border: "2px solid var(--qb-phase-accent, var(--cyan-glow))",
            boxShadow: "0 0 80px var(--qb-phase-accent, var(--cyan-glow))",
            animation: "qb-spectral-wave 2.2s ease-out forwards",
          }}
        />
        <div
          className="absolute h-48 w-48 rounded-full"
          style={{
            border: "1px solid var(--qb-phase-primary, var(--electric))",
            animation: "qb-spectral-wave 2.2s ease-out 0.3s forwards",
          }}
        />
        <div
          className="crystal-glass relative px-6 py-3 text-sm font-medium text-foreground"
          style={{ animation: "qb-bloom-pulse 1.6s ease-out forwards" }}
        >
          Test cycle complete
        </div>
      </div>
    );
  }

  if (active.kind === "night_plan") {
    return (
      <div className="pointer-events-none fixed inset-0 z-[80] grid place-items-center" aria-hidden>
        <div
          className="absolute h-56 w-56 rounded-full"
          style={{
            border: "3px solid var(--gold-glow)",
            boxShadow: "0 0 100px var(--gold-glow), inset 0 0 60px var(--gold-glow)",
            animation: "qb-golden-ring 2.6s ease-out forwards",
          }}
        />
        <div
          className="crystal-glass relative px-6 py-3 text-sm font-medium text-foreground"
          style={{ animation: "qb-bloom-pulse 2s ease-out forwards" }}
        >
          Night Plan complete
        </div>
      </div>
    );
  }

  // shift
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.78 0.18 220 / 0.0) 0%, oklch(0.7 0.22 250 / 0.4) 18%, oklch(0.55 0.2 290 / 0.5) 35%, oklch(0.6 0.22 320 / 0.5) 50%, oklch(0.5 0.2 270 / 0.5) 65%, oklch(0.7 0.18 215 / 0.4) 82%, oklch(0.85 0.16 195 / 0.0) 100%)",
          animation: "qb-aurora-sweep 3.5s ease-out forwards",
        }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <div
          className="crystal-glass px-8 py-5 text-center"
          style={{ animation: "qb-bloom-pulse 2.4s ease-out 0.6s forwards", opacity: 0 }}
        >
          <div className="text-xl font-semibold text-foreground">Shift Complete</div>
          <div className="mt-1 text-sm text-muted-foreground">Good morning, Luke.</div>
        </div>
      </div>
    </div>
  );
}
