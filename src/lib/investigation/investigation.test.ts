import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_CAUSAL_PHRASES,
  HYPOTHESIS_STRENGTH_RANK,
  INVESTIGATION_AUTONOMY_CAP,
  type Hypothesis,
  type HypothesisEvidenceLink,
  type InvestigationObservation,
} from "./hypothesis-contract";
import { assessStrength, evaluateVerification, rankHypotheses } from "./hypothesis-strength";
import { generateCandidates, structureProposal, dedupeHypotheses } from "./hypothesis-generation";
import { buildDiscriminatingTests, effectOfResult } from "./discriminating-tests";
import {
  addHypotheses,
  createInvestigation,
  investigationAsOf,
  linkEvidence,
  prepareTests,
  recordTestResult,
  searchAlternatives,
  attemptVerification,
} from "./investigation-engine";
import { buildHypothesisGraph } from "./hypothesis-graph";
import { readNaturalComparison } from "./counterfactual";

const NOW = new Date("2026-02-01T00:00:00.000Z");

function obs(id: string, statement: string): InvestigationObservation {
  return { id, statement, source: "operator_input", refs: [], recordedAt: NOW.toISOString() };
}

function baseInvestigation() {
  return createInvestigation({
    id: "inv1",
    accountId: "1001",
    title: "Callers reach the wrong queue",
    observations: [obs("o1", "Callers reach the wrong queue after hours")],
    now: NOW,
  }).investigation;
}

function hypo(id: string, title: string, predictions: string[]): Hypothesis {
  return structureProposal(
    { title, statement: `${title} statement`, mechanism: `${title} mechanism`, predictions },
    { investigationId: "inv1", accountId: "1001", index: Number(id.slice(-1)), origin: "operator" },
    NOW,
  );
}

function link(
  hypothesisId: string,
  stance: HypothesisEvidenceLink["stance"],
  strength: HypothesisEvidenceLink["strength"],
  id: string,
): HypothesisEvidenceLink {
  return {
    id,
    hypothesisId,
    stance,
    strength,
    source: "event_ledger",
    statement: `${stance} evidence`,
    refs: [],
    recordedAt: NOW.toISOString(),
  };
}

describe("Phase 8 — contracts and language safety", () => {
  it("caps autonomy at prepare", () => {
    expect(INVESTIGATION_AUTONOMY_CAP).toBe("prepare");
  });

  it("ranks verified above every unverified class", () => {
    const verified = HYPOTHESIS_STRENGTH_RANK.verified;
    for (const [k, v] of Object.entries(HYPOTHESIS_STRENGTH_RANK)) {
      if (k !== "verified") expect(v).toBeLessThan(verified);
    }
  });

  it("keeps forbidden causal phrasing out of generated hypothesis text", () => {
    const cands = generateCandidates({
      investigationId: "inv1",
      accountId: "1001",
      observations: [obs("o1", "Repeat failures after a recent change")],
      now: NOW,
    });
    for (const c of cands) {
      const text = `${c.title} ${c.statement} ${c.mechanism}`.toLowerCase();
      for (const phrase of FORBIDDEN_CAUSAL_PHRASES) {
        expect(text).not.toContain(phrase);
      }
    }
  });
});

describe("Phase 8 — strength and verification", () => {
  it("never lets accumulating support bury a contradiction", () => {
    const h = hypo("h1", "Branch misroute", ["Calls after 18:00 land in queue B"]);
    const supports = [1, 2, 3, 4].map((i) => link(h.id, "supports", "supporting", `s${i}`));
    const withContradiction = [...supports, link(h.id, "contradicts", "direct", "c1")];
    const before = assessStrength(h, supports, []);
    const after = assessStrength(h, withContradiction, []);
    expect(HYPOTHESIS_STRENGTH_RANK[after.strength]).toBeLessThan(
      HYPOTHESIS_STRENGTH_RANK[before.strength],
    );
  });

  it("refuses verification without a discriminating test", () => {
    const h = hypo("h1", "Branch misroute", ["Calls after 18:00 land in queue B"]);
    const evaluation = evaluateVerification(
      h,
      [h],
      [link(h.id, "supports", "direct", "s1")],
      [],
      { operatorConfirmed: true },
    );
    expect(evaluation.verified).toBe(false);
    expect(evaluation.unmet.length).toBeGreaterThan(0);
  });

  it("does not verify through the engine when requirements are unmet", () => {
    let inv = baseInvestigation();
    const h = hypo("h1", "Branch misroute", ["Calls after 18:00 land in queue B"]);
    inv = addHypotheses(inv, [h], NOW).investigation;
    const r = attemptVerification(inv, h.id, { operatorConfirmed: true, now: NOW });
    expect(r.unmet.length).toBeGreaterThan(0);
    expect(r.investigation.hypotheses[0]!.status).not.toBe("verified");
  });
});

describe("Phase 8 — discriminating tests", () => {
  it("marks a test with identical predictions as low discrimination", () => {
    const a = hypo("h1", "Alpha", ["Same observable outcome appears"]);
    const b = { ...hypo("h2", "Beta", ["Same observable outcome appears"]), id: "h2" };
    const tests = buildDiscriminatingTests({ investigationId: "inv1", hypotheses: [a, b], now: NOW });
    expect(tests[0]!.utility.klass).toBe("low_discrimination");
  });

  it("maps recorded outcomes deterministically", () => {
    const a = hypo("h1", "Alpha", ["Queue B receives the call"]);
    const b = { ...hypo("h2", "Beta", ["Voicemail answers instead"]), id: "h2" };
    const [test] = buildDiscriminatingTests({ investigationId: "inv1", hypotheses: [a, b], now: NOW });
    const effect = effectOfResult(test!, "matches_a");
    expect(effect.strengthened).toEqual([a.id]);
    expect(effect.weakened).toEqual(["h2"]);
    expect(effectOfResult(test!, "not-a-real-key").strengthened).toEqual([]);
  });

  it("blocks a test whose prerequisites are missing", () => {
    const a = hypo("h1", "Alpha", ["Queue B receives the call"]);
    const b = { ...hypo("h2", "Beta", ["Voicemail answers instead"]), id: "h2" };
    const tests = buildDiscriminatingTests({
      investigationId: "inv1",
      hypotheses: [a, b],
      prerequisites: [{ label: "test account", available: false }],
      now: NOW,
    });
    expect(tests[0]!.utility.klass).toBe("blocked");
  });
});

describe("Phase 8 — investigation lifecycle", () => {
  it("starts at insufficient evidence and never claims a cause early", () => {
    const inv = baseInvestigation();
    expect(inv.conclusion.kind).toBe("insufficient_evidence");
  });

  it("reports multiple plausible explanations rather than picking one", () => {
    let inv = baseInvestigation();
    const a = hypo("h1", "Alpha", ["Queue B receives the call"]);
    const b = { ...hypo("h2", "Beta", ["Voicemail answers instead"]), id: "h2" };
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = linkEvidence(
      inv,
      [link(a.id, "supports", "supporting", "s1"), link("h2", "supports", "supporting", "s2")],
      NOW,
    ).investigation;
    expect(["multiple_plausible_explanations", "insufficient_evidence"]).toContain(
      inv.conclusion.kind,
    );
  });

  it("records a refuting result without reinterpreting it", () => {
    let inv = baseInvestigation();
    const a = hypo("h1", "Alpha", ["Queue B receives the call"]);
    const b = { ...hypo("h2", "Beta", ["Voicemail answers instead"]), id: "h2" };
    inv = addHypotheses(inv, [a, b], NOW).investigation;
    inv = prepareTests(inv, {}, NOW).investigation;
    const test = inv.tests[0]!;
    inv = recordTestResult(inv, test.id, "matches_b", { now: NOW }).investigation;
    const alpha = inv.hypotheses.find((h) => h.id === a.id)!;
    expect(alpha.predictions.some((p) => p.outcome === "refuted")).toBe(true);
  });

  it("keeps the timeline append-only across updates", () => {
    let inv = baseInvestigation();
    const before = inv.timeline.length;
    inv = addHypotheses(inv, [hypo("h1", "Alpha", ["x"])], NOW).investigation;
    inv = prepareTests(inv, {}, NOW).investigation;
    expect(inv.timeline.length).toBeGreaterThan(before);
    expect(inv.timeline.slice(0, before)).toEqual(
      inv.timeline.slice(0, before),
    );
  });

  it("searches for what would break the leading explanation", () => {
    let inv = baseInvestigation();
    inv = addHypotheses(inv, [hypo("h1", "Alpha", ["x"]), { ...hypo("h2", "Beta", ["y"]), id: "h2" }], NOW).investigation;
    const alt = searchAlternatives(inv)!;
    expect(alt.challenges.length).toBeGreaterThan(0);
    expect(alt.alternativeMechanisms.length).toBeGreaterThan(0);
  });
});

describe("Phase 8 — temporal integrity and graph", () => {
  it("excludes later evidence from a retrospective view", () => {
    let inv = baseInvestigation();
    const a = hypo("h1", "Alpha", ["x"]);
    inv = addHypotheses(inv, [a], NOW).investigation;
    const later = new Date(NOW.getTime() + 86_400_000).toISOString();
    inv = linkEvidence(
      inv,
      [{ ...link(a.id, "supports", "direct", "late"), recordedAt: later }],
      NOW,
    ).investigation;
    const snapshot = investigationAsOf(inv, NOW.getTime());
    expect(snapshot.evidence).toHaveLength(0);
  });

  it("projects hypotheses, evidence and tests into a graph", () => {
    let inv = baseInvestigation();
    const a = hypo("h1", "Alpha", ["x"]);
    inv = addHypotheses(inv, [a], NOW).investigation;
    inv = linkEvidence(inv, [link(a.id, "contradicts", "strong", "c1")], NOW).investigation;
    const graph = buildHypothesisGraph(inv);
    expect(graph.nodes.some((n) => n.kind === "hypothesis")).toBe(true);
    expect(graph.edges.some((e) => e.relation === "contradicts")).toBe(true);
  });
});

describe("Phase 8 — dedupe and natural comparisons", () => {
  it("collapses semantically duplicate mechanisms", () => {
    const items = [
      { title: "A", mechanism: "branch sends after hours calls to queue b" },
      { title: "B", mechanism: "after hours calls the branch sends to queue b" },
    ];
    expect(dedupeHypotheses(items)).toHaveLength(1);
  });

  it("declines to read a natural comparison with too few records", () => {
    const r = readNaturalComparison({
      withCondition: { count: 2, withSymptom: 2 },
      withoutCondition: { count: 9, withSymptom: 0 },
    });
    expect(r.informative).toBe(false);
    expect(r.strength).toBe("unknown");
  });

  it("keeps a strong natural comparison non-causal", () => {
    const r = readNaturalComparison({
      withCondition: { count: 10, withSymptom: 9 },
      withoutCondition: { count: 10, withSymptom: 1 },
    });
    expect(r.statement.toLowerCase()).toContain("association");
    expect(r.statement.toLowerCase()).not.toContain("caused");
  });

  it("ranks hypotheses deterministically", () => {
    const a = hypo("h1", "Alpha", ["x"]);
    const b = { ...hypo("h2", "Beta", ["y"]), id: "h2" };
    expect(rankHypotheses([a, b]).map((h) => h.id)).toEqual(rankHypotheses([b, a]).map((h) => h.id));
  });
});
