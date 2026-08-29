/**
 * Governed Actions — the 7022 surgical-cancellation demo.
 *
 * Tonight's real work: the account 7022 surgical-cancellation script fix. This
 * helper PREPARES (never applies) the governed actions that record that work —
 * a completed-work entry, an optional knowledge-vault note, and a shift-summary
 * line — and drops each onto the Action Center queue as a PROPOSAL with an
 * operator-facing reason. Nothing here writes anything; every write still
 * requires the operator to confirm each proposal in the Action Center, and every
 * target is INTERNAL (no external system is touched).
 */

import { executionStore } from "@/lib/execution/execution-store";
import {
  prepareCompletedWorkEntry,
  prepareKnowledgeVaultNote,
  prepareShiftSummaryDraft,
} from "./governed-producers";
import type { PlanResult } from "@/lib/execution/execution-plan";

const ACCOUNT = "7022";

export interface DemoProposalOutcome {
  /** Plan ids that were queued as proposals. */
  proposed: string[];
  /** Human labels for anything that could not be prepared (e.g. blocked). */
  skipped: { label: string; message: string }[];
}

export interface SevenZeroTwoTwoDemoOptions {
  operatorRef: string;
  /** Optional knowledge note is opt-in; the completed entry + summary always go. */
  includeKnowledgeNote?: boolean;
  shiftKey?: string;
  now?: () => number;
}

function currentShiftKey(now: () => number): string {
  // A stable per-night key; the real app derives this from the shift store, but
  // the demo only needs a deterministic, non-sensitive key.
  return `shift-${new Date(now()).toISOString().slice(0, 10)}`;
}

/**
 * Queue the 7022-fix proposals. Returns which plans were proposed so a caller
 * (or a test) can confirm exactly what landed on the queue.
 */
export function proposeSevenZeroTwoTwoDemo(opts: SevenZeroTwoTwoDemoOptions): DemoProposalOutcome {
  const now = opts.now ?? Date.now;
  const shiftKey = opts.shiftKey ?? currentShiftKey(now);
  const proposed: string[] = [];
  const skipped: { label: string; message: string }[] = [];

  const queue = (label: string, result: PlanResult, reason: string): void => {
    if (result.ok) {
      executionStore.propose(result.plan, opts.operatorRef, reason);
      proposed.push(result.plan.id);
    } else {
      skipped.push({ label, message: result.message });
    }
  };

  queue(
    "Completed work entry",
    prepareCompletedWorkEntry({
      operatorRef: opts.operatorRef,
      title: `Account ${ACCOUNT} — surgical cancellation script fix`,
      accountNumber: ACCOUNT,
      ticketNumber: ACCOUNT,
      summary:
        "Corrected the surgical-cancellation branch so a cancellation routes to the on-call coordinator instead of dead-ending.",
      ...(opts.now ? { now: opts.now } : {}),
    }),
    `Records tonight's ${ACCOUNT} surgical-cancellation fix as completed work so the audit trail and shift ledger reflect it.`,
  );

  if (opts.includeKnowledgeNote) {
    queue(
      "Knowledge vault note",
      prepareKnowledgeVaultNote({
        operatorRef: opts.operatorRef,
        title: `${ACCOUNT} surgical cancellation routing`,
        contentHtml:
          "<p>Surgical cancellations on account 7022 must route to the on-call coordinator. " +
          "The prior branch dead-ended; corrected and verified in the Script Twin sandbox.</p>",
        ...(opts.now ? { now: opts.now } : {}),
      }),
      `Captures the ${ACCOUNT} routing rule so the next operator can find the fix instead of rediscovering it.`,
    );
  }

  queue(
    "Shift summary line",
    prepareShiftSummaryDraft({
      operatorRef: opts.operatorRef,
      shiftKey,
      title: `Shift summary — ${ACCOUNT} fix`,
      body: `Fixed account ${ACCOUNT} surgical-cancellation routing (now reaches the on-call coordinator); verified in the Script Twin sandbox and recorded as completed work.`,
      ...(opts.now ? { now: opts.now } : {}),
    }),
    `Adds a line to tonight's shift summary draft so the ${ACCOUNT} fix is handed off clearly.`,
  );

  return { proposed, skipped };
}
