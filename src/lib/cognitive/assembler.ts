/**
 * Phase 9 — response assembly.
 *
 * The operator gets ONE answer, not a panel transcript. Worker identity shows
 * up only as provenance ("Analysis used: …"). Disagreement is preserved rather
 * than averaged away, and governance limits are stated plainly.
 */

import {
  type AssembledResponse,
  type CriticResult,
  type GuardianResult,
  type WorkerEvidenceRef,
  type WorkerOutput,
} from "./worker-contract";
import { getWorker } from "./worker-registry";

export interface AssembleInput {
  intent: string;
  contributions: WorkerOutput[];
  critiques: CriticResult[];
  guardian?: GuardianResult;
  /** Directive: show the evidence, skip the narrative. */
  evidenceOnly?: boolean;
  /** Sources that could not be read this run. */
  unavailableNotes: string[];
  refusedDirectives: string[];
}

export function assembleResponse(input: AssembleInput): AssembledResponse {
  const contributed = input.contributions.filter((c) => c.status === "contributed");
  const degraded = input.contributions.filter((c) =>
    ["unavailable", "budget_exhausted", "failed", "capability_blocked"].includes(c.status),
  );
  const insufficient = input.contributions.filter(
    (c) => c.status === "insufficient_evidence" || c.status === "unknown",
  );

  const disagreements = detectDisagreements(contributed);
  const evidence = dedupeEvidence(contributed.flatMap((c) => c.evidence));
  const uncertainties = unique([
    ...contributed.flatMap((c) => c.uncertainties),
    ...input.unavailableNotes,
    ...input.refusedDirectives,
    ...(input.critiques.some((c) => c.status === "unavailable")
      ? ["Independent critique was unavailable, so these findings were not challenged."]
      : []),
  ]);
  const recommendations = unique(contributed.flatMap((c) => c.recommendations));
  const analysisUsed = input.contributions.map((c) => `${getWorker(c.workerId).role} (${statusLabel(c)})`);
  if (input.critiques.some((c) => c.status === "reviewed")) analysisUsed.push("Critique review");
  if (input.guardian?.available) analysisUsed.push("Governance review");

  const guardianBlocked =
    input.guardian && (input.guardian.decision === "BLOCK" || input.guardian.decision === "INSUFFICIENT_AUTHORITY");

  let status: AssembledResponse["status"];
  if (guardianBlocked) status = "blocked";
  else if (!contributed.length && insufficient.length) status = "insufficient_evidence";
  else if (!contributed.length) status = "partial";
  else if (degraded.length || insufficient.length) status = "partial";
  else status = "answered";

  const answer = input.evidenceOnly
    ? evidenceOnlyAnswer(evidence, contributed)
    : buildAnswer({ contributed, insufficient, degraded, disagreements, status, guardian: input.guardian });

  return {
    answer,
    evidence,
    uncertainties,
    disagreements,
    recommendations: input.evidenceOnly ? [] : recommendations,
    ...(input.guardian && input.guardian.decision !== "ALLOW"
      ? { governanceNote: input.guardian.explanation }
      : {}),
    analysisUsed: unique(analysisUsed),
    multiplePlausibleExplanations: countExplanations(contributed) > 1,
    status,
  };
}

function buildAnswer(args: {
  contributed: WorkerOutput[];
  insufficient: WorkerOutput[];
  degraded: WorkerOutput[];
  disagreements: string[];
  status: AssembledResponse["status"];
  guardian?: GuardianResult;
}): string {
  const parts: string[] = [];

  if (args.status === "blocked" && args.guardian) {
    parts.push(args.guardian.explanation);
  }

  if (args.contributed.length) {
    parts.push(args.contributed.map((c) => c.summary).join(" "));
  } else if (args.insufficient.length) {
    parts.push(
      "There isn't enough recorded evidence to answer this yet — that's a state, not a conclusion, and it will change as more work is logged.",
    );
  }

  if (args.disagreements.length) {
    parts.push(`These do not agree: ${args.disagreements.join(" ")}`);
  }

  if (args.degraded.length) {
    parts.push(
      `Partial analysis: ${args.degraded.map((d) => getWorker(d.workerId).role.toLowerCase()).join(", ")} could not run, so this answer is incomplete.`,
    );
  }

  return parts.filter(Boolean).join("\n\n");
}

function evidenceOnlyAnswer(evidence: WorkerEvidenceRef[], contributed: WorkerOutput[]): string {
  if (!evidence.length) return "No canonical evidence is recorded for this question.";
  const lines = evidence.map((e) => `- ${e.kind}: ${e.label ?? e.id}${e.at ? ` (${e.at})` : ""}`);
  const contradictions = contributed.flatMap((c) => c.contradictions);
  return [
    "Evidence only, no synthesis:",
    ...lines,
    ...(contradictions.length ? ["", "Contradicting evidence:", ...contradictions.map((c) => `- ${c}`)] : []),
  ].join("\n");
}

/**
 * Disagreement detection (§17, §37). Two grounded contributions that point in
 * different directions stay visible as a disagreement.
 */
export function detectDisagreements(contributions: WorkerOutput[]): string[] {
  const out: string[] = [];
  const by = (id: string) => contributions.find((c) => c.workerId === id);

  const sim = by("simulator");
  const res = by("researcher");
  if (sim && res && sim.claims.length && res.claims.some((c) => c.type === "historical_precedent")) {
    out.push(
      "Documented history and the current script structure describe different behaviour; the structure is authoritative for what the script does now, the history is authoritative for what was recorded.",
    );
  }

  const inv = by("investigator");
  const fc = by("forecaster");
  if (inv && fc && inv.contradictions.length && fc.claims.length) {
    out.push(
      "The investigation still holds unresolved contradictions while the outlook is based on comparable past states; treat the outlook as context, not confirmation.",
    );
  }

  for (const c of contributions) out.push(...c.contradictions);
  return unique(out);
}

function countExplanations(contributions: WorkerOutput[]): number {
  return contributions.reduce((n, c) => n + c.claims.filter((x) => x.type === "inference").length, 0);
}

function statusLabel(c: WorkerOutput): string {
  switch (c.status) {
    case "contributed":
      return "contributed";
    case "insufficient_evidence":
      return "insufficient evidence";
    case "not_applicable":
      return "not applicable";
    case "capability_blocked":
      return "blocked";
    case "budget_exhausted":
      return "stopped at budget";
    case "unavailable":
      return "unavailable";
    case "failed":
      return "failed";
    default:
      return "no finding";
  }
}

function dedupeEvidence(refs: WorkerEvidenceRef[]): WorkerEvidenceRef[] {
  const seen = new Set<string>();
  const out: WorkerEvidenceRef[] = [];
  for (const r of refs) {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list.filter(Boolean)));
}
