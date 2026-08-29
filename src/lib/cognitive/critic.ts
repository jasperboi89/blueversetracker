/**
 * CRITIC — "what are we missing or getting wrong?"
 *
 * Read-only over ANOTHER worker's structured contribution (§31): it needs the
 * claims, not the portal. It does not veto everything — it classifies material
 * weaknesses so the Orchestrator can request at most one bounded revision.
 */

import { getWorker, isWorkerAvailable } from "./worker-registry";
import { detectCausalOverreach, detectCertaintyOverreach, detectSimulationOverreach } from "./sanitize";
import type {
  CriticIssue,
  CriticResult,
  WorkerInput,
  WorkerOutput,
} from "./worker-contract";

export interface CriticContext {
  /** Historical mode boundary — later evidence is leakage. */
  asOf?: string;
  /** Account the run is scoped to. */
  accountId?: string;
  /** Other contributions in the same run, for contradiction detection. */
  peers?: WorkerOutput[];
}

export function runCritic(
  input: WorkerInput,
  target: WorkerOutput,
  ctx: CriticContext = {},
): CriticResult {
  const def = getWorker("critic");
  const started = Date.now();

  if (!isWorkerAvailable("critic")) {
    return {
      workerId: "critic",
      workerVersion: def.version,
      taskId: input.taskId,
      correlationId: input.correlationId,
      reviewedWorker: target.workerId,
      status: "unavailable",
      issues: [],
      revisionRequested: false,
      summary: "Critic review was unavailable for this run; findings were not independently challenged.",
      elapsedMs: Date.now() - started,
    };
  }

  const issues: CriticIssue[] = [];
  const add = (i: CriticIssue) => issues.push(i);

  const allText = [target.summary, ...target.claims.map((c) => c.statement), ...target.recommendations].join(" \n ");

  if (detectCausalOverreach(allText)) {
    add({
      code: "CAUSAL_OVERREACH",
      target: "summary/claims",
      detail: "Wording asserts causation where the evidence supports temporal association only.",
      material: true,
      suggestedFix: "Restate as an association or candidate explanation.",
    });
  }
  if (detectCertaintyOverreach(allText)) {
    add({
      code: "FORECAST_OVERREACH",
      target: "summary/claims",
      detail: "Wording presents a future outcome as certain.",
      material: true,
      suggestedFix: "Restate as what tended to follow comparable states, with the horizon.",
    });
  }
  if (detectSimulationOverreach(allText)) {
    add({
      code: "SIMULATION_OVERREACH",
      target: "summary/claims",
      detail: "Simulated behaviour is described as production behaviour or as a pass/fail.",
      material: true,
      suggestedFix: "Use simulation match/mismatch language and keep the live-test requirement.",
    });
  }

  for (const claim of target.claims) {
    if (!claim.evidence.length) {
      add({
        code: "MISSING_EVIDENCE",
        target: claim.id,
        detail: `Claim "${truncate(claim.statement)}" carries no canonical evidence reference.`,
        material: true,
        suggestedFix: "Attach a canonical reference or downgrade the claim to a gap.",
      });
    }
    if ((claim.type === "inference" || claim.type === "forecast_observation" || claim.type === "simulated_outcome") && !claim.limitations.length) {
      add({
        code: "OVERCLAIM",
        target: claim.id,
        detail: `A ${claim.type} claim states no known limitations.`,
        material: true,
        suggestedFix: "State the limitation that separates it from an established fact.",
      });
    }
    if (claim.type === "inference" && claim.confidence === "verified") {
      add({
        code: "OVERCLAIM",
        target: claim.id,
        detail: "An inference is presented with verified confidence.",
        material: true,
        suggestedFix: "Only the canonical engine may mark something verified.",
      });
    }
    if (ctx.asOf && claim.evidence.some((e) => e.at && e.at > ctx.asOf!)) {
      add({
        code: "TEMPORAL_LEAKAGE_RISK",
        target: claim.id,
        detail: `Evidence recorded after the as-of boundary ${ctx.asOf} was used.`,
        material: true,
        suggestedFix: "Drop post-boundary evidence from historical analysis.",
      });
    }
    if (ctx.accountId && claim.evidence.some((e) => e.accountId && e.accountId !== ctx.accountId)) {
      add({
        code: "PRIVACY_SENSITIVITY_ISSUE",
        target: claim.id,
        detail: "Evidence from another account was referenced without an authorised cross-account scope.",
        material: true,
        suggestedFix: "Restrict retrieval to the account in scope.",
      });
    }
  }

  if (target.contradictions.length && !target.uncertainties.length) {
    add({
      code: "CONTRADICTORY_EVIDENCE",
      target: "contradictions",
      detail: "Contradictions are recorded but no uncertainty is carried into the conclusion.",
      material: true,
      suggestedFix: "Surface the unresolved contradiction as an explicit uncertainty.",
    });
  }

  const explanatory = target.claims.filter((c) => c.type === "inference");
  if (explanatory.length === 1 && target.workerId === "investigator" && !target.uncertainties.length) {
    add({
      code: "ALTERNATIVE_EXPLANATION_MISSING",
      target: "claims",
      detail: "A single explanation is offered without naming an alternative or the evidence that would rule one out.",
      material: false,
      suggestedFix: "Name at least one alternative or the discriminating test that would separate them.",
    });
  }

  for (const peer of ctx.peers ?? []) {
    if (peer.workerId === target.workerId) continue;
    if (conflicts(peer, target)) {
      add({
        code: "CONTRADICTORY_EVIDENCE",
        target: `peer:${peer.workerId}`,
        detail: `${peer.workerId} and ${target.workerId} reach different conclusions; the disagreement must stay visible.`,
        material: false,
      });
    }
  }

  if (!issues.length) {
    add({ code: "NO_MATERIAL_ISSUE", target: "contribution", detail: "No material weakness found.", material: false });
  }

  const revisionRequested = issues.some((i) => i.material);
  return {
    workerId: "critic",
    workerVersion: def.version,
    taskId: input.taskId,
    correlationId: input.correlationId,
    reviewedWorker: target.workerId,
    status: "reviewed",
    issues,
    revisionRequested,
    summary: revisionRequested
      ? `${issues.filter((i) => i.material).length} material issue(s) found in the ${target.workerId} contribution.`
      : "No material issue found.",
    elapsedMs: Date.now() - started,
  };
}

function conflicts(a: WorkerOutput, b: WorkerOutput): boolean {
  // Documentation vs current deterministic structure is the canonical conflict
  // shape (§37): both worked, both are grounded, and they disagree.
  const structural = [a, b].find((w) => w.workerId === "simulator");
  const documentary = [a, b].find((w) => w.workerId === "researcher");
  if (!structural || !documentary) return false;
  return structural.status === "contributed" && documentary.status === "contributed" && documentary.claims.some((c) => c.type === "observed_fact");
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * Bounded revision (§16): apply the Critic's material findings to the
 * contribution deterministically. Exactly one pass, no debate.
 */
export function reviseContribution(output: WorkerOutput, critique: CriticResult): WorkerOutput {
  if (!critique.revisionRequested) return output;
  const revised: WorkerOutput = {
    ...output,
    claims: output.claims.map((c) => ({ ...c, limitations: c.limitations.slice() })),
    uncertainties: output.uncertainties.slice(),
    notes: output.notes.slice(),
  };

  for (const issue of critique.issues.filter((i) => i.material)) {
    switch (issue.code) {
      case "CAUSAL_OVERREACH":
        revised.summary = softenCausal(revised.summary);
        revised.claims = revised.claims.map((c) => ({ ...c, statement: softenCausal(c.statement) }));
        break;
      case "FORECAST_OVERREACH":
        revised.summary = softenCertainty(revised.summary);
        revised.claims = revised.claims.map((c) => ({ ...c, statement: softenCertainty(c.statement) }));
        break;
      case "SIMULATION_OVERREACH":
        revised.claims = revised.claims.map((c) =>
          c.type === "simulated_outcome"
            ? { ...c, limitations: unique([...c.limitations, "Simulated only — a live test is still required."]) }
            : c,
        );
        break;
      case "OVERCLAIM":
        revised.claims = revised.claims.map((c) =>
          c.id === issue.target
            ? {
                ...c,
                confidence: c.confidence === "verified" && c.type === "inference" ? "moderate" : c.confidence,
                limitations: unique([...c.limitations, "This is not an established fact."]),
              }
            : c,
        );
        break;
      case "MISSING_EVIDENCE":
        revised.claims = revised.claims.map((c) =>
          c.id === issue.target ? { ...c, type: "gap", confidence: "unknown", limitations: unique([...c.limitations, "No canonical evidence reference."]) } : c,
        );
        break;
      case "TEMPORAL_LEAKAGE_RISK":
        revised.claims = revised.claims.filter((c) => c.id !== issue.target);
        revised.uncertainties = unique([...revised.uncertainties, "Evidence recorded after the historical boundary was excluded."]);
        break;
      case "PRIVACY_SENSITIVITY_ISSUE":
        revised.claims = revised.claims.filter((c) => c.id !== issue.target);
        revised.evidence = revised.evidence.filter((e) => !e.accountId || e.accountId === (revised.evidence[0]?.accountId ?? e.accountId));
        revised.uncertainties = unique([...revised.uncertainties, "Out-of-scope account evidence was removed."]);
        break;
      case "CONTRADICTORY_EVIDENCE":
        revised.uncertainties = unique([
          ...revised.uncertainties,
          "Recorded contradictions remain unresolved, so no explanation should be treated as settled.",
        ]);
        break;
      default:
        break;
    }
  }

  revised.notes = unique([...revised.notes, `Revised once after critic review (${critique.issues.filter((i) => i.material).length} material issue(s)).`]);
  return revised;
}

function softenCausal(s: string): string {
  return s
    .replace(/\broot cause is\b/gi, "strongest candidate explanation is")
    .replace(/\bis causing\b/gi, "is temporally associated with")
    .replace(/\bcaused by\b/gi, "temporally associated with")
    .replace(/\bthis proves\b/gi, "this is consistent with");
}

function softenCertainty(s: string): string {
  return s
    .replace(/\bwill (definitely|certainly) happen\b/gi, "tended to follow comparable states")
    .replace(/\bguaranteed\b/gi, "not guaranteed")
    .replace(/\b100% (certain|sure)\b/gi, "uncertain")
    .replace(/\bthere is no doubt\b/gi, "there is uncertainty");
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list));
}
