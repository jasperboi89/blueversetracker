import { CheckCircle2 } from "lucide-react";
import { StatusChip } from "./StatusChip";
import { computeReadiness, type DispatchSession } from "@/lib/dispatch-store";
import { cn } from "@/lib/utils";

function thresholdAccent(p: number) {
  if (p >= 100) return { color: "var(--green-glow)", label: "Ready Check Complete", second: "var(--cyan-glow)" };
  if (p >= 90) return { color: "var(--cyan-glow)", label: "Final Checks Needed", second: "var(--electric)" };
  if (p >= 50) return { color: "var(--cyan-glow)", label: "Almost Ready", second: "var(--electric)" };
  return { color: "var(--violet-glow)", label: "In Progress", second: "var(--electric)" };
}

export function ReadinessTracker({ session }: { session: DispatchSession }) {
  const r = computeReadiness(session);
  const accent = thresholdAccent(r.percent);
  const ringSize = 72;
  const stroke = 8;
  const rad = (ringSize - stroke) / 2;
  const c = 2 * Math.PI * rad;

  const ready = r.percent === 100 && r.blockedBy.length === 0;

  return (
    <div
      className={cn("glass-panel sticky top-2 z-20 p-4")}
      style={ready ? { boxShadow: "0 0 28px var(--green-glow), inset 0 1px 0 oklch(1 0 0 / 0.08)", borderColor: "oklch(0.82 0.18 155 / 0.55)" } : undefined}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative shrink-0">
          <svg width={ringSize} height={ringSize} className="-rotate-90">
            <circle cx={ringSize/2} cy={ringSize/2} r={rad} stroke="oklch(0.7 0.12 235 / 0.18)" strokeWidth={stroke} fill="none" />
            <circle
              cx={ringSize/2} cy={ringSize/2} r={rad} stroke={accent.color}
              strokeWidth={stroke} fill="none" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - r.percent / 100)}
              style={{ filter: `drop-shadow(0 0 6px ${accent.color})`, transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            {ready ? (
              <CheckCircle2 className="h-6 w-6" style={{ color: "var(--green-glow)", filter: "drop-shadow(0 0 8px var(--green-glow))" }} />
            ) : (
              <div className="text-sm font-semibold tabular-nums">{r.percent}%</div>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Readiness</div>
            <div className="text-sm font-medium" style={{ color: accent.color }}>{accent.label}</div>
            {ready && (
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
                style={{ color: "var(--green-glow)", background: "oklch(0.82 0.18 155 / 0.18)", borderColor: "oklch(0.82 0.18 155 / 0.5)" }}
              >
                Ready
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "oklch(0.7 0.12 235 / 0.12)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${r.percent}%`, background: `linear-gradient(90deg, ${accent.second}, ${accent.color})`, boxShadow: `0 0 10px ${accent.color}` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.sections.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
                <StatusChip status={s.status} />
              </div>
            ))}
          </div>
          {r.blockedBy.length > 0 && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Blocked by: {r.blockedBy.slice(0, 3).join(" · ")}{r.blockedBy.length > 3 ? ` (+${r.blockedBy.length - 3} more)` : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}