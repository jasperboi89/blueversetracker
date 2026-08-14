import { useNavigate } from "@tanstack/react-router";
import { PlayCircle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDispatch, computeReadiness } from "@/lib/dispatch-store";

/**
 * Surfaces the most recently touched unfinished dispatch session so a test
 * interrupted by a call can be resumed in one click.
 */
export function ResumeBanner() {
  const navigate = useNavigate();
  const { sessions } = useDispatch();

  const candidate = [...sessions]
    .filter((s) => s.status !== "activated" && !s.completedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (!candidate) return null;
  const readiness = computeReadiness(candidate);
  if (readiness.percent === 0) return null;

  const mins = Math.round((Date.now() - candidate.updatedAt) / 60000);
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;

  return (
    <div
      className="glass-panel hq-working flex flex-wrap items-center gap-3 p-4"
      style={{ borderColor: "oklch(0.78 0.18 220 / 0.35)" }}
    >
      <PlayCircle className="h-5 w-5 shrink-0" style={{ color: "var(--cyan-glow)" }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          Pick up where you left off — {candidate.accountName}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Account {candidate.accountNumber} · {readiness.percent}% complete · updated {ago}
          {readiness.blockedBy[0] ? ` · next: ${readiness.blockedBy[0]}` : ""}
        </div>
      </div>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{
            width: `${readiness.percent}%`,
            background: "linear-gradient(90deg, var(--cyan-glow), oklch(0.7 0.22 295))",
          }}
        />
      </div>
      <Button
        size="sm"
        onClick={() =>
          navigate({
            to: "/contact-dispatch/$sessionId/work",
            params: { sessionId: candidate.id },
          })
        }
      >
        Resume
      </Button>
    </div>
  );
}