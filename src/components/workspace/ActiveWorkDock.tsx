import { Link } from "@tanstack/react-router";
import { Pause, Play, Square, Timer, ArrowUpRight } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import {
  elapsedMs,
  pauseActive,
  resumeActive,
  stopActive,
  useActiveWork,
  type ActiveKind,
} from "@/lib/workspace/active-work-store";

const KIND_LABEL: Record<ActiveKind, string> = {
  ticket: "Ticket",
  dispatch: "Dispatch",
  additional: "Additional Work",
};

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Always-visible bar for the work item you're on, with a live timer that keeps
 * running as you move between pages — so context-switching never loses your
 * place. Hidden when nothing is active.
 */
export function ActiveWorkDock() {
  const { current } = useActiveWork();
  const now = useNow(1000);

  if (!current) return null;
  const elapsed = elapsedMs(current, now.getTime() || Date.now());
  // Defensive: strip a stale pathless-layout prefix from persisted values.
  const toPath = current.to.replace(/^\/_authenticated/, "");

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex justify-center px-3 pb-3">
      <div className="glass-panel pointer-events-auto flex items-center gap-3 rounded-full px-3 py-1.5 text-xs shadow-lg">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Timer className="h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} />
          <span className="uppercase tracking-wider">{KIND_LABEL[current.kind]}</span>
        </span>
        <Link
          // route id + params are stored generically; cast for the typed Link
          to={toPath as never}
          params={current.params as never}
          className="flex items-center gap-1 font-medium text-foreground hover:underline"
        >
          {current.label}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
        <span
          className="font-mono tabular-nums"
          style={{ color: current.running ? "var(--green-glow)" : "var(--muted-foreground)" }}
        >
          {fmt(elapsed)}
        </span>
        <div className="flex items-center gap-0.5">
          {current.running ? (
            <button
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground"
              title="Pause timer"
              onClick={pauseActive}
            >
              <Pause className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground"
              title="Resume timer"
              onClick={resumeActive}
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            title="Stop and bank time"
            onClick={stopActive}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
