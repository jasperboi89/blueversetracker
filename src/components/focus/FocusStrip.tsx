import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Focus as FocusIcon } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { formatCentralTime } from "@/lib/shift";
import { useFocusWorkspace } from "@/lib/core/use-focus-workspace";
import { FocusPanel } from "./FocusPanel";

/**
 * Compact, quiet operational status surface in the app shell. Safe
 * identifiers and counts only — never ticket bodies, caller data, or notes.
 */
export function FocusStrip() {
  const [open, setOpen] = useState(false);
  const focus = useFocusWorkspace();
  const clock = useNow(30_000);
  const time = clock.getTime() ? formatCentralTime(clock) : "";

  const current = focus.current;
  const must = focus.shift.mustRemaining;
  const watch = focus.actionableWatchCount;

  const summary = [
    current ? current.label : "No tracked work",
    `${must} Must`,
    watch > 0 ? `${watch} Watch` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Focus: ${summary}`}
          aria-expanded={open}
          className="focus-active-surface flex min-w-0 items-center gap-1.5 rounded-full border border-border/40 bg-white/[0.02] px-2 py-0.5 text-[11px] text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-focus-active={current ? "true" : "false"}
        >
          <FocusIcon className="h-3 w-3 shrink-0" aria-hidden />
          {time && <span className="hidden font-mono tabular-nums lg:inline">{time}</span>}
          <span className="hidden max-w-[16ch] truncate text-foreground/90 sm:inline">
            {current ? current.label : "No tracked work"}
          </span>
          {current?.accountId && (
            <span className="hidden xl:inline">Acct {current.accountId}</span>
          )}
          {current && (
            <span className="hidden font-mono tabular-nums lg:inline">{current.elapsedLabel}</span>
          )}
          <span className="sm:hidden">Focus</span>
          <span className="whitespace-nowrap">{must} Must</span>
          {watch > 0 && (
            <span className="focus-watch--warning whitespace-nowrap rounded-full px-1">
              {watch} Watch
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[22rem] max-w-[92vw] p-3"
        aria-label="Focus workspace"
      >
        <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
          Focus
        </p>
        <FocusPanel focus={focus} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
