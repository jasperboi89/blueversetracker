import { useMemo } from "react";
import { getShiftKey, getShiftProgress, getShiftStatus } from "@/lib/shift";
import { isActive, useNightPlan } from "@/lib/night-plan-store";
import { elapsedMs, useActiveWork } from "@/lib/workspace/active-work-store";
import { useTickets } from "@/lib/tickets-store";
import { useNow } from "@/hooks/use-now";
import { useAwareness } from "./awareness-store";
import { useShiftWorkingContext } from "./shift-context";
import {
  buildFocusWorkspace,
  type FocusAccountSummary,
  type FocusSnapshot,
  type FocusWorkspaceState,
} from "./focus-workspace";

/**
 * Live Focus Workspace state. Purely derived on read from the authoritative
 * stores — Focus never persists its own copy of CURRENT/NEXT/WATCH/BLOCKED.
 */
export function useFocusWorkspace(account?: FocusAccountSummary): FocusWorkspaceState {
  const { current } = useActiveWork();
  const plan = useNightPlan();
  const { tickets } = useTickets();
  const awareness = useAwareness();
  const ctx = useShiftWorkingContext();
  // Coarse tick: enough for durations and shift-end, quiet enough for a
  // long work session (no per-second layout churn in the shell).
  const tick = useNow(15_000);

  return useMemo(() => {
    const nowDate = tick.getTime() ? tick : new Date();
    const now = nowDate.getTime();
    const snapshot: FocusSnapshot = {
      now,
      shiftKey: getShiftKey(nowDate),
      shiftStatus: getShiftStatus(nowDate),
      shiftProgress: getShiftProgress(nowDate),
      activeWork: current
        ? {
            kind: current.kind,
            id: current.id,
            label: current.label,
            running: current.running,
            elapsedMs: elapsedMs(current, now),
            to: current.to.replace(/^\/_authenticated/, ""),
            params: current.params,
            accountNumber: current.accountNumber,
            accountName: current.accountName,
          }
        : null,
      context: {
        activeTicket: ctx.activeTicket,
        activeAccount: ctx.activeAccount,
        activeDispatch: ctx.activeDispatch,
        blockers: ctx.blockers ?? [],
      },
      nightPlan: plan.items.map((i) => ({
        id: i.id,
        task: i.task,
        priority: i.priority,
        active: isActive(i.status),
      })),
      awareness,
      tickets: tickets.map((t) => ({
        id: t.id,
        number: t.number,
        status: t.status,
        updatedAt: t.updatedAt,
        accountNumber: t.accountNumber,
      })),
      account,
    };
    return buildFocusWorkspace(snapshot);
  }, [current, plan, tickets, awareness, ctx, tick, account]);
}
