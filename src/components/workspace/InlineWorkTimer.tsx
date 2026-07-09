import { Timer } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { elapsedMs, formatElapsed, useActiveWork } from "@/lib/workspace/active-work-store";

/**
 * Elapsed-time chip for the item currently being worked, shown inline in a
 * ticket/dispatch header so time-on-task is unmissable. Renders only when the
 * given id is the active item.
 */
export function InlineWorkTimer({ id }: { id: string }) {
  const { current } = useActiveWork();
  const now = useNow(1000);

  if (!current || current.id !== id) return null;
  const ms = elapsedMs(current, now.getTime() || Date.now());

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-mono tabular-nums"
      title="Time on this item this session"
      style={{
        borderColor: "oklch(0.82 0.18 155 / 0.4)",
        background: "linear-gradient(120deg, oklch(0.82 0.18 155 / 0.12), transparent)",
        color: current.running ? "var(--green-glow)" : "var(--muted-foreground)",
      }}
    >
      <Timer className="h-3 w-3" />
      {formatElapsed(ms)}
      {!current.running && <span className="text-muted-foreground">paused</span>}
    </span>
  );
}
