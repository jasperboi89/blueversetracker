import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { subscribeUnlocks } from "@/lib/achievements/achievements-store";
import { TIER_COLOR, TIER_LABEL, type AchievementDef } from "@/lib/achievements/catalog";

export function UnlockToast() {
  const [item, setItem] = useState<AchievementDef | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeUnlocks((def) => {
      setItem(def);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setItem(null), 5200);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);

  if (!item) return null;
  const Icon = item.icon;
  const color = TIER_COLOR[item.tier];

  return (
    <div
      className="pointer-events-none fixed bottom-24 right-6 z-[95] max-w-sm"
      style={{ animation: "qb-discovery-toast-in 380ms ease-out" }}
    >
      <div
        className="crystal-glass flex items-start gap-3 rounded-xl px-4 py-3"
        style={{ boxShadow: `0 0 24px -6px ${color}` }}
      >
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color }}>
            {TIER_LABEL[item.tier]} Rank Unlocked
          </div>
          <div className="mt-0.5 font-display text-sm font-semibold text-foreground">
            {item.title}
          </div>
          <div className="mt-0.5 text-xs italic text-muted-foreground">{item.flavor}</div>
        </div>
        <Trophy className="ml-1 h-4 w-4 shrink-0 opacity-60" />
      </div>
    </div>
  );
}