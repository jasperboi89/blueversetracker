import type { TaskKind } from "./task-types";

/**
 * Deterministic-first interception: obvious structured commands are answered
 * by application state, never by a model.
 */
export type InterceptKind =
  | "open_account"
  | "open_ticket"
  | "current_work"
  | "night_plan_state"
  | "search_prior_work";

export interface DeterministicIntercept {
  intercept: InterceptKind;
  taskKind: TaskKind;
  /** Extracted identifier, when the command carries one. */
  target?: string;
  /** True when the operator likely wants interpretation of the results too. */
  wantsInterpretation?: boolean;
}

const OPEN_ACCOUNT = /^(?:open|show|go to|pull up)\s+(?:the\s+)?account\s+#?(\d{2,8})\b/i;
const OPEN_TICKET = /^(?:open|show|go to|pull up)\s+(?:the\s+)?ticket\s+#?(\d{2,10})\b/i;
const CURRENT_WORK =
  /^(?:what|which)\s+(?:ticket|work|account)\s+(?:am i|are we)\s+(?:currently\s+)?working on\b/i;
const NIGHT_PLAN =
  /\b(how many|what)\b.*\b(must|should|could)?\s*items?\b.*\b(night plan|remain|left)\b|^night plan status\b/i;
const SEEN_BEFORE =
  /\b(have we|has this|did we)\b.*\b(seen|dealt with|fixed|handled)\b.*\b(before|previously)\b/i;

const INTERPRET_HINT = /\b(explain|why|summariz|compare|analyz|interpret|what does it mean)\w*/i;

/** Returns a deterministic route for a raw operator message, or null. */
export function detectDeterministicIntent(raw: string): DeterministicIntercept | null {
  const text = raw.trim();
  if (!text) return null;

  const account = OPEN_ACCOUNT.exec(text);
  if (account) return { intercept: "open_account", taskKind: "navigation", target: account[1] };

  const ticket = OPEN_TICKET.exec(text);
  if (ticket) return { intercept: "open_ticket", taskKind: "navigation", target: ticket[1] };

  if (CURRENT_WORK.test(text)) return { intercept: "current_work", taskKind: "lookup" };
  if (NIGHT_PLAN.test(text)) return { intercept: "night_plan_state", taskKind: "lookup" };

  if (SEEN_BEFORE.test(text)) {
    return {
      intercept: "search_prior_work",
      taskKind: "search",
      wantsInterpretation: INTERPRET_HINT.test(text),
    };
  }

  return null;
}

const INVESTIGATION =
  /\b(root cause|why (?:does|is|did)|compare|conflicting|across (?:several|multiple)|most likely cause|pattern|recurring|troubleshoot)\b/i;
const DOCUMENTATION = /\b(is script|intelligent series|amtelco|documentation|manual)\b/i;
const SUMMARY = /\b(summar|recap|digest|handoff|draft a note)\w*/i;
const CLASSIFY = /\b(classify|categoriz|tag|which group|label this)\w*/i;

/**
 * Lightweight, deterministic task classification for open-ended Copilot text.
 * Ambiguous input intentionally lands on the safe BALANCED path.
 */
export function classifyOperatorMessage(raw: string): TaskKind {
  const text = raw.trim();
  if (CLASSIFY.test(text)) return "classification";
  if (DOCUMENTATION.test(text) && INVESTIGATION.test(text)) return "knowledge_interpretation";
  if (INVESTIGATION.test(text)) {
    if (/\baccount\b/i.test(text)) return "account_investigation";
    if (/\bticket\b/i.test(text)) return "ticket_investigation";
    return "pattern_analysis";
  }
  if (SUMMARY.test(text)) return "summary";
  return "operational_question";
}