import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useAchievements } from "@/lib/achievements/achievements-store";
import type { AchievementProgress } from "@/lib/achievements/achievements-store";
import {
  ACHIEVEMENTS,
  CATEGORY_LABEL,
  TIER_COLOR,
  TIER_LABEL,
  type AchievementCategory,
} from "@/lib/achievements/catalog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/achievements")({
  head: () => ({
    meta: [
      { title: "Achievements — Constellation Ranks" },
      { name: "description", content: "Earned ranks and milestones from your night-shift work." },
    ],
  }),
  component: AchievementsPage,
});

const CATEGORIES: (AchievementCategory | "all")[] = [
  "all", "tickets", "dispatch", "knowledge", "consistency", "ai", "hidden",
];

function AchievementsPage() {
  const { progress, earnedCount, loading } = useAchievements();
  const [filter, setFilter] = useState<AchievementCategory | "all">("all");

  const filtered = useMemo(() => {
    if (filter === "all") return progress;
    return progress.filter((p) => p.def.category === filter);
  }, [progress, filter]);

  const total = ACHIEVEMENTS.length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Constellation Ranks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Earn ranks for the work that keeps the night moving. Every rank is a small
            constellation of effort — visible only if you look.
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl text-foreground">{earnedCount}<span className="text-muted-foreground">/{total}</span></div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Ranks Earned {loading ? "· syncing" : ""}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={filter === c ? "default" : "outline"}
            onClick={() => setFilter(c)}
            className="h-7 px-3 text-xs"
          >
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <AchievementCard key={p.def.id} progress={p} />
        ))}
      </div>
    </div>
  );
}

function AchievementCard({ progress }: { progress: AchievementProgress }) {
  const { def, current, target, unlocked, unlockedAt } = progress;
  const Icon = def.icon;
  const color = TIER_COLOR[def.tier];
  const pct = Math.min(100, Math.round((current / target) * 100));

  return (
    <div
      className="glass-panel relative flex gap-3 overflow-hidden rounded-xl p-4 transition-transform hover:-translate-y-0.5"
      style={{
        boxShadow: unlocked ? `0 0 22px -10px ${color}` : undefined,
        opacity: unlocked ? 1 : 0.72,
      }}
    >
      {unlocked && def.tier === "mythic" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at 30% 20%, color-mix(in oklab, ${color} 22%, transparent), transparent 60%)`,
          }}
        />
      )}
      <div
        className="relative grid h-12 w-12 shrink-0 place-items-center rounded-lg"
        style={{
          background: unlocked
            ? `color-mix(in oklab, ${color} 22%, transparent)`
            : "color-mix(in oklab, currentColor 6%, transparent)",
          color: unlocked ? color : undefined,
        }}
      >
        {unlocked ? <Icon className="h-6 w-6" /> : <Lock className="h-5 w-5 opacity-60" />}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold text-foreground">
              {def.title}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color }}>
              {TIER_LABEL[def.tier]} · {CATEGORY_LABEL[def.category]}
            </div>
          </div>
        </div>
        <div className="mt-1.5 line-clamp-2 text-xs italic text-muted-foreground">
          {def.flavor}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {current}/{target} {def.unit}
          </span>
        </div>
        {unlocked && unlockedAt && (
          <div className="mt-1 text-[10px] text-muted-foreground/80">
            Earned {new Date(unlockedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}