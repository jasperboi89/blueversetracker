/**
 * Phase 9 — claim validation against canonical references (§39).
 *
 * A worker claim that cites a forecast id, simulation run, hypothesis id or
 * anomaly id must cite one that EXISTS and belongs to the account in scope.
 * Hallucinated canonical ids are rejected before assembly, not explained away.
 */

import type { CanonicalSnapshot } from "./canonical-sources";
import type { EvidenceKind, WorkerEvidenceRef, WorkerOutput } from "./worker-contract";

export interface ClaimValidationIssue {
  claimId: string;
  ref: WorkerEvidenceRef;
  code: "UNKNOWN_REFERENCE" | "WRONG_ACCOUNT" | "FUTURE_EVIDENCE";
}

export interface ClaimValidationResult {
  output: WorkerOutput;
  issues: ClaimValidationIssue[];
}

function idIndex(snapshot: CanonicalSnapshot): Map<EvidenceKind, Set<string>> {
  const m = new Map<EvidenceKind, Set<string>>();
  const put = (kind: EvidenceKind, ids: string[]) => m.set(kind, new Set(ids));
  put("investigation", snapshot.investigations.map((x) => x.id));
  put("hypothesis", snapshot.investigations.flatMap((i) => i.hypotheses.map((h) => h.id)));
  put("discriminating_test", snapshot.investigations.flatMap((i) => i.preparedTests.map((t) => t.id)));
  put("anomaly", snapshot.anomalies.map((x) => x.id));
  put("forecast", snapshot.forecasts.map((x) => x.id));
  put("comparable_state", snapshot.comparableStates.map((x) => x.id));
  put("simulation", snapshot.simulations.map((x) => x.id));
  put("script_structure", snapshot.scriptStructures.map((x) => x.id));
  put("pattern", snapshot.patterns.map((x) => x.id));
  put("resolution", snapshot.resolutions.map((x) => x.id));
  put("knowledge_note", snapshot.knowledgeNotes.map((x) => x.id));
  put("completed_work", snapshot.completedWork.map((x) => x.id));
  put("change_record", snapshot.changeRecords.map((x) => x.id));
  put("ledger_event", snapshot.ledgerEvents.map((x) => x.id));
  return m;
}

/**
 * Drop claims that reference non-existent, out-of-account or post-boundary
 * canonical records; report what was dropped.
 */
export function validateClaims(
  output: WorkerOutput,
  snapshot: CanonicalSnapshot,
  opts: { accountId?: string; asOf?: string } = {},
): ClaimValidationResult {
  const index = idIndex(snapshot);
  const issues: ClaimValidationIssue[] = [];

  const badRef = (claimId: string, ref: WorkerEvidenceRef): boolean => {
    const known = index.get(ref.kind);
    if (!known || !known.has(ref.id)) {
      issues.push({ claimId, ref, code: "UNKNOWN_REFERENCE" });
      return true;
    }
    if (opts.accountId && ref.accountId && ref.accountId !== opts.accountId) {
      issues.push({ claimId, ref, code: "WRONG_ACCOUNT" });
      return true;
    }
    if (opts.asOf && ref.at && ref.at > opts.asOf) {
      issues.push({ claimId, ref, code: "FUTURE_EVIDENCE" });
      return true;
    }
    return false;
  };

  const claims = output.claims.filter((c) => !c.evidence.some((ref) => badRef(c.id, ref)));
  const evidence = output.evidence.filter((ref) => !badRef("evidence", ref));

  if (!issues.length) return { output, issues };

  return {
    output: {
      ...output,
      claims,
      evidence,
      notes: [...output.notes, `${issues.length} unverifiable canonical reference(s) were rejected.`],
      uncertainties: Array.from(
        new Set([...output.uncertainties, "Some referenced records could not be verified and were dropped."]),
      ),
    },
    issues,
  };
}
