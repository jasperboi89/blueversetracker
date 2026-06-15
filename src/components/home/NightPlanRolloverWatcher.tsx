import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNow } from "@/hooks/use-now";
import { nightPlanStore, isActive, useNightPlan } from "@/lib/night-plan-store";
import { getCentralHM, getShiftKey } from "@/lib/shift";
import { RolloverPromptModal } from "./RolloverPromptModal";

/**
 * Watches Central time and orchestrates the night-plan rollover:
 *  - Auto-archive + reset when the shift has rolled over and nothing is active.
 *  - Prompt at 5:50 AM Central if active items remain.
 *  - Default to "start fresh" at 6:00 AM if the user didn't answer.
 */
export function NightPlanRolloverWatcher() {
  const now = useNow(60_000);
  const { items, rolloverAnsweredShiftKey, shiftKey } = nightPlanStore.get();
  // also re-read on changes
  useNightPlan();

  const [promptOpen, setPromptOpen] = useState(false);
  const snoozeUntilRef = useRef<number>(0);
  const lastCheckShiftKeyRef = useRef<string>("");

  const activeItems = items.filter((i) => isActive(i.status));
  const currentShiftKey = getShiftKey(now);

  useEffect(() => {
    // SSR safety — useNow returns epoch 0 until mount.
    if (now.getTime() === 0) return;
    const { hour, minute } = getCentralHM(now);
    const sk = currentShiftKey;

    // 1) Clean rollover: stored shiftKey differs from current and no active items.
    if (shiftKey && shiftKey !== sk && activeItems.length === 0 && items.length > 0) {
      nightPlanStore.archiveAndReset("done-as-is");
      return;
    }

    const answered = rolloverAnsweredShiftKey === sk;
    if (answered) return;

    // 2) 5:50 AM Central prompt (within a 9-minute window so we don't miss
    //    if the user opens the tab between 5:50 and 5:59).
    if (hour === 5 && minute >= 50 && minute < 60 && activeItems.length > 0) {
      if (Date.now() >= snoozeUntilRef.current && !promptOpen) {
        setPromptOpen(true);
      }
    }

    // 3) 6:00 AM default — if still unanswered with active items, dismiss them.
    if (hour === 6 && minute < 5 && lastCheckShiftKeyRef.current !== sk) {
      lastCheckShiftKeyRef.current = sk;
      if (activeItems.length > 0) {
        nightPlanStore.archiveAndReset("dismiss-active");
        nightPlanStore.markRolloverAnswered(sk);
        setPromptOpen(false);
        toast("Night plan reset — leftover items archived as dismissed.");
      } else if (items.length > 0) {
        nightPlanStore.archiveAndReset("done-as-is");
      }
    }
  }, [now, shiftKey, currentShiftKey, items, activeItems.length, rolloverAnsweredShiftKey, promptOpen]);

  const handleCarry = () => {
    const carry = [...activeItems];
    nightPlanStore.archiveAndReset("carry-active");
    nightPlanStore.seedNextShiftFromCarry(carry);
    nightPlanStore.markRolloverAnswered(currentShiftKey);
    setPromptOpen(false);
    toast.success(`${carry.length} item${carry.length === 1 ? "" : "s"} moved to tomorrow's plan.`);
  };
  const handleFresh = () => {
    nightPlanStore.archiveAndReset("dismiss-active");
    nightPlanStore.markRolloverAnswered(currentShiftKey);
    setPromptOpen(false);
    toast("Starting fresh tomorrow.");
  };
  const handleSnooze = () => {
    snoozeUntilRef.current = Date.now() + 10 * 60_000;
    setPromptOpen(false);
    toast("Reminder snoozed 10 minutes.");
  };

  return (
    <RolloverPromptModal
      open={promptOpen}
      onOpenChange={(o) => (o ? setPromptOpen(true) : handleSnooze())}
      activeItems={activeItems}
      onCarry={handleCarry}
      onFresh={handleFresh}
      onSnooze={handleSnooze}
    />
  );
}