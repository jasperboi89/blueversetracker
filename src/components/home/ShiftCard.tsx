import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import {
  formatCentralDate,
  formatCentralTime,
  getShiftKey,
  getShiftMessage,
  getShiftProgress,
  getShiftStatus,
} from "@/lib/shift";
import { useNow } from "@/hooks/use-now";
import { CelebrationOverlay } from "./CelebrationOverlay";
import { useTheme } from "@/lib/settings/theme-store";
import { triggerCelebration } from "@/lib/quantum-bloom/celebration-bus";

const CELEB_KEY = "aih:shift-celebration";

export function ShiftCard() {
  const now = useNow(1000);
  const status = getShiftStatus(now);
  const theme = useTheme();
  const progress = getShiftProgress(now);
  const pct = Math.round(progress * 100);
  const message = getShiftMessage(status);
  const isNearEnd = status === "near-end";
  const [phase, setPhase] = useState<"idle" | "finalizing" | "celebrating">("idle");

  // Celebrate only at the moment the shift ends (the clock rolling past 6am
  // with the app open) — never simply because the page loaded after 6am.
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (status !== "complete") return;

    const sk = getShiftKey(now);
    // First render already past the end of shift: mark it seen, play nothing.
    if (was === null) {
      if (typeof window !== "undefined") localStorage.setItem(CELEB_KEY, sk);
      return;
    }
    if (was === "complete") return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(CELEB_KEY) : null;
    if (stored === sk) return;
    // Record immediately so a refresh mid-animation can't replay it.
    if (typeof window !== "undefined") localStorage.setItem(CELEB_KEY, sk);

    if (theme === "quantum-bloom") {
      triggerCelebration({
        kind: "shift",
        label: "Shift complete",
        context: { shiftKey: sk },
      });
      return;
    }
    setPhase("finalizing");
    const t1 = setTimeout(() => setPhase("celebrating"), 3000);
    const t2 = setTimeout(() => setPhase("idle"), 13_000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, theme]);

  const ringSize = 96;
  const stroke = 8;
  const r = (ringSize - stroke) / 2;
  const c = 2 * Math.PI * r;

  const accent = isNearEnd ? "var(--gold-glow)" : "var(--cyan-glow)";
  const accent2 = isNearEnd ? "var(--cyan-glow)" : "var(--electric)";

  return (
    <>
      <div
        className="glass-panel hq-instrument relative overflow-hidden p-5 sm:p-6"
        style={
          isNearEnd
            ? { animation: "pulse-gold 2.4s ease-in-out infinite", borderColor: "oklch(0.85 0.16 85 / 0.5)" }
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Shift Window
            </div>
            <div className="mt-2 text-sm text-foreground">{formatCentralDate(now)}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {formatCentralTime(now)} <span className="text-xs font-normal text-muted-foreground">Central</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">10:00 PM – 6:00 AM Central</div>
          </div>

          <div className="relative shrink-0">
            <svg width={ringSize} height={ringSize} className="-rotate-90">
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={r}
                stroke="oklch(0.7 0.12 235 / 0.18)"
                strokeWidth={stroke}
                fill="none"
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={r}
                stroke={accent}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - progress)}
                style={{ filter: `drop-shadow(0 0 6px ${accent})`, transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="text-base font-semibold tabular-nums">{pct}%</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {status === "before" ? "Pre" : status === "active" ? "Active" : status === "near-end" ? "Final" : "Done"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {status === "before"
                ? "Before Shift"
                : status === "active"
                  ? "Active Shift"
                  : status === "near-end"
                    ? "Near Shift End"
                    : "Shift Complete"}
            </span>
            <span className="text-muted-foreground/70">{message}</span>
          </div>
          <ShiftTimeline now={now} progress={progress} />
        </div>

      </div>

      {phase === "finalizing" && status === "complete" && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-background/70 backdrop-blur-sm">
          <div className="glass-panel px-8 py-6 text-center" style={{ boxShadow: "var(--shadow-glow-cyan)" }}>
            <div className="text-lg font-medium">Finalizing shift…</div>
            <div
              className="mx-auto mt-3 h-1 w-40 overflow-hidden rounded-full"
              style={{ background: "oklch(1 0 0 / 0.08)" }}
            >
              <div
                className="h-full"
                style={{
                  background: "linear-gradient(90deg, var(--electric), var(--cyan-glow))",
                  animation: "border-flow 3s linear",
                  backgroundSize: "200% 100%",
                }}
              />
            </div>
          </div>
        </div>
      )}
      {phase === "celebrating" && status === "complete" && (
        <CelebrationOverlay
          title="Shift Complete"
          subtitle={`BlueVerse systems wrapped.\nNice work, Luke.`}
          variant="shift"
        />
      )}
    </>
  );
}