/**
 * Phase 8.5 — Causal Reasoning Integrity & Investigation Verification Gate.
 *
 * These tests attack the causal engine rather than exercise it. Every case here
 * corresponds to a gate requirement: correlation must not become causation,
 * ranking must not become verification, prepared test meaning must not be
 * reinterpreted after the fact, counterexamples must bite, verified readings
 * must remain challengeable, and history must never be rewritten.
 */

import { describe, expect, it } from "vitest";
import {
  INVESTIGATION_AUTONOMY_CAP,
  containsForbiddenCausalClaim,
  type Hypothesis,
  type HypothesisEvidenceLink,
  type Investigation,
  type InvestigationObservation,
} from "./hypothesis-contract";
import { assessStrength, evaluateVerification, rankHypotheses } from "./hypothesis-strength";
import { structureProposal, generateCandidates, dedupeHypotheses } from "./hypothesis-generation";
import { effectOfResult } from "./discriminating-tests";
import {
  addHypotheses,
  createInvestigation,
  investigationAsOf,
  linkEvidence,
  prepareTests,
  recordTestResult,
  recomputeInvestigation,
  searchAlternatives,
  attemptVerification,
} from "./investigation-engine";

const NOW = new Date("2026-03-01T00:00:00.000Z");
const LATER = new Date("2026-03-02T00:00:00.000Z");

function obs(id: string, statement: string): InvestigationObservation {
  return { id, statement, source: "operator_input", refs: [], recordedAt: NOW.toISOString() };
}

function baseInvestigation(): Investigation {
  return createInvestigation({
    id: "inv-gate",
    accountId: "2002",
    title: "Dispatch reaches the wrong destination",
    observations: [obs("o1", "Dispatch reaches the wrong destination after back navigation")],
    now: NOW,
  }).investigation;
}

function hypo(index: number, title: string, predictions: string[]): Hypothesis {
  return structureProposal(
    {
      title,
      statement: `${title} statement`,
      mechanism: `${title} mechanism described in enough structural detail to be testable`,
      predictions,
    },
    { investigationId: "inv-gate", accountId: "2002", index, origin: "operator" },
    NOW,
  );
}

function link(
  hypothesisId: string,
  stance: HypothesisEvidenceLink["stance"],
  strength: HypothesisEvidenceLink["strength"],
  id: string,
  extra: Partial<HypothesisEvidenceLink> = {},
): HypothesisEvidenceLink {
  return {
    id,
    hypothesisId,
    stance,
    strength,
    source: "event_ledger",
    statement: `${stance} evidence ${id}`,
    refs: [],
    recordedAt: NOW.toISOString(),
    ...extra,
  };
}

/** Drive a hypothesis all the way to a legitimate VERIFIED state. */
function verifiedFixture(): { inv: Investigation; hId: string } {
  let inv = baseInvestigation();
  const a: Hypothesis = {
    ...hypo(1, "Field cleared during back navigation", ["back navigation clears the field"]),
    hypothesisType: "data_state",
  };
  const b = hypo(2, "Downstream overwrite of destination", ["destination overwritten later"]);
  inv = addHypotheses(inv, [a, b], NOW).investigation;
  inv = linkEvidence(
    inv,
    [
      link(a.id, "supports", "direct", "e1"),
      link(a.id, "supports", "strong", "e2"),
      link(b.id, "contradicts", "direct", "e3"),
    ],
    NOW,
  ).investigation;
  inv = prepareTests(inv, {}, NOW).investigation;
  const test = inv.tests.find((t) => t.outcomes.some((o) => o.strengthens.includes(a.id)));
  expect(test).toBeTruthy();
  const key = test!.outcomes.find((o) => o.strengthens.includes(a.id))!.key;
  inv = recordTestResult(inv, test!.id, key, { now: NOW }).investigation;
  const attempt = attemptVerification(inv, a.id, { operatorConfirmed: true, now: NOW });
  return { inv: attempt.investigation, hId: a.id };
}

/* ------------------------------------------------------------------ */
/* Parts 4, 5, 6 — the hard causal boundary                             */
/* ------------------------------------------------------------------ */

describe("Phase 8.5 — causal boundary", () => {
  it("never promotes the highest-ranked hypothesis to verified", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Stale state source", ["stale value read"]);
    const b = hypo(2, "Routing rule mismatch", ["routing rule differs"]);
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = linkEvidence(
      inv,
      [
        link(a.id, "supports", "direct", "s1"),
        link(a.id, "supports", "direct", "s2"),
        link(a.id, "supports", "strong", "s3"),
        link(a.id, "supports", "strong", "s4"),
        link(b.id, "supports", "weak", "s5"),
      ],
      NOW,
    ).investigation;
    const lead = rankHypotheses(inv.hypotheses)[0]!;
    expect(lead.id).toBe(a.id);
    expect(lead.strength).not.toBe("verified");
    expect(lead.status).not.toBe("verified");
    expect(inv.conclusion.kind).not.toBe("cause_verified");
  });

  it("does not verify on historical correlation alone, however frequent", () => {
    const h = hypo(1, "Change preceded incident", ["incident follows change"]);
    const links = Array.from({ length: 25 }, (_, i) =>
      link(h.id, "supports", "supporting", `c${i}`, { source: "event_ledger" }),
    );
    const a = assessStrength(h, links, []);
    expect(a.strength).not.toBe("verified");
    const v = evaluateVerification({ ...h, strength: a.strength }, [h], links, []);
    expect(v.verified).toBe(false);
    expect(v.unmet.join(" ")).toMatch(/discriminating test/i);
  });

  it("treats simulation structural support as non-verifying on its own", () => {
    const h = hypo(1, "Script path clears the field", ["simulated path clears field"]);
    const sim = link(h.id, "supports", "direct", "sim1", { source: "simulation" });
    const v = evaluateVerification(
      { ...h, hypothesisType: "configuration_script_path" },
      [h],
      [sim],
      [],
      { operatorConfirmed: true, structuralCoverage: 1 },
    );
    expect(v.verified).toBe(false);
  });

  it("ignores operator/AI confidence as a verification mechanism", () => {
    const h = hypo(1, "Confidently asserted explanation", ["something observable"]);
    const v = evaluateVerification(h, [h], [], [], { operatorConfirmed: true });
    expect(v.verified).toBe(false);
    // Operator confirmation is one requirement of many, never the whole rule.
    expect(v.requirements.filter((r) => !r.met).length).toBeGreaterThan(1);
  });

  it("rejects forbidden causal phrasing but allows explicit negation", () => {
    expect(containsForbiddenCausalClaim("The root cause is the routing rule.")).toBe(true);
    expect(containsForbiddenCausalClaim("This does not prove the change was involved.")).toBe(false);
    expect(containsForbiddenCausalClaim("Temporally associated with the change.")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Parts 10, 29, 30, 44 — test interpretation integrity                 */
/* ------------------------------------------------------------------ */

describe("Phase 8.5 — discriminating test integrity", () => {
  it("applies only the mapping fixed at preparation time", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Cleared during navigation", ["cleared on back"]);
    const b = hypo(2, "Overwritten downstream", ["overwritten after submit"]);
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = prepareTests(inv, {}, NOW).investigation;
    const t = inv.tests[0]!;
    const weakensA = t.outcomes.find((o) => o.weakens.includes(a.id))!;
    const effect = effectOfResult(t, weakensA.key);
    expect(effect.weakened).toContain(a.id);
    expect(effect.strengthened).not.toContain(a.id);
  });

  it("refuses post-hoc reinterpretation of a recorded result", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Cleared during navigation", ["cleared on back"]);
    const b = hypo(2, "Overwritten downstream", ["overwritten after submit"]);
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = prepareTests(inv, {}, NOW).investigation;
    const t = inv.tests[0]!;
    const weakensA = t.outcomes.find((o) => o.weakens.includes(a.id))!;
    inv = recordTestResult(inv, t.id, weakensA.key, { now: NOW }).investigation;
    const recorded = inv.tests.find((x) => x.id === t.id)!;
    expect(recorded.result?.outcomeKey).toBe(weakensA.key);

    // Attempt 1: re-record the opposite branch so the preferred hypothesis wins.
    const strengthensA = t.outcomes.find((o) => o.strengthens.includes(a.id))!;
    const after = recordTestResult(inv, t.id, strengthensA.key, { now: LATER }).investigation;
    expect(after.tests.find((x) => x.id === t.id)?.result?.outcomeKey).toBe(weakensA.key);
    expect(after).toBe(inv);

    // Attempt 2: re-preparing tests must not discard or rewrite the recording.
    const reprepared = prepareTests(inv, {}, LATER).investigation;
    const still = reprepared.tests.find((x) => x.id === t.id)!;
    expect(still.status).toBe("recorded");
    expect(still.result?.outcomeKey).toBe(weakensA.key);
    expect(still.outcomes).toEqual(t.outcomes);
  });

  it("ignores an unknown outcome key rather than interpreting it", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Cleared during navigation", ["cleared on back"]);
    const b = hypo(2, "Overwritten downstream", ["overwritten after submit"]);
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = prepareTests(inv, {}, NOW).investigation;
    const t = inv.tests[0]!;
    expect(effectOfResult(t, "whatever_favours_my_theory")).toEqual({
      strengthened: [],
      weakened: [],
      predictionOutcomes: [],
    });
  });

  it("rejects a result addressed to a test that is not in this investigation", () => {
    let inv = baseInvestigation();
    inv = addHypotheses(inv, [hypo(1, "Only theory", ["something"])], NOW).investigation;
    inv = prepareTests(inv, {}, NOW).investigation;
    const before = inv;
    const after = recordTestResult(inv, "some-other-investigation:t1", "held", { now: NOW });
    expect(after.investigation).toBe(before);
    expect(after.entries).toEqual([]);
  });

  it("marks a test with unavailable prerequisites as blocked, not runnable", () => {
    let inv = baseInvestigation();
    inv = addHypotheses(
      inv,
      [hypo(1, "A theory", ["a signal"]), hypo(2, "B theory", ["b signal"])],
      NOW,
    ).investigation;
    inv = prepareTests(
      inv,
      { prerequisites: [{ label: "Non-production test account", available: false }] },
      NOW,
    ).investigation;
    for (const t of inv.tests) {
      expect(t.utility.klass).toBe("blocked");
      expect(t.utility.missingPrerequisites.length).toBeGreaterThan(0);
      expect(t.safetyBoundary.toLowerCase()).toContain("production");
    }
  });

  it("never prepares a test that carries production risk", () => {
    let inv = baseInvestigation();
    inv = addHypotheses(
      inv,
      [hypo(1, "A theory", ["a signal"]), hypo(2, "B theory", ["b signal"])],
      NOW,
    ).investigation;
    inv = prepareTests(inv, {}, NOW).investigation;
    for (const t of inv.tests) {
      expect(t.utility.productionRisk).toBe("none");
      expect(t.utility.safety).toBe("safe");
      expect(t.utility.reversible).toBe(true);
      expect(t.status).toBe("prepared");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Parts 11–16 — contradictions, counterexamples, necessity/sufficiency */
/* ------------------------------------------------------------------ */

describe("Phase 8.5 — contradictions and counterexamples", () => {
  it("caps a heavily supported hypothesis when one direct contradiction exists", () => {
    const h = hypo(1, "Well supported theory", ["a signal"]);
    const many = Array.from({ length: 10 }, (_, i) => link(h.id, "supports", "strong", `s${i}`));
    const supported = assessStrength(h, many, []);
    expect(supported.strength).toBe("strongly_supported");
    const withContradiction = assessStrength(h, [...many, link(h.id, "contradicts", "direct", "x")], []);
    expect(withContradiction.strength).toBe("weak");
    expect(withContradiction.status).toBe("contradicted");
    expect(withContradiction.rationale.join(" ")).toMatch(/contradiction/i);
  });

  it("does not let a pile of weak support outweigh one direct contradiction", () => {
    const h = hypo(1, "Popular theory", ["a signal"]);
    const weak = Array.from({ length: 20 }, (_, i) => link(h.id, "supports", "weak", `w${i}`));
    const a = assessStrength(h, [...weak, link(h.id, "contradicts", "direct", "d")], []);
    expect(a.strength).toBe("weak");
  });

  it("counts counterexamples double and weakens materially", () => {
    const h = hypo(1, "A then B", ["b follows a"]);
    const support = Array.from({ length: 4 }, (_, i) => link(h.id, "supports", "supporting", `p${i}`));
    const before = assessStrength(h, support, []);
    const after = assessStrength(
      h,
      [
        ...support,
        link(h.id, "contradicts", "supporting", "ce1", { counterexample: true, source: "counterexample" }),
        link(h.id, "contradicts", "supporting", "ce2", { counterexample: true, source: "counterexample" }),
      ],
      [],
    );
    expect(after.counts.counterexamples).toBe(2);
    expect(
      ["insufficient", "weak", "plausible"].indexOf(after.strength),
    ).toBeGreaterThanOrEqual(0);
    expect(after.strength).not.toBe(before.strength);
  });

  it("retires a necessity claim when the symptom occurs without the mechanism", () => {
    let inv = baseInvestigation();
    const h = { ...hypo(1, "A is required for B", ["b needs a"]), relationClaim: "necessary_under_tested_conditions" as const };
    inv = addHypotheses(inv, [h], NOW).investigation;
    inv = linkEvidence(
      inv,
      [
        link(h.id, "contradicts", "strong", "bwa", {
          counterexample: true,
          source: "counterexample",
          statement: "Symptom B observed with no instance of A",
        }),
      ],
      NOW,
    ).investigation;
    const updated = inv.hypotheses.find((x) => x.id === h.id)!;
    expect(updated.relationClaim).toBe("associated");
    expect(updated.strengthRationale.join(" ")).toMatch(/necessity or sufficiency/i);
  });

  it("retires a sufficiency claim when the mechanism occurs without the symptom", () => {
    let inv = baseInvestigation();
    const h = { ...hypo(1, "A alone produces B", ["a yields b"]), relationClaim: "sufficient_under_tested_conditions" as const };
    inv = addHypotheses(inv, [h], NOW).investigation;
    inv = linkEvidence(
      inv,
      [
        link(h.id, "contradicts", "strong", "awb", {
          counterexample: true,
          source: "counterexample",
          statement: "A present in many runs with no B",
        }),
      ],
      NOW,
    ).investigation;
    expect(inv.hypotheses[0]!.relationClaim).toBe("associated");
  });

  it("records a refuted prediction as a weakening, without inventing an excuse", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Cleared during navigation", ["cleared on back"]);
    const b = hypo(2, "Overwritten downstream", ["overwritten after submit"]);
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = prepareTests(inv, {}, NOW).investigation;
    const t = inv.tests[0]!;
    const weakensA = t.outcomes.find((o) => o.weakens.includes(a.id))!;
    inv = recordTestResult(inv, t.id, weakensA.key, { now: NOW }).investigation;
    const updated = inv.hypotheses.find((x) => x.id === a.id)!;
    expect(updated.predictions.some((p) => p.outcome === "refuted")).toBe(true);
    expect(["weak", "insufficient"]).toContain(updated.strength);
    expect(inv.timeline.some((e) => e.kind === "hypothesis_weakened" && e.hypothesisId === a.id)).toBe(true);
  });

  it("keeps ambiguous evidence unresolved instead of counting it as support", () => {
    const h = hypo(1, "Ambiguous theory", ["a signal"]);
    const a = assessStrength(h, [link(h.id, "unresolved", "unknown", "u1"), link(h.id, "unresolved", "weak", "u2")], []);
    expect(a.counts.unresolved).toBe(2);
    expect(a.counts.supports).toBe(0);
    expect(a.strength).toBe("insufficient");
  });
});

/* ------------------------------------------------------------------ */
/* Parts 17, 18, 19 — alternatives, no-answer, generation bounds        */
/* ------------------------------------------------------------------ */

describe("Phase 8.5 — alternatives and honest emptiness", () => {
  it("challenges the leading hypothesis rather than building its case", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Cleared during navigation", ["cleared on back"]);
    const b = hypo(2, "Downstream overwrite", ["overwritten after submit"]);
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = linkEvidence(inv, [link(a.id, "supports", "direct", "s1")], NOW).investigation;
    const alt = searchAlternatives(inv)!;
    expect(alt.hypothesisId).toBe(a.id);
    expect(alt.challenges.length).toBeGreaterThanOrEqual(3);
    expect(alt.alternativeMechanisms.length).toBeGreaterThan(0);
  });

  it("collapses semantically duplicate mechanisms", () => {
    const a = hypo(1, "RegDr is wrong", ["regdr wrong"]);
    const b = structureProposal(
      { title: "RegDr is incorrect", statement: "RegDr is wrong", mechanism: a.mechanism, predictions: ["regdr wrong"] },
      { investigationId: "inv-gate", accountId: "2002", index: 2, origin: "ai_proposed" },
      NOW,
    );
    expect(dedupeHypotheses([a, b]).length).toBe(1);
  });

  it("bounds candidate generation", () => {
    const observations = Array.from({ length: 30 }, (_, i) =>
      obs(`o${i}`, `Repeat failure ${i} after a recent change to routing and script paths`),
    );
    const cands = generateCandidates({ investigationId: "inv-gate", accountId: "2002", observations, now: NOW });
    expect(cands.length).toBeLessThanOrEqual(8);
  });

  it("reports no supported explanation instead of manufacturing a culprit", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Theory one", ["signal one"]);
    const b = hypo(2, "Theory two", ["signal two"]);
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = linkEvidence(
      inv,
      [link(a.id, "unresolved", "unknown", "u1"), link(b.id, "contradicts", "strong", "x1")],
      NOW,
    ).investigation;
    expect(inv.conclusion.kind).toBe("insufficient_evidence");
    expect(inv.conclusion.summary.toLowerCase()).toContain("no supported causal explanation");
    expect(containsForbiddenCausalClaim(inv.conclusion.summary)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Parts 31–35 — temporal integrity, versioning, verified revocation    */
/* ------------------------------------------------------------------ */

describe("Phase 8.5 — history, versioning and revocation", () => {
  it("excludes later evidence and results from an as-of evaluation", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Cleared during navigation", ["cleared on back"]);
    const b = hypo(2, "Downstream overwrite", ["overwritten after submit"]);
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = prepareTests(inv, {}, NOW).investigation;
    const t = inv.tests[0]!;
    const key = t.outcomes.find((o) => o.strengthens.includes(a.id))!.key;
    inv = recordTestResult(inv, t.id, key, { now: LATER }).investigation;
    inv = linkEvidence(
      inv,
      [link(a.id, "supports", "direct", "future", { recordedAt: LATER.toISOString() })],
      LATER,
    ).investigation;

    const asOf = investigationAsOf(inv, NOW.getTime());
    expect(asOf.evidence.some((e) => e.id === "future")).toBe(false);
    expect(asOf.tests.find((x) => x.id === t.id)?.result).toBeUndefined();
    expect(asOf.hypotheses.find((h) => h.id === a.id)!.predictions.every((p) => p.outcome === "unobserved")).toBe(true);
    // The retrospective view is a derivation — the stored record keeps its history.
    expect(inv.tests.find((x) => x.id === t.id)?.result).toBeTruthy();
    expect(inv.timeline.length).toBeGreaterThan(asOf.timeline.length);
  });

  it("appends to the timeline and never rewrites earlier entries", () => {
    let inv = baseInvestigation();
    const before = [...inv.timeline];
    const a = hypo(1, "Theory one", ["signal one"]);
    inv = addHypotheses(inv, [a], NOW).investigation;
    inv = linkEvidence(inv, [link(a.id, "supports", "direct", "s1")], LATER).investigation;
    expect(inv.timeline.slice(0, before.length)).toEqual(before);
    expect(inv.timeline.length).toBeGreaterThan(before.length);
  });

  it("increments the hypothesis version when the reading materially changes", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Theory one", ["signal one"]);
    inv = addHypotheses(inv, [a], NOW).investigation;
    const v0 = inv.hypotheses[0]!.hypothesisVersion;
    inv = linkEvidence(inv, [link(a.id, "supports", "direct", "s1"), link(a.id, "supports", "direct", "s2")], LATER).investigation;
    expect(inv.hypotheses[0]!.hypothesisVersion).toBeGreaterThan(v0);
  });

  it("verifies only when every canonical requirement is met", () => {
    const { inv, hId } = verifiedFixture();
    const h = inv.hypotheses.find((x) => x.id === hId)!;
    expect(h.status).toBe("verified");
    expect(h.verifiedAt).toBeTruthy();
    expect(inv.conclusion.kind).toBe("cause_verified");
  });

  it("fails verification when any single requirement is removed", () => {
    const { inv, hId } = verifiedFixture();
    const h = inv.hypotheses.find((x) => x.id === hId)!;
    const others = inv.hypotheses.filter((x) => x.id !== hId);

    // operator confirmation withheld
    expect(evaluateVerification(h, inv.hypotheses, inv.evidence, inv.tests, { operatorConfirmed: false }).verified).toBe(false);
    // no direct/strong support
    expect(
      evaluateVerification(h, inv.hypotheses, inv.evidence.filter((e) => e.hypothesisId !== hId), inv.tests, {
        operatorConfirmed: true,
      }).verified,
    ).toBe(false);
    // no recorded discriminating test
    expect(evaluateVerification(h, inv.hypotheses, inv.evidence, [], { operatorConfirmed: true }).verified).toBe(false);
    // a competitor still live
    const liveCompetitor = { ...others[0]!, status: "supported" as const };
    expect(
      evaluateVerification(h, [h, liveCompetitor], inv.evidence, inv.tests, { operatorConfirmed: true }).verified,
    ).toBe(false);
    // mechanism unspecified
    expect(
      evaluateVerification({ ...h, hypothesisType: "unknown" }, inv.hypotheses, inv.evidence, inv.tests, {
        operatorConfirmed: true,
      }).verified,
    ).toBe(false);
  });

  it("reopens a verified hypothesis when new contradictory evidence arrives, preserving history", () => {
    const { inv, hId } = verifiedFixture();
    const challenged = linkEvidence(
      inv,
      [
        link(hId, "contradicts", "direct", "new-contra", {
          recordedAt: LATER.toISOString(),
          statement: "The behaviour reproduced with the proposed mechanism disabled",
        }),
      ],
      LATER,
    ).investigation;
    const h = challenged.hypotheses.find((x) => x.id === hId)!;
    expect(h.status).not.toBe("verified");
    expect(h.verifiedAt).toBe(inv.hypotheses.find((x) => x.id === hId)!.verifiedAt);
    expect(h.verificationReopenedAt).toBeTruthy();
    expect(h.relationClaim).toBe("associated");
    expect(challenged.conclusion.kind).not.toBe("cause_verified");
    // History retained: the verification entry is still in the timeline.
    expect(challenged.timeline.some((e) => e.kind === "hypothesis_verified")).toBe(true);
    expect(challenged.timeline.some((e) => /REOPENED/.test(e.summary))).toBe(true);
  });

  it("leaves a verified hypothesis alone when no new contradiction arrives", () => {
    const { inv, hId } = verifiedFixture();
    const again = recomputeInvestigation(inv, LATER).investigation;
    const h = again.hypotheses.find((x) => x.id === hId)!;
    expect(h.status).toBe("verified");
    expect(h.verificationReopenedAt).toBeUndefined();
    expect(again.conclusion.kind).toBe("cause_verified");
  });
});

/* ------------------------------------------------------------------ */
/* Parts 43, 47, 48 — ledger, privacy, autonomy                         */
/* ------------------------------------------------------------------ */

describe("Phase 8.5 — privacy, ledger discipline and autonomy", () => {
  it("does not emit timeline churn when a recompute changes nothing", () => {
    let inv = baseInvestigation();
    inv = addHypotheses(inv, [hypo(1, "Theory one", ["signal one"])], NOW).investigation;
    const stable = recomputeInvestigation(inv, LATER);
    expect(stable.entries).toEqual([]);
    expect(stable.investigation.timeline.length).toBe(inv.timeline.length);
  });

  it("keeps every hypothesis and the investigation capped at prepare", () => {
    let inv = baseInvestigation();
    inv = addHypotheses(inv, [hypo(1, "Theory one", ["signal one"])], NOW).investigation;
    expect(inv.autonomy).toBe(INVESTIGATION_AUTONOMY_CAP);
    for (const h of inv.hypotheses) expect(h.autonomy).toBe(INVESTIGATION_AUTONOMY_CAP);
  });

  it("carries references rather than raw content in persisted structures", () => {
    let inv = baseInvestigation();
    const a = hypo(1, "Theory one", ["signal one"]);
    inv = addHypotheses(inv, [a], NOW).investigation;
    inv = linkEvidence(inv, [link(a.id, "supports", "direct", "s1")], NOW).investigation;
    const serialized = JSON.stringify(inv);
    for (const forbidden of ["password", "secret", "apiKey", "ssn", "chainOfThought"]) {
      expect(serialized).not.toContain(forbidden);
    }
    for (const e of inv.evidence) expect(e.statement.length).toBeLessThan(400);
  });
});
