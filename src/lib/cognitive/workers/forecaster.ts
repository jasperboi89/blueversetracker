/**
 * FORECASTER — "what tended to happen after comparable historical states?"
 *
 * The canonical forecasting engine owns the forecast. This worker explains it.
 * If the engine says INSUFFICIENT FORECAST EVIDENCE, the worker preserves that
 * verdict and explains why — it never manufactures a probability.
 */

import { getWorker } from "../worker-registry";
import { refFor, selectEvidence, type CanonicalSnapshot } from "../canonical-sources";
import {
  emptyOutput,
  type WorkerClaim,
  type WorkerEvidenceRef,
  type WorkerInput,
  type WorkerOutput,
} from "../worker-contract";

export function runForecaster(input: WorkerInput, snapshot: CanonicalSnapshot): WorkerOutput {
  const def = getWorker("forecaster");
  const started = Date.now();
  const forecasts = selectEvidence(snapshot.forecasts, def.budget.maxEvidenceItems);

  if (!forecasts.length) {
    const out = emptyOutput(def, input, "insufficient_evidence", "The forecasting engine has produced no forecast for this account, so there is nothing to project.");
    out.uncertainties.push("No canonical forecast exists; an outlook would be invented rather than derived.");
    out.elapsedMs = Date.now() - started;
    return out;
  }

  const claims: WorkerClaim[] = [];
  const evidence: WorkerEvidenceRef[] = [];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];

  const insufficient = forecasts.filter((f) => f.state === "insufficient_evidence" || f.band === "insufficient_evidence");
  const usable = forecasts.filter((f) => !insufficient.includes(f));

  for (const f of insufficient) {
    evidence.push(refFor("forecast", f));
    uncertainties.push(
      `INSUFFICIENT FORECAST EVIDENCE for ${f.label}: only ${f.comparableCount} comparable historical state(s) were found, so no band is asserted.`,
    );
  }

  for (const f of usable) {
    evidence.push(refFor("forecast", f));
    claims.push({
      id: `claim:fc:${f.id}`,
      statement: `After comparable historical states, ${f.label} activity tended to fall in the ${f.band} band over the next ${f.horizonDays} day(s) (${f.evidenceQuality} evidence, ${f.comparableCount} comparable state(s)).`,
      type: "forecast_observation",
      confidence: f.evidenceQuality === "strong" ? "moderate" : "low",
      evidence: [refFor("forecast", f)],
      limitations: [
        "This describes what tended to follow comparable states; it is not a prediction and carries no certainty.",
        `The outcome window closes ${f.windowEndsAt ?? `in ${f.horizonDays} day(s)`}; grading happens only after it elapses.`,
      ],
    });
    if (f.band !== "typical") {
      recommendations.push(`Watch ${f.label} through the ${f.horizonDays}-day window and record what actually happens so the forecast can be graded.`);
    }
  }

  const comparables = selectEvidence(snapshot.comparableStates, 5);
  for (const c of comparables) evidence.push(refFor("comparable_state", c));

  const out = emptyOutput(
    def,
    input,
    claims.length ? "contributed" : "insufficient_evidence",
    claims.length
      ? "The outlook below is a comparable-state observation from the forecasting engine, not a prediction."
      : "The forecasting engine reports insufficient evidence for an outlook here.",
  );
  out.claims = claims;
  out.evidence = evidence.slice(0, def.budget.maxEvidenceItems);
  out.uncertainties = Array.from(new Set(uncertainties));
  out.recommendations = Array.from(new Set(recommendations));
  out.confidence = claims.length ? "low" : "unknown";
  out.operationClass = "analyze";
  out.elapsedMs = Date.now() - started;
  out.budgetUsed = { maxToolCalls: 0, maxEvidenceItems: out.evidence.length };
  return out;
}
