import { useEffect, useRef } from "react";
import { useTickets, isOverdue } from "@/lib/tickets-store";
import { triggerCelebration } from "@/lib/quantum-bloom/celebration-bus";

/**
 * Fires Quantum Bloom celebrations on genuine shift milestones on top of the
 * per-item celebrations that already exist: every 5th completed ticket, and
 * clearing all overdue. Refs seed from the mounted value so a page reload never
 * re-fires. triggerCelebration is a no-op unless the Quantum Bloom theme is on.
 */
export function MilestoneWatcher() {
  const { tickets } = useTickets();
  const completed = tickets.filter((t) => t.status === "completed").length;
  const overdue = tickets.filter((t) => t.status !== "completed" && isOverdue(t)).length;

  const prevCompleted = useRef<number | null>(null);
  const prevOverdue = useRef<number | null>(null);

  useEffect(() => {
    if (prevCompleted.current === null) {
      prevCompleted.current = completed;
      return;
    }
    if (completed > prevCompleted.current) {
      const crossedFive = Math.floor(completed / 5) > Math.floor(prevCompleted.current / 5);
      if (crossedFive) {
        triggerCelebration({
          kind: "milestone",
          label: `${completed} tickets completed this shift`,
          context: { milestone: "nth-complete", count: completed },
        });
      }
    }
    prevCompleted.current = completed;
  }, [completed]);

  useEffect(() => {
    if (prevOverdue.current === null) {
      prevOverdue.current = overdue;
      return;
    }
    if (prevOverdue.current > 0 && overdue === 0) {
      triggerCelebration({
        kind: "milestone",
        label: "All overdue tickets cleared",
        context: { milestone: "overdue-cleared" },
      });
    }
    prevOverdue.current = overdue;
  }, [overdue]);

  return null;
}
