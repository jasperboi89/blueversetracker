/**
 * Phase 15 — bounded Copilot section for the Guarded Plan.
 *
 * The model receives the *derived* plan, so it can explain the route without
 * inventing steps, and it can never claim progress the verification loop has
 * not established.
 */

import type { GuardedPlan } from "./plan-contract";

const MAX_CHARS = 1400;

const STATUS_LABEL: Record<string, string> = {
  pending: "pending (earlier step not verified)",
  ready: "ready to start",
  in_progress: "in progress",
  awaiting_verification: "awaiting verification",
  verified: "verified",
  failed: "FAILED verification",
  skipped: "skipped by operator",
  blocked: "blocked",
};

export function serializeGuardedPlan(plan: GuardedPlan): string {
  const lines: string[] = ["## GUARDED PLAN"];
  lines.push(
    "A proposed route through the current work. Rules you must follow:",
    "- The plan is a suggestion, never authorization and never a record of work done.",
    "- A step counts as done ONLY when its status is verified. Never assume it worked.",
    "- Never execute a step, and never tell the operator a change has been made.",
    "- If the plan is halted or empty, say so plainly instead of improvising steps.",
  );

  lines.push("", `STATUS: ${plan.status.toUpperCase()}`);
  if (plan.objective) lines.push(`OBJECTIVE: ${plan.objective}`);
  if (plan.haltReason) lines.push(`HALTED: ${plan.haltReason}`);

  if (!plan.steps.length) {
    lines.push(
      "STEPS: none — there is no grounded guidance for this work yet.",
      ...plan.warnings.map((w) => `NOTE (${w.code}): ${w.message}`),
    );
    const empty = lines.join("\n");
    return empty.length > MAX_CHARS ? `${empty.slice(0, MAX_CHARS - 1)}…` : empty;
  }

  lines.push("STEPS:");
  for (const s of plan.steps) {
    lines.push(
      `${s.index + 1}. [${STATUS_LABEL[s.status] ?? s.status}] ${s.kind} — ${s.label}` +
        (s.mutating ? " (mutating: requires operator confirmation through the Safe Action Executor)" : "") +
        (s.blockers.length ? ` — blocked by ${s.blockers.map((b) => b.label).join("; ")}` : ""),
    );
  }

  const current = plan.steps.find((s) => s.fingerprint === plan.currentStepFingerprint);
  lines.push(
    current
      ? `CURRENT STEP: ${current.index + 1} — ${current.label}. Verification required: ${current.verification.label}`
      : "CURRENT STEP: none available right now.",
  );

  for (const w of plan.warnings) lines.push(`NOTE (${w.code}): ${w.message}`);
  if (plan.degraded) lines.push("NOTE: some context sources were unavailable — unknown, not empty.");

  const text = lines.join("\n");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;
}