/**
 * Phase 9 — deterministic routing.
 *
 * Given the same normalized intent, canonical state, worker availability and
 * governance, routing is stable (§44). No model decides whether the Guardian
 * runs; these rules do.
 */

import { isWorkerAvailable } from "./worker-registry";
import type {
  CognitionTier,
  RoutePlan,
  RouteStep,
  WorkerId,
  WorkerTaskKind,
} from "./worker-contract";

export interface RouteContext {
  intent: string;
  accountId?: string;
  /** Operator directives parsed from the request (§45). */
  directives?: OperatorDirectives;
  /** Governance: the operator asked for something actionable. */
  requestedCapabilityId?: string;
  /** True when the phrasing asks the portal to act on production by itself. */
  requestedAutonomousExecution?: boolean;
  hasScriptStructure?: boolean;
}

export interface OperatorDirectives {
  evidenceOnly?: boolean;
  noForecast?: boolean;
  noHistoricalResolutions?: boolean;
  simulateOnly?: boolean;
  /** Never honoured. */
  skipGuardian?: boolean;
}

const CAUSE = /\b(why|cause|causing|root\s*cause|explain(ing)?\s+(the\s+)?(failure|problem|issue)|failing|broken|went\s+wrong)\b/i;
const CHALLENGE = /\b(are\s+(you|we)\s+sure|certain|double[-\s]?check|confident|is\s+that\s+right|prove|verify\s+that)\b/i;
const WHATIF = /\b(what\s+(would|will)\s+happen|what\s+if|simulate|simulation|if\s+we\s+(change|switch|restore|revert)|branch|structural)\b/i;
const FUTURE = /\b(next\s+(week|month|few\s+days)|will\s+this\s+happen\s+again|forecast|outlook|watch\s+(for|over)|risk\s+(next|over))\b/i;
const PRIOR = /\b(before|previously|prior|已|have\s+we\s+(seen|fixed)|what\s+fixed|last\s+time|history|precedent|already\s+know)\b/i;
const ACTION = /\b(fix\s+it|apply\s+it|deploy|do\s+it\s+for\s+me|automatically|go\s+ahead\s+and)\b/i;
const NAVIGATION = /^(open|go\s+to|show\s+me\s+the|navigate|take\s+me\s+to|where\s+is)\b/i;
const LOOKUP = /^(what\s+is\s+the\s+(status|count|number)|how\s+many|list\s+|who\s+is\s+assigned)\b/i;

export function parseDirectives(intent: string): OperatorDirectives {
  const t = intent.toLowerCase();
  const d: OperatorDirectives = {};
  if (/just\s+show\s+me\s+the\s+evidence|evidence\s+only/.test(t)) d.evidenceOnly = true;
  if (/don'?t\s+forecast|no\s+forecast|skip\s+the\s+forecast/.test(t)) d.noForecast = true;
  if (/don'?t\s+use\s+historical|no\s+historical\s+resolutions|ignore\s+history/.test(t)) d.noHistoricalResolutions = true;
  if (/only\s+simulate|simulate\s+only/.test(t)) d.simulateOnly = true;
  if (/(ignore|bypass|skip|disable)\s+(the\s+)?(guardian|governance|security|permission)/.test(t)) d.skipGuardian = true;
  return d;
}

export function classifyIntent(intent: string): WorkerTaskKind | "direct" {
  const t = intent.trim();
  if (!t) return "direct";
  if (ACTION.test(t)) return "governance_check";
  if (CHALLENGE.test(t)) return "challenge_conclusion";
  if (WHATIF.test(t)) return "structural_what_if";
  if (FUTURE.test(t)) return "future_outlook";
  if (CAUSE.test(t)) return "explain_cause";
  if (PRIOR.test(t)) return "prior_knowledge";
  if (NAVIGATION.test(t) || LOOKUP.test(t)) return "direct";
  return "direct";
}

/** Deterministic route plan. Prefers minimal sufficient cognition (§2, §12). */
export function planRoute(ctx: RouteContext): RoutePlan {
  const directives = ctx.directives ?? parseDirectives(ctx.intent);
  const honoured: string[] = [];
  const refused: string[] = [];
  if (directives.skipGuardian) refused.push("Governance checks cannot be disabled.");

  const intentClass = classifyIntent(ctx.intent);
  const steps: RouteStep[] = [];
  /** Workers this route wanted but could not use because they are unavailable (§41). */
  const unavailableWorkers: WorkerId[] = [];
  const push = (workerId: WorkerId, taskKind: WorkerTaskKind, reason: string, wave: number) => {
    if (!isWorkerAvailable(workerId)) {
      if (!unavailableWorkers.includes(workerId)) unavailableWorkers.push(workerId);
      return;
    }
    if (steps.some((s) => s.workerId === workerId)) return;
    steps.push({ workerId, taskKind, reason, wave });
  };

  let criticRequired = false;
  let criticReason = "Low-risk query: critique adds no material value.";
  let tier: CognitionTier = "fast";

  switch (intentClass) {
    case "explain_cause": {
      push("investigator", "explain_cause", "Causal question over canonical investigation state.", 0);
      if (!directives.noHistoricalResolutions) {
        push("researcher", "prior_knowledge", "Prior resolutions may already explain this shape.", 0);
      } else honoured.push("Historical resolutions excluded at your request.");
      if (ctx.hasScriptStructure && WHATIF.test(ctx.intent)) {
        push("simulator", "structural_what_if", "A structural mechanism is in play.", 1);
      }
      criticRequired = true;
      criticReason = "Causal explanations are always challenged before they are shown.";
      tier = "deep";
      break;
    }
    case "challenge_conclusion": {
      push("investigator", "challenge_conclusion", "Re-reads the canonical investigation before answering 'are we sure?'.", 0);
      criticRequired = true;
      criticReason = "The operator explicitly asked whether the conclusion holds.";
      tier = "deep";
      break;
    }
    case "structural_what_if": {
      push("simulator", "structural_what_if", "Structural what-if resolved by the deterministic simulator.", 0);
      criticRequired = true;
      criticReason = "Simulation recommendations affect production testing.";
      tier = "standard";
      if (directives.simulateOnly) honoured.push("Only the simulator was used, as requested.");
      break;
    }
    case "future_outlook": {
      if (directives.noForecast) {
        honoured.push("Forecasting skipped at your request.");
      } else {
        push("forecaster", "future_outlook", "Future-outcome question answered from canonical forecasts.", 0);
      }
      criticRequired = !directives.noForecast;
      criticReason = "Future-risk statements are challenged for certainty language.";
      tier = "standard";
      break;
    }
    case "prior_knowledge": {
      if (directives.noHistoricalResolutions) {
        refused.push("A prior-knowledge question cannot exclude historical resolutions; nothing would remain.");
      }
      push("researcher", "prior_knowledge", "Institutional knowledge lookup.", 0);
      criticRequired = false;
      criticReason = "Low-risk retrieval of recorded precedent.";
      tier = "fast";
      break;
    }
    case "governance_check": {
      criticRequired = false;
      criticReason = "Governance decision, not an analytical claim.";
      tier = "fast";
      break;
    }
    default:
      break;
  }

  if (directives.evidenceOnly) {
    honoured.push("Evidence only — narrative synthesis suppressed.");
    criticRequired = false;
    criticReason = "Evidence-only response: no synthesis to challenge.";
  }
  if (directives.simulateOnly && intentClass !== "structural_what_if") {
    for (let i = steps.length - 1; i >= 0; i -= 1) if (steps[i].workerId !== "simulator") steps.splice(i, 1);
    honoured.push("Only the simulator was used, as requested.");
  }

  const guardianRequired =
    intentClass === "governance_check" ||
    Boolean(ctx.requestedCapabilityId) ||
    Boolean(ctx.requestedAutonomousExecution);

  const direct = steps.length === 0 && !guardianRequired;

  return {
    direct,
    ...(direct
      ? {
          directReason: unavailableWorkers.length
            ? "Every worker this question needs is unavailable, so no cognition could run."
            : "This is answered from deterministic portal state; no specialist cognition adds value.",
        }
      : {}),
    unavailableWorkers,
    intentClass,
    steps,
    criticRequired: criticRequired && steps.length > 0,
    criticReason,
    guardianRequired,
    guardianReason: guardianRequired
      ? "An actionable capability path was requested, so governance must decide before anything is prepared."
      : "No capability progression requested; read-only analysis.",
    cognitionTier: direct ? "fast" : tier,
    honouredDirectives: honoured,
    refusedDirectives: refused,
  };
}
