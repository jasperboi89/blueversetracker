import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";

export type ActivityType =
  "nav" | "ticket_open" | "ticket_pull" | "ticket_complete" | "dispatch_open" | "additional_open";

export interface ActivityEvent {
  type: ActivityType;
  at: number;
  label?: string;
}

export interface ActivityState {
  events: ActivityEvent[];
}

const CAP = 100;
const DEFAULT: ActivityState = { events: [] };

export const activityStore = createPersistedStore<ActivityState>(
  "aih:workspace:activity:v1",
  DEFAULT,
);

export function useActivity(): ActivityState {
  return useStoreValue(activityStore, DEFAULT);
}

/** Record a movement. De-dupes consecutive identical nav events. */
export function recordActivity(type: ActivityType, label?: string) {
  activityStore.update((s) => {
    const last = s.events[0];
    if (last && last.type === type && last.label === label && Date.now() - last.at < 1500) {
      return s;
    }
    const events = [{ type, at: Date.now(), label }, ...s.events].slice(0, CAP);
    return { events };
  });
}

/** Compact recent-movement summary for the AI focus prompt. */
export function activitySummary(max = 20): string {
  const evs = activityStore.get().events.slice(0, max);
  return evs
    .map(
      (e) =>
        `${new Date(e.at).toISOString().slice(11, 16)} ${e.type}${e.label ? ` ${e.label}` : ""}`,
    )
    .join("\n");
}

attachCloudSync<ActivityState>({
  storeKey: "workspace-activity",
  subscribe: (cb) => activityStore.subscribe(cb),
  getSnapshot: () => activityStore.get(),
  applyServerSnapshot: (next) => activityStore.applyServerSnapshot(next),
  isEmpty: (s) => (s.events?.length ?? 0) === 0,
});
