/**
 * INVESTIGATOR — "why might this be happening?"
 *
 * Deterministic over canonical Phase 8 investigation state. It never verifies a
 * cause, never converts association into causation, and surfaces contradictions
 * BEFORE support.
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

const DEF = () => getWorker("investigator");

export function runInvestigator(input: WorkerInput, snapshot: CanonicalSnapshot): WorkerOutput {
  const def = DEF();
  const started = Date.now();
  const investigations = selectEvidence(snapshot.investigations, def.budget.maxEvidenceItems);
  const anomalies = selectEvidence(snapshot.anomalies, 5).filter((a) => a.state === "active");

  if (!investigations.length && !anomalies.length) {
    const out = emptyOutput(def, input, "insufficient_evidence", "No canonical investigation or active anomaly exists for this context, so there is nothing grounded to explain yet.");
    out.uncertainties.push("No investigation record exists; candidate explanations would be speculation.");
    out.recommendations.push("Open an investigation so competing explanations can be tracked against evidence.");
    out.elapsedMs = Date.now() - started;
    return out;
  }

  const claims: WorkerClaim[] = [];
  const evidence: WorkerEvidenceRef[] = [];
  const contradictions: string[] = [];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];

  for (const inv of investigations) {
    evidence.push(refFor("investigation", inv));
    for (const c of inv.contradictions) contradictions.push(`${inv.label}: ${c}`);

    const ranked = inv.hypotheses
      .slice()
      .sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id));

    for (const h of ranked.slice(0, 3)) {
      evidence.push(refFor("hypothesis", h));
      claims.push({
        id: `claim:hyp:${h.id}`,
        statement:
          h.status === "verified"
            ? `${h.label} is recorded as verified by the investigation engine.`
            : `${h.label} is a candidate explanation with ${h.strengthClass} support and ${h.contradictionCount} recorded contradiction(s).`,
        type: h.status === "verified" ? "canonical_state" : "inference",
        confidence: h.status === "verified" ? "verified" : h.strengthClass === "strong" ? "moderate" : "low",
        evidence: [refFor("hypothesis", h)],
        limitations:
          h.status === "verified"
            ? h.verificationReopenedAt
              ? ["Verification was reopened after new contradictory evidence arrived; do not report it as settled."]
              : []
            : [
                "Ranking is not verification: a higher-ranked hypothesis is not an established cause.",
                "Temporal association is not causation.",
              ],
      });
      if (h.verificationReopenedAt) {
        contradictions.push(`${h.label}: verification reopened at ${h.verificationReopenedAt}.`);
      }
      if (h.contradictionCount > 0) {
        contradictions.push(`${h.label}: ${h.contradictionCount} contradicting item(s) recorded.`);
      }
    }

    const bestTest = inv.preparedTests
      .slice()
      .sort((a, b) => utility(b.utility) - utility(a.utility) || a.id.localeCompare(b.id))[0];
    if (bestTest) {
      evidence.push(refFor("discriminating_test", bestTest));
      recommendations.push(
        `Run the prepared discriminating test "${bestTest.label}" — it separates ${bestTest.discriminates.length || "the"} competing explanation(s).`,
      );
    } else {
      uncertainties.push(`No discriminating test is prepared for ${inv.label}; competing explanations cannot yet be separated.`);
    }

    if (ranked.filter((h) => h.status !== "rejected").length > 1) {
      uncertainties.push(`${inv.label} still has more than one plausible explanation.`);
    }
  }

  for (const a of anomalies) {
    evidence.push(refFor("anomaly", a));
    claims.push({
      id: `claim:anom:${a.id}`,
      statement: `${a.label} is an active ${a.kind} deviation (${a.severity}) recorded by the anomaly engine.`,
      type: "canonical_state",
      confidence: a.baselineSamples >= 8 ? "high" : "moderate",
      evidence: [refFor("anomaly", a)],
      limitations: ["A deviation is temporally associated with the problem; it is not a demonstrated cause."],
    });
  }

  const out = emptyOutput(def, input, "contributed", summaryFor(contradictions.length, claims.length));
  out.claims = claims;
  out.evidence = dedupe(evidence).slice(0, def.budget.maxEvidenceItems);
  out.contradictions = dedupe2(contradictions);
  out.uncertainties = dedupe2(uncertainties);
  out.recommendations = dedupe2(recommendations);
  out.confidence = claims.some((c) => c.confidence === "verified") ? "high" : contradictions.length ? "low" : "moderate";
  out.operationClass = recommendations.length ? "prepare" : "analyze";
  out.preparedArtifacts = [];
  // A structural mechanism is best separated by the deterministic simulator.
  if (snapshot.scriptStructures.length && uncertainties.length) out.needsSpecialist = "simulator";
  out.elapsedMs = Date.now() - started;
  out.budgetUsed = { maxToolCalls: 0, maxEvidenceItems: out.evidence.length };
  return out;
}

function summaryFor(contradictionCount: number, claimCount: number): string {
  if (contradictionCount) {
    return `There are ${contradictionCount} recorded contradiction(s) to work through before any explanation can be treated as settled.`;
  }
  return claimCount
    ? "Candidate explanations are grounded in the canonical investigation record; none is a verified cause."
    : "No grounded explanation is available yet.";
}

function rank(h: { status: string; strengthClass: string; contradictionCount: number }): number {
  const base = h.status === "verified" ? 4 : h.status === "supported" ? 3 : h.status === "proposed" ? 2 : h.status === "weakened" ? 1 : 0;
  const strength = h.strengthClass === "strong" ? 2 : h.strengthClass === "moderate" ? 1 : 0;
  return base * 10 + strength - Math.min(h.contradictionCount, 3);
}

function utility(u: "high" | "medium" | "low"): number {
  return u === "high" ? 3 : u === "medium" ? 2 : 1;
}

function dedupe(refs: WorkerEvidenceRef[]): WorkerEvidenceRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = `${r.kind}:${r.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupe2(list: string[]): string[] {
  return Array.from(new Set(list));
}
