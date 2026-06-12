import { useEffect, useState } from "react";
import {
  markQbFirstEntryCompleted,
  useThemeState,
} from "@/lib/settings/theme-store";

/**
 * Plays a one-time-ish entry sequence when Quantum Bloom is active.
 * - First ever (qbFirstEntryCompleted=false): 2.6s with full step labels.
 * - Returning: ~0.8s pulse + shimmer.
 * Each browser tab plays exactly once per mount.
 */
export function EntryOverlay() {
  const { theme, qbFirstEntryCompleted } = useThemeState();
  const [phase, setPhase] = useState<"hidden" | "first" | "returning">("hidden");

  useEffect(() => {
    if (theme !== "quantum-bloom") {
      setPhase("hidden");
      return;
    }
    setPhase(qbFirstEntryCompleted ? "returning" : "first");
    const dur = qbFirstEntryCompleted ? 900 : 2800;
    const t = setTimeout(() => {
      setPhase("hidden");
      if (!qbFirstEntryCompleted) markQbFirstEntryCompleted();
    }, dur);
    return () => clearTimeout(t);
    // We intentionally re-run when theme toggles or first-entry flag changes.
  }, [theme, qbFirstEntryCompleted]);

  if (phase === "hidden") return null;

  const isFirst = phase === "first";
  const steps = isFirst
    ? [
        { at: 0,    label: "" },
        { at: 400,  label: "Stars online" },
        { at: 800,  label: "Nebula igniting" },
        { at: 1300, label: "Crystal lattice materializing" },
        { at: 1700, label: "Quantum Bloom Core online" },
        { at: 2100, label: "Aurora Engine initialized" },
        { at: 2500, label: "Good evening, Luke" },
      ]
    : [{ at: 0, label: "" }];

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[200] grid place-items-center"
      style={{
        background: isFirst
          ? "radial-gradient(ellipse at center, oklch(0.1 0.04 270 / 0.95), oklch(0.05 0.02 270 / 1))"
          : "radial-gradient(ellipse at center, oklch(0.1 0.04 270 / 0.4), transparent 70%)",
        animation: `qb-overlay-fade ${isFirst ? "2.8s" : "0.9s"} ease-out forwards`,
      }}
    >
      {isFirst && (
        <div className="relative">
          <div
            className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, var(--qb-phase-accent, oklch(0.85 0.16 210)) 0%, transparent 65%)",
              filter: "blur(40px)",
              animation: "qb-core-ignite 2.6s ease-out forwards",
            }}
          />
          <div className="relative w-[320px] text-center">
            <h2
              className="text-2xl font-semibold tracking-tight text-foreground"
              style={{ animation: "qb-title-rise 1.2s 1.5s ease-out backwards" }}
            >
              Quantum Bloom
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground"
               style={{ animation: "qb-title-rise 1.2s 1.7s ease-out backwards" }}>
              Account Intelligence Hub
            </p>
            <ul className="mt-6 min-h-[110px] space-y-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              {steps.filter((s) => s.label).map((s) => (
                <li
                  key={s.label}
                  style={{
                    opacity: 0,
                    animation: `qb-step-in 600ms ${s.at}ms ease-out forwards`,
                  }}
                >
                  · {s.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <style>{`
        @keyframes qb-overlay-fade {
          0% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes qb-core-ignite {
          0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
          40% { opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.4); opacity: 0.6; }
        }
        @keyframes qb-title-rise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes qb-step-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 0.85; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}