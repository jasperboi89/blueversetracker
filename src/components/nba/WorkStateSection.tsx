import { CircleDashed, CircleCheck, Ban } from "lucide-react";
import { useNextBestAction } from "@/lib/nba/use-next-best-action";

/**
 * Phase 14 — verified vs unverified state for the current work.
 * A projection: labels and statuses only, never content.
 */
export function WorkStateSection() {
  const { progress } = useNextBestAction();
  const hasAny =
    progress.completedChecks.length + progress.remainingChecks.length + progress.activeBlockers.length > 0;
  if (!hasAny) return null;

  return (
    <section aria-label="Work state" className="space-y-1">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {progress.objective ?? "Work state"}
      </h3>
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {progress.completedChecks.slice(0, 4).map((c) => (
          <li key={c.fingerprint} className="flex items-start gap-1.5">
            <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {c.label}
          </li>
        ))}
        {progress.remainingChecks.slice(0, 4).map((c) => (
          <li key={c.fingerprint} className="flex items-start gap-1.5">
            <CircleDashed className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {c.label}
          </li>
        ))}
        {progress.activeBlockers.slice(0, 2).map((b) => (
          <li key={b.id} className="flex items-start gap-1.5">
            <Ban className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {b.label}
          </li>
        ))}
      </ul>
    </section>
  );
}