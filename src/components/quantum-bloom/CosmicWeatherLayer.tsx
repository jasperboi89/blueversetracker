import { useEffect, useRef, useState } from "react";
import { useQbTuning } from "@/lib/settings/qb-tuning-store";
import { isShiftActive } from "./phases";
import { recordDiscovery } from "@/lib/quantum-bloom/discoveries.functions";

type WeatherKind = "meteor" | "aurora" | "lightning" | "comet";

const FREQ_WINDOW: Record<"low" | "normal" | "high", [number, number]> = {
  low: [15 * 60_000, 35 * 60_000],
  normal: [8 * 60_000, 20 * 60_000],
  high: [3 * 60_000, 9 * 60_000],
};

const KINDS: WeatherKind[] = ["meteor", "aurora", "lightning", "comet"];
const DURATIONS: Record<WeatherKind, number> = {
  meteor: 9000,
  aurora: 8000,
  lightning: 1200,
  comet: 10000,
};
const LABELS: Record<WeatherKind, string> = {
  meteor: "Meteor shower",
  aurora: "Stellar aurora",
  lightning: "Cosmic lightning",
  comet: "Comet pass",
};

export function CosmicWeatherLayer() {
  const tuning = useQbTuning();
  const [active, setActive] = useState<WeatherKind | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clear() {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    }
    function schedule() {
      clear();
      if (tuning.eventFrequency === "off") return;
      const win = FREQ_WINDOW[tuning.eventFrequency];
      const wait = win[0] + Math.random() * (win[1] - win[0]);
      timer.current = setTimeout(fire, wait);
    }
    function fire() {
      if (document.hidden) { schedule(); return; }
      if (tuning.sleepMode && !isShiftActive(new Date())) { schedule(); return; }
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
      setActive(kind);
      // Best-effort record
      recordDiscovery({
        data: {
          kind: "cosmic" as never,
          label: LABELS[kind],
          context: { weather: kind },
        },
      }).catch(() => {});
      setTimeout(() => {
        setActive(null);
        schedule();
      }, DURATIONS[kind] + 200);
    }
    function onVis() {
      if (!document.hidden) schedule();
      else clear();
    }
    schedule();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tuning.eventFrequency, tuning.sleepMode]);

  if (!active) return null;

  if (active === "meteor") {
    return (
      <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className="absolute h-px w-40 origin-left"
            style={{
              top: `${10 + Math.random() * 60}%`,
              left: `-20%`,
              transform: "rotate(20deg)",
              background: "linear-gradient(90deg, transparent, var(--qb-phase-accent, var(--cyan-glow)), transparent)",
              boxShadow: "0 0 12px var(--qb-phase-accent, var(--cyan-glow))",
              animation: `qb-meteor ${2 + Math.random() * 2}s ease-out ${i * 0.7}s forwards`,
              opacity: 0,
            }}
          />
        ))}
      </div>
    );
  }
  if (active === "comet") {
    return (
      <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
        <span
          className="absolute h-1 w-72 origin-left rounded-full"
          style={{
            top: `${15 + Math.random() * 50}%`,
            left: "-30%",
            background: "linear-gradient(90deg, transparent 0%, var(--qb-phase-primary, var(--electric)) 60%, white 95%)",
            boxShadow: "0 0 24px var(--qb-phase-primary, var(--electric))",
            transform: "rotate(-10deg)",
            animation: "qb-comet 10s linear forwards",
          }}
        />
      </div>
    );
  }
  if (active === "lightning") {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-[70]"
        aria-hidden
        style={{
          background: "radial-gradient(ellipse at center, var(--qb-phase-accent, white) 0%, transparent 70%)",
          animation: "qb-cosmic-lightning 1.2s ease-out forwards",
          opacity: 0,
        }}
      />
    );
  }
  // aurora ribbon
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      <div
        className="absolute inset-x-0"
        style={{
          top: "30%",
          height: "40%",
          background:
            "linear-gradient(180deg, transparent, var(--qb-phase-primary, var(--violet-glow)) 40%, var(--qb-phase-accent, var(--cyan-glow)) 60%, transparent)",
          filter: "blur(40px)",
          animation: "qb-aurora-ribbon 8s ease-in-out forwards",
          opacity: 0,
        }}
      />
    </div>
  );
}
