import { useState } from "react";
import { Sparkles, Clock, Star, Layers, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deriveCore, formatHour } from "@/lib/quantum-bloom/core";
import type { Discovery } from "@/hooks/use-discoveries";

export function CoreCard({
  rows,
  onReset,
}: {
  rows: Discovery[];
  onReset: () => Promise<void> | void;
}) {
  const c = deriveCore(rows);
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="crystal-glass p-4 sm:p-5">
      <header className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: "var(--qb-phase-accent, var(--cyan-glow))" }} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Quantum Bloom Core
        </h2>
        <span className="ml-auto rounded-full border border-border/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-foreground">
          {c.level}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat icon={Zap} label="Discoveries" value={String(c.total)} />
        <Stat icon={Star} label="Favorite Phase" value={c.favoritePhase ?? "—"} />
        <Stat
          icon={Clock}
          label="Most Active Hour"
          value={c.mostActiveHour === null ? "—" : formatHour(c.mostActiveHour)}
        />
        <Stat icon={Layers} label="Preferred Workspace" value={c.preferredWorkspace ?? "—"} />
        <Stat icon={Sparkles} label="Adaptation" value={c.level} />
      </div>
      <div className="mt-4 border-t border-border/40 pt-3 text-xs">
        {!confirming ? (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Reset Learning
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">
              This clears every discovery and resets the Core. Continue?
            </span>
            <Button size="sm" variant="destructive" onClick={async () => { await onReset(); setConfirming(false); }}>
              Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  icon: Icon, label, value,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/30 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
