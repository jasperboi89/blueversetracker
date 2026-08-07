import { useEffect, useRef } from "react";
import { useInsights } from "@/lib/ai/awareness";
import { useActiveWork, elapsedMs } from "@/lib/workspace/active-work-store";
import { getShiftStatus, getGreeting } from "@/lib/shift";
import { nightPlanStore } from "@/lib/night-plan-store";
import { presenceSpeak } from "@/lib/presence/presence-store";
import { CHECK_IN_MINUTES, usePresencePrefs } from "@/lib/presence/presence-prefs-store";
import { useDisplayPrefs } from "@/lib/settings/display-prefs-store";

/**
 * Decides when the holographic presence floats in:
 * high-severity insights, periodic shift check-ins, and shift start/end edges.
 */
export function PresenceDriver() {
  const prefs = usePresencePrefs();
  const display = useDisplayPrefs();
  const insights = useInsights();
  const { current } = useActiveWork();
  const lastShiftStatus = useRef<string | null>(null);

  const enabled = prefs.enabled && !display.quietInsights;

  // 1) High-severity insights.
  useEffect(() => {
    if (!enabled) return;
    const high = insights.find((i) => i.severity === "high");
    if (!high) return;
    presenceSpeak({
      id: `insight-${high.id}`,
      tone: "alert",
      text: high.text,
      to: high.to,
      params: high.params,
      ask: high.text,
      cooldownMs: 20 * 60_000,
    });
  }, [insights, enabled]);

  // 2) Periodic check-ins during an active shift.
  useEffect(() => {
    if (!enabled) return;
    const mins = CHECK_IN_MINUTES[prefs.checkIn];
    if (!mins) return;
    const id = setInterval(() => {
      const status = getShiftStatus(new Date());
      if (status !== "active" && status !== "near-end") return;
      if (typeof document !== "undefined" && document.hidden) return;
      const cur = current;
      if (cur) {
        const m = Math.round(elapsedMs(cur, Date.now()) / 60000);
        presenceSpeak({
          id: "checkin",
          tone: "checkin",
          text: `Checking in — still on ${cur.label}? ${m} minute${m === 1 ? "" : "s"} so far. Want a hand?`,
          to: cur.to,
          params: cur.params,
          ask: `Help me move forward on ${cur.label}.`,
          cooldownMs: mins * 60_000 - 30_000,
        });
      } else {
        presenceSpeak({
          id: "checkin",
          tone: "checkin",
          text: "Checking in — nothing is running right now. Want me to pick the next best thing to work on?",
          ask: "What should I work on next?",
          cooldownMs: mins * 60_000 - 30_000,
        });
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [enabled, prefs.checkIn, current]);

  // 3) Shift start / shift end edges.
  useEffect(() => {
    if (!enabled) return;
    function tick() {
      const status = getShiftStatus(new Date());
      const prev = lastShiftStatus.current;
      lastShiftStatus.current = status;
      if (prev === null || prev === status) return;
      if (status === "active" && prev !== "near-end") {
        const items = nightPlanStore.get().items.filter((i) => i.priority === "must");
        presenceSpeak({
          id: "shift-start",
          tone: "greeting",
          text: `${getGreeting()}, Luke. Shift is live${items.length ? ` — ${items.length} must-do item${items.length === 1 ? "" : "s"} on the night plan.` : "."}`,
          to: "/",
          ask: "Give me a briefing for tonight.",
          cooldownMs: 4 * 60 * 60_000,
        });
      }
      if (status === "complete") {
        presenceSpeak({
          id: "shift-end",
          tone: "wrap",
          text: "Shift's wrapping up. Want me to put together the summary before you sign off?",
          to: "/",
          ask: "Summarize my shift.",
          cooldownMs: 4 * 60 * 60_000,
        });
      }
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [enabled]);

  return null;
}