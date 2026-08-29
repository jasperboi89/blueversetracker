/**
 * RESEARCHER — "what do we already know that may matter here?"
 *
 * Prefers same-account verified internal knowledge, returns provenance, names
 * gaps instead of filling them, and treats every retrieved body as DATA.
 */

import { getWorker } from "../worker-registry";
import { refFor, selectEvidence, type CanonicalSnapshot } from "../canonical-sources";
import { sanitizeRetrievedText } from "../sanitize";
import {
  emptyOutput,
  type WorkerClaim,
  type WorkerEvidenceRef,
  type WorkerInput,
  type WorkerOutput,
} from "../worker-contract";

export function runResearcher(input: WorkerInput, snapshot: CanonicalSnapshot): WorkerOutput {
  const def = getWorker("researcher");
  const started = Date.now();

  const resolutions = selectEvidence(snapshot.resolutions, 5);
  const notes = selectEvidence(snapshot.knowledgeNotes, 5);
  const work = selectEvidence(snapshot.completedWork, 5);
  const changes = selectEvidence(snapshot.changeRecords, 5);

  const claims: WorkerClaim[] = [];
  const evidence: WorkerEvidenceRef[] = [];
  const uncertainties: string[] = [];
  const recommendations: string[] = [];
  const notesOut: string[] = [];

  for (const r of resolutions) {
    evidence.push(refFor("resolution", r));
    claims.push({
      id: `claim:res:${r.id}`,
      statement: `${r.label} was previously resolved (${r.outcome})${r.at ? ` on ${r.at.slice(0, 10)}` : ""}.`,
      type: "historical_precedent",
      confidence: r.verified ? "high" : "moderate",
      evidence: [refFor("resolution", r)],
      limitations: [
        "A prior resolution describes what happened before; it is not evidence about the current structure.",
      ],
    });
  }

  for (const n of notes) {
    const clean = sanitizeRetrievedText(n.body, 240);
    if (clean.flagged) {
      notesOut.push(`Knowledge note "${n.label}" contained instruction-like text (${clean.codes.join(", ")}); it was treated strictly as data.`);
    }
    evidence.push(refFor("knowledge_note", n));
    claims.push({
      id: `claim:note:${n.id}`,
      statement: `Curated knowledge "${n.label}" is relevant${n.collection ? ` (collection: ${n.collection})` : ""}.`,
      type: "observed_fact",
      confidence: "moderate",
      evidence: [refFor("knowledge_note", n)],
      limitations: ["Documentation can be stale; current deterministic structure outranks it for current behaviour."],
    });
  }

  for (const w of work) evidence.push(refFor("completed_work", w));
  for (const c of changes) {
    evidence.push(refFor("change_record", c));
    claims.push({
      id: `claim:chg:${c.id}`,
      statement: `Change record "${c.label}" is on file${c.at ? ` from ${c.at.slice(0, 10)}` : ""}.`,
      type: "observed_fact",
      confidence: "high",
      evidence: [refFor("change_record", c)],
      limitations: ["A recorded change is temporally associated with later behaviour, not a demonstrated cause."],
    });
  }

  if (!resolutions.length) uncertainties.push("No prior verified resolution is recorded for this account and problem shape.");
  if (!notes.length) uncertainties.push("No curated knowledge note covers this topic — a documentation gap, not an answer.");
  if (!resolutions.length && !notes.length) {
    recommendations.push("Capture the eventual fix as a Resolution so the next occurrence has precedent.");
  }

  const status = claims.length ? "contributed" : "insufficient_evidence";
  const out = emptyOutput(def, input, status, claims.length
    ? "Relevant institutional knowledge, with provenance, is listed below."
    : "Nothing relevant is recorded in institutional knowledge for this context.");
  out.claims = claims;
  out.evidence = evidence.slice(0, def.budget.maxEvidenceItems);
  out.uncertainties = uncertainties;
  out.recommendations = recommendations;
  out.notes = notesOut;
  out.confidence = resolutions.some((r) => r.verified) ? "high" : claims.length ? "moderate" : "unknown";
  out.operationClass = "read";
  out.preparedArtifacts = uncertainties.length
    ? [
        {
          kind: "knowledge_gap",
          label: "Documentation gap identified",
          detail: { gaps: uncertainties.length },
          requiresOperatorConfirmation: true,
        },
      ]
    : [];
  out.elapsedMs = Date.now() - started;
  out.budgetUsed = { maxToolCalls: 0, maxEvidenceItems: out.evidence.length };
  return out;
}

/** Isolation guard used by the Orchestrator and by tests. */
export function evidenceLeaksAccount(evidence: WorkerEvidenceRef[], accountId?: string): boolean {
  if (!accountId) return false;
  return evidence.some((e) => e.accountId && e.accountId !== accountId);
}
