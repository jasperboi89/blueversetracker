import { useAchievements } from "@/lib/achievements/achievements-store";

/** Mounted app-wide so achievements evaluate & unlock in the background. */
export function AchievementsWatcher() {
  useAchievements();
  return null;
}