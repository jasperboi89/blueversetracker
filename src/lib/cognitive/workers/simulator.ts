/**
 * SIMULATOR — "what could this structure do under these conditions?"
 *
 * The deterministic simulation engine is the ONLY source of simulated truth.
 * This worker reads canonical simulation runs and structure records; it never
 * imagines a path, a terminal, or an outcome.
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

const MIN_RECOGNITION = 0.6;

export function runSimulator(input: WorkerInput, snapshot: CanonicalSnapshot): WorkerOutput {
  const def = getWorker("simulator");
  const started = Date.now();

  const structures = selectEvidence(snapshot.scriptStructures, 3);
  const runs = selectEvidence(snapshot.simulations, 5);

  if (!structures.length) {
    const out = emptyOutput(def, input, "insufficient_evidence", "No recognised script structure is recorded for this context, so no structural reasoning is possible.");
    out.uncertainties.push("Script Intelligence has no structure record; simulation is withheld rather than guessed.");
    out.elapsedMs = Date.now() - started;
    return out;
  }

  const poor = structures.filter((s) => s.recognitionCoverage < MIN_RECOGNITION);
  const usable = structures.filter((s) => s.recognitionCoverage >= MIN_RECOGNITION);
  const claims: WorkerClaim[] = [];
  const evidence: WorkerEvidenceRef[] = [];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];

  for (const s of poor) {
    evidence.push(refFor("script_structure", s));
    uncertainties.push(
      `${s.label} is only ${(s.recognitionCoverage * 100).toFixed(0)}% recognised — below the ${(MIN_RECOGNITION * 100).toFixed(0)}% simulation floor, so its behaviour is not simulated.`,
    );
  }

  for (const s of usable) {
    evidence.push(refFor("script_structure", s));
    claims.push({
      id: `claim:struct:${s.id}`,
      statement: `${s.label} version ${s.version} is the current recorded structure (${s.componentCount} components, ${(s.recognitionCoverage * 100).toFixed(0)}% recognised).`,
      type: "canonical_state",
      confidence: "verified",
      evidence: [refFor("script_structure", s)],
      limitations: ["Structure reflects the recorded version; confirm the deployed version before relying on it."],
    });
  }

  if (!runs.length) {
    const out = emptyOutput(def, input, usable.length ? "not_applicable" : "insufficient_evidence", usable.length
      ? "Structure is recognised, but no deterministic simulation run exists for this scenario yet."
      : "Structure recognition is below the simulation floor.");
    out.claims = claims;
    out.evidence = evidence;
    out.uncertainties = uncertainties;
    out.recommendations = usable.length
      ? ["Build a scenario and run the deterministic simulator before drawing structural conclusions."]
      : [];
    out.confidence = "unknown";
    out.elapsedMs = Date.now() - started;
    return out;
  }

  for (const r of runs) {
    evidence.push(refFor("simulation", r));
    if (r.status === "insufficient_structure" || r.status === "invalid_scenario") {
      uncertainties.push(`Simulation ${r.label} returned ${r.status.replace("_", " ")} and produced no path.`);
      continue;
    }
    claims.push({
      id: `claim:sim:${r.id}`,
      statement: `Simulated path for ${r.label} traverses ${r.pathLength} step(s)${r.terminal ? ` and ends at "${r.terminal}"` : " without reaching a terminal"} (${r.status}, ${r.confidence} confidence).`,
      type: "simulated_outcome",
      confidence: r.confidence === "high" ? "moderate" : "low",
      evidence: [refFor("simulation", r)],
      limitations: [
        "A simulated path is a modelling result, not production behaviour.",
        "A simulation match is not a production pass — a live test is still required.",
      ],
    });
    if (!r.structureFingerprint) {
      uncertainties.push(`Simulation ${r.label} is not tied to a recorded structure fingerprint (SCRIPT VERSION UNKNOWN).`);
    }
    recommendations.push(`Prepare a live test covering the simulated path for ${r.label} before relying on it.`);
  }

  const out = emptyOutput(def, input, claims.length ? "contributed" : "unknown", claims.length
    ? "Structural reasoning below comes from the deterministic simulator; every result still requires a live test."
    : "No usable simulated path was produced.");
  out.claims = claims;
  out.evidence = evidence.slice(0, def.budget.maxEvidenceItems);
  out.uncertainties = Array.from(new Set(uncertainties));
  out.recommendations = Array.from(new Set(recommendations));
  out.confidence = claims.some((c) => c.type === "simulated_outcome") ? "moderate" : "low";
  out.operationClass = recommendations.length ? "prepare" : "analyze";
  out.preparedArtifacts = recommendations.length
    ? [
        {
          kind: "live_test_plan",
          label: "Live verification of the simulated path",
          detail: { runs: runs.length, requiresLiveTest: true },
          requiresOperatorConfirmation: true,
        },
      ]
    : [];
  out.elapsedMs = Date.now() - started;
  out.budgetUsed = { maxToolCalls: runs.length, maxEvidenceItems: out.evidence.length };
  return out;
}
