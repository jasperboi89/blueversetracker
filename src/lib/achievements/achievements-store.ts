import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listAchievements,
  unlockAchievement,
  getAchievementStats,
} from "./achievements.functions";
import { ACHIEVEMENTS, type AchievementDef } from "./catalog";
import { subscribeCelebrations } from "@/lib/quantum-bloom/celebration-bus";
import { getSanctuaryVisitCount, sanctuary } from "@/lib/quantum-bloom/sanctuary-store";

export interface UnlockedRow {
  achievementId: string;
  tier: string;
  unlockedAt: string;
}

export interface AchievementProgress {
  def: AchievementDef;
  current: number;
  target: number;
  unlocked: boolean;
  unlockedAt?: string;
}

type Stats = {
  counts: Record<string, number>;
  overdueClears: number;
  nightHours: number;
  knowledgeCount: number;
  sanctuaryCount: number;
};

function computeCurrent(def: AchievementDef, s: Stats): number {
  switch (def.source.type) {
    case "discovery-count":
      return s.counts[def.source.kind] ?? 0;
    case "knowledge-count":
      return s.knowledgeCount;
    case "sanctuary-count":
      return s.sanctuaryCount;
    case "overdue-clear":
      return s.overdueClears;
    case "night-hours":
      return s.nightHours;
  }
}

// Simple pub/sub for new unlocks (drives celebration overlay).
type UnlockListener = (def: AchievementDef) => void;
const unlockListeners = new Set<UnlockListener>();
export function subscribeUnlocks(l: UnlockListener) {
  unlockListeners.add(l);
  return () => unlockListeners.delete(l);
}
function emitUnlock(def: AchievementDef) {
  unlockListeners.forEach((l) => { try { l(def); } catch {} });
}

export function useAchievements() {
  const list = useServerFn(listAchievements);
  const unlock = useServerFn(unlockAchievement);
  const stats = useServerFn(getAchievementStats);

  const [unlocked, setUnlocked] = useState<UnlockedRow[]>([]);
  const [statData, setStatData] = useState<Stats>({
    counts: {}, overdueClears: 0, nightHours: 0, knowledgeCount: 0, sanctuaryCount: 0,
  });
  const [loading, setLoading] = useState(false);

  const evaluate = useCallback(async () => {
    try {
      const [rows, s] = await Promise.all([list(), stats()]);
      const sanctuaryCount = getSanctuaryVisitCount();
      const merged: Stats = { ...s, sanctuaryCount };
      setUnlocked(rows as UnlockedRow[]);
      setStatData(merged);

      // Find newly-earned achievements and unlock them.
      const earnedIds = new Set((rows as UnlockedRow[]).map((r) => r.achievementId));
      for (const def of ACHIEVEMENTS) {
        if (earnedIds.has(def.id)) continue;
        const current = computeCurrent(def, merged);
        if (current >= def.target) {
          try {
            const res = await unlock({
              data: {
                achievement_id: def.id,
                tier: def.tier,
                progress_snapshot: { current, target: def.target },
              },
            });
            if (!res?.duplicate) {
              emitUnlock(def);
              setUnlocked((prev) => [
                { achievementId: def.id, tier: def.tier, unlockedAt: new Date().toISOString() },
                ...prev,
              ]);
            }
          } catch (err) {
            console.warn("[achievements] unlock failed", def.id, err);
          }
        }
      }
    } catch (err) {
      console.warn("[achievements] evaluate failed", err);
    }
  }, [list, stats, unlock]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { await evaluate(); } finally { setLoading(false); }
  }, [evaluate]);

  useEffect(() => {
    void refresh();
    // Re-evaluate whenever a celebration fires (new discovery) or sanctuary opens.
    const off1 = subscribeCelebrations(() => {
      setTimeout(() => { void evaluate(); }, 700);
    });
    const off2 = sanctuary.subscribe(() => { void evaluate(); });
    return () => { off1(); off2(); };
  }, [refresh, evaluate]);

  const progress: AchievementProgress[] = ACHIEVEMENTS.map((def) => {
    const row = unlocked.find((u) => u.achievementId === def.id);
    const current = computeCurrent(def, statData);
    return {
      def,
      current: Math.min(current, def.target),
      target: def.target,
      unlocked: Boolean(row),
      unlockedAt: row?.unlockedAt,
    };
  });

  const earnedCount = progress.filter((p) => p.unlocked).length;

  return { progress, unlocked, loading, earnedCount, refresh };
}