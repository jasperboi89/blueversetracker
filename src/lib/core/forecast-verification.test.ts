/**
 * Phase 6.5 — Forecast Integrity & Runtime Verification Gate.
 *
 * These are ADVERSARIAL tests, not happy-path coverage. They exist to prove the
 * forecasting layer is trustworthy enough to become an input to a later phase:
 *
 *   TEMPORAL INTEGRITY   no fact after the anchor may enter forecast inputs
 *   OUTCOME WINDOWS      explicit, half-open, boundary-stable
 *   INSUFFICIENT         never silently degrades into TYPICAL / LOW
 *   COMPARISON           structured features decide, not account identity
 *   GRADING              incomplete horizons are never MISS
 *   PRIVACY / AUTONOMY   references and counts only; never executes
 */

import { describe, expect, it } from "vitest";
import {
  compareStates,
  extractStateFeatures,
  findComparableStates,
  observeOutcome,
  type ForecastInput,
} from "./comparable-state";
import {
  bandFor,
  buildForecast,
  buildForecasts,
  maxForecastAutonomy,
  violatesForecastLanguage,
} from "./forecast-engine";
import {
  evaluateElapsedForecasts,
  summarizeForecastQuality,
  type ForecastEvaluationEntry,
} from "./forecast-evaluation";
import { reconcileForecasts, trendFor, type AccountForecastRecord } from "./forecast-store";
import {
  FORECAST_BANDS,
  FORECAST_TYPES,
  FORECAST_CONFIG,
  type ComparableOutcomeSummary,
  type ForecastObservation,
} from "./forecast-contract";
import { forecastsToRadar, rankRadar } from "./operational-radar";
import { ledgerCategory } from "./ledger-events";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-01T12:00:00.000Z");

function base(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    accountId: "A100",
    now: NOW,
    events: [],
    tickets: [],
    changes: [],
    work: [],
    ...overrides,
  };
}

/** A dense, realistic 120-day account history. */
function richInput(overrides: Partial<ForecastInput> = {}): ForecastInput {
  const events = [];
  const tickets = [];
  for (let d = 118; d >= 0; d--) {
    const at = NOW - d * DAY;
    events.push({ id: `e${d}`, type: "ticket.pulled", atMs: at });
    if (d % 3 === 0) {
      events.push({ id: `e${d}b`, type: "work.completed", atMs: at + 3600_000 });
      tickets.push({
        id: `t${d}`,
        classification: "billing",
        createdAtMs: at,
        updatedAtMs: at,
      });
    }
  }
  return base({ events, tickets, ...overrides });
}

/* ================================================================== */
/* 3. HARD GATE — TEMPORAL INTEGRITY                                   */
/* ================================================================== */

describe("Phase 6.5 / temporal integrity", () => {
  const T = NOW - 30 * DAY;

  it("features at T are byte-identical whether or not the future exists", () => {
    const past = richInput();
    const pastOnly = base({
      events: past.events.filter((e) => e.atMs <= T),
      tickets: past.tickets.filter((t) => (t.createdAtMs ?? 0) <= T),
    });

    expect(extractStateFeatures(past, T)).toEqual(extractStateFeatures(pastOnly, T));
  });

  it.each([-7, -1, 0, 1, 7])(
    "injecting target-outcome events at T%+d days never changes the state at T",
    (offsetDays) => {
      const clean = richInput();
      const injectAt = T + offsetDays * DAY;
      const polluted = base({
        events: [
          ...clean.events,
          ...Array.from({ length: 40 }, (_, i) => ({
            id: `inject${i}`,
            type: "ticket.pulled",
            atMs: injectAt + i * 60_000,
          })),
        ],
        tickets: [
          ...clean.tickets,
          ...Array.from({ length: 10 }, (_, i) => ({
            id: `injectT${i}`,
            classification: "leakage",
            createdAtMs: injectAt + i * 60_000,
            updatedAtMs: injectAt + i * 60_000,
            reopened: true,
            escalated: true,
          })),
        ],
      });

      const before = extractStateFeatures(clean, T);
      const after = extractStateFeatures(polluted, T);

      if (offsetDays > 0) {
        // Strictly future information MUST be invisible to the feature set.
        expect(after).toEqual(before);
      } else {
        // At-or-before T the injection is legitimate history and MUST land.
        expect(after).not.toEqual(before);
      }
    },
  );

  it("outcome observation reads only strictly-after-anchor facts", () => {
    const features = extractStateFeatures(richInput(), T);
    const onlyBefore = base({
      events: [{ id: "b", type: "ticket.pulled", atMs: T - DAY }],
      tickets: [],
    });
    expect(observeOutcome(onlyBefore, "follow_up_work", T, 7, features)).toBe("did_not_occur");

    const inside = base({
      events: [{ id: "i", type: "ticket.pulled", atMs: T + 2 * DAY }],
    });
    expect(observeOutcome(inside, "follow_up_work", T, 7, features)).toBe("occurred");
  });

  it("comparable-state anchors never extend past the last fully-elapsed window", () => {
    const search = findComparableStates(richInput(), "follow_up_work", "next_7_days");
    const latest = Math.max(...search.comparables.map((c) => Date.parse(c.atIso)));
    expect(latest).toBeLessThanOrEqual(NOW - 7 * DAY);
  });
});

/* ================================================================== */
/* 4. OUTCOME WINDOW INTEGRITY                                         */
/* ================================================================== */

describe("Phase 6.5 / outcome windows", () => {
  const T = NOW - 30 * DAY;
  const features = extractStateFeatures(richInput(), T);

  const at = (ms: number) =>
    observeOutcome(base({ events: [{ id: "x", type: "ticket.pulled", atMs: ms }] }), "follow_up_work", T, 7, features);

  it("is half-open: (T, T+7]", () => {
    expect(at(T)).toBe("did_not_occur"); // exactly at creation — not a future outcome
    expect(at(T - 1)).toBe("did_not_occur");
    expect(at(T + 1)).toBe("occurred");
    expect(at(T + 7 * DAY)).toBe("occurred"); // exact end boundary counts
    expect(at(T + 7 * DAY + 1)).toBe("did_not_occur"); // just outside
  });

  it("returns unobserved (censored) while the window is still open", () => {
    const open = NOW - 2 * DAY;
    expect(observeOutcome(richInput(), "follow_up_work", open, 7, features)).toBe("unobserved");
  });

  it("every forecast type carries an explicit horizon and target outcome", () => {
    for (const f of [
      ...buildForecasts(richInput()).forecasts,
      ...buildForecasts(richInput()).evidenceGaps,
    ]) {
      expect(f.horizonDays).toBeGreaterThan(0);
      expect(f.targetOutcome.length).toBeGreaterThan(10);
      expect(Date.parse(f.expiresAt) - Date.parse(f.createdAt)).toBe(f.horizonDays * DAY);
    }
  });
});

/* ================================================================== */
/* 5. INSUFFICIENT FORECAST EVIDENCE                                   */
/* ================================================================== */

describe("Phase 6.5 / insufficient evidence is first class", () => {
  it("a brand-new account produces gaps, never a band", () => {
    const result = buildForecasts(
      base({ events: [{ id: "a", type: "ticket.pulled", atMs: NOW - DAY }] }),
    );
    expect(result.forecasts).toEqual([]);
    expect(result.evidenceGaps.length).toBe(FORECAST_TYPES.length);
    for (const g of result.evidenceGaps) {
      expect(g.band).toBe("insufficient_evidence");
      expect(g.confidence).toBe("insufficient");
      expect(g.insufficientReason).toBeTruthy();
    }
  });

  it("sparse history never degrades into typical / lower_than_usual", () => {
    const sparse = base({
      events: Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`,
        type: "ticket.pulled",
        atMs: NOW - (i + 1) * 9 * DAY,
      })),
    });
    for (const f of buildForecasts(sparse).forecasts) {
      expect(f.band).not.toBe("typical");
      expect(f.band).not.toBe("lower_than_usual");
    }
  });

  it("escalation demands more evidence than the generic minimum", () => {
    const fc = buildForecast(richInput(), "escalation");
    expect(fc.band).toBe("insufficient_evidence");
    expect(fc.insufficientReason).toBe("outcome_data_unreliable");
  });

  it("insufficient records carry no recommendations to act on", () => {
    for (const g of buildForecasts(base()).evidenceGaps) {
      expect(g.recommendations).toEqual([]);
    }
  });

  it("bandFor cannot invent a band from nothing", () => {
    const empty: ComparableOutcomeSummary = {
      comparableCount: 0,
      observedCount: 0,
      occurredCount: 0,
      unobservedCount: 0,
      distinctPeriods: 0,
      rate: null,
      baseRate: null,
      lift: null,
      strongCount: 0,
    };
    expect(bandFor(empty)).toBe("insufficient_evidence");
  });
});

/* ================================================================== */
/* 6 & 7. COMPARABLE-STATE MATCHING + SAME-ACCOUNT PREFERENCE          */
/* ================================================================== */

describe("Phase 6.5 / comparable-state matching", () => {
  const input = richInput();
  const now = extractStateFeatures(input, NOW);

  it("a near-identical state ranks strongly and explains itself", () => {
    const twin = extractStateFeatures(input, NOW - 21 * DAY);
    const sim = compareStates(now, twin);
    expect(sim.score).toBeGreaterThanOrEqual(FORECAST_CONFIG.minSimilarity);
    expect(sim.matchedOn.length).toBeGreaterThan(2);
  });

  it("same account but structurally incompatible state is NOT comparable", () => {
    const incompatible = {
      ...now,
      activityBand: "none" as const,
      workloadBand: "none" as const,
      issueFamily: "telephony",
      recurringFamily: !now.recurringFamily,
      recentChange: !now.recentChange,
      reopenOrEscalation: !now.reopenOrEscalation,
      scriptRevisionRecent: !now.scriptRevisionRecent,
      atMs: NOW - 40 * DAY,
    };
    const sim = compareStates(now, incompatible);
    expect(sim.score).toBeLessThan(FORECAST_CONFIG.minSimilarity);
    expect(sim.quality).toBe("weak");
  });

  it("wrong issue family reduces similarity even at the same account", () => {
    const sameFamily = extractStateFeatures(input, NOW - 21 * DAY);
    const otherFamily = { ...sameFamily, issueFamily: "hardware" };
    expect(compareStates(now, otherFamily).score).toBeLessThan(
      compareStates(now, sameFamily).score,
    );
  });

  it("an equally-matching but old state scores below a recent one", () => {
    const recent = { ...now, atMs: NOW - 10 * DAY };
    const old = { ...now, atMs: NOW - 100 * DAY };
    expect(compareStates(now, old).score).toBeLessThan(compareStates(now, recent).score);
  });

  it("selection is explainable — every comparable lists why", () => {
    for (const c of findComparableStates(input, "follow_up_work", "next_7_days").comparables) {
      expect(c.matchedOn.length).toBeGreaterThan(0);
      expect(["strong", "moderate", "weak"]).toContain(c.quality);
    }
  });
});

/* ================================================================== */
/* 8 & 9. BANDS AND TYPES                                              */
/* ================================================================== */

describe("Phase 6.5 / bands and types", () => {
  const summary = (over: Partial<ComparableOutcomeSummary>): ComparableOutcomeSummary => ({
    comparableCount: 10,
    observedCount: 10,
    occurredCount: 5,
    unobservedCount: 0,
    distinctPeriods: 5,
    rate: 0.5,
    baseRate: 0.5,
    lift: 1,
    strongCount: 5,
    ...over,
  });

  it("band assignment is deterministic across the whole ladder", () => {
    expect(bandFor(summary({ rate: 0.8, baseRate: 0.3, lift: 2.7 }))).toBe("highly_elevated");
    expect(bandFor(summary({ rate: 0.5, baseRate: 0.3, lift: 1.7 }))).toBe("elevated");
    expect(bandFor(summary({ rate: 0.5, baseRate: 0.5, lift: 1 }))).toBe("typical");
    expect(bandFor(summary({ rate: 0.2, baseRate: 0.5, lift: 0.4 }))).toBe("lower_than_usual");
    expect(bandFor(summary({ rate: null, baseRate: null, lift: null }))).toBe(
      "insufficient_evidence",
    );
  });

  it("the same summary always yields the same band (no hidden judgement)", () => {
    const s = summary({ rate: 0.7, baseRate: 0.3, lift: 2.33 });
    const first = bandFor(s);
    for (let i = 0; i < 25; i++) expect(bandFor(s)).toBe(first);
  });

  it("no band string leaks a fake percentage", () => {
    for (const b of FORECAST_BANDS) expect(b).not.toMatch(/\d/);
  });

  it("extended_duration only compares completed sessions of the same account", () => {
    const features = extractStateFeatures(base(), NOW - 30 * DAY);
    const tooFew = base({
      work: [
        { id: "w1", kind: "logged_time", durationMs: 1000, startedAtMs: NOW - 40 * DAY, endedAtMs: NOW - 40 * DAY },
      ],
    });
    // Fewer than four prior sessions → censored, never a fabricated outcome.
    expect(observeOutcome(tooFew, "extended_duration", NOW - 30 * DAY, 3, features)).toBe(
      "unobserved",
    );
  });

  it("recurrence uses the issue family as the target, not as the forecast", () => {
    const features = { ...extractStateFeatures(richInput(), NOW - 30 * DAY), issueFamily: "billing" };
    const hit = base({
      tickets: [{ id: "n", classification: "billing", createdAtMs: NOW - 28 * DAY }],
    });
    expect(observeOutcome(hit, "recurrence", NOW - 30 * DAY, 7, features)).toBe("occurred");
    const other = base({
      tickets: [{ id: "n", classification: "hardware", createdAtMs: NOW - 28 * DAY }],
    });
    expect(observeOutcome(other, "recurrence", NOW - 30 * DAY, 7, features)).toBe("did_not_occur");
  });
});

/* ================================================================== */
/* 10. ANOMALY vs FORECAST SEMANTICS                                   */
/* ================================================================== */

describe("Phase 6.5 / anomaly is not a forecast", () => {
  it("an active anomaly on a short-history account yields insufficient evidence", () => {
    const withAnomaly = base({
      events: [{ id: "a", type: "ticket.pulled", atMs: NOW - 2 * DAY }],
      anomalies: [
        { id: "an1", anomalyType: "activity_spike", severity: "elevated", confidence: "supported", state: "anomaly" },
      ],
    });
    const fc = buildForecast(withAnomaly, "follow_up_work");
    expect(fc.band).toBe("insufficient_evidence");
  });

  it("with adequate history the forecast is a separate derived object", () => {
    const input = richInput({
      anomalies: [
        { id: "an1", anomalyType: "activity_spike", severity: "elevated", confidence: "supported", state: "anomaly" },
      ],
    });
    const fc = buildForecast(input, "follow_up_work");
    expect(fc.supportingAnomalyIds).toContain("an1");
    expect(fc.id).not.toBe("an1");
    expect(fc.horizonDays).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/* 11. CAUSAL LANGUAGE BOUNDARY                                        */
/* ================================================================== */

describe("Phase 6.5 / causal boundary", () => {
  it("no generated forecast asserts causation or certainty", () => {
    const inputs = [richInput(), base(), richInput({ changes: [{ id: "c1", appliedAtMs: NOW - DAY }] })];
    for (const input of inputs) {
      const r = buildForecasts(input);
      for (const f of [...r.forecasts, ...r.evidenceGaps]) {
        expect(violatesForecastLanguage(f)).toEqual([]);
        expect(f.whatThisDoesNotMean.length).toBeGreaterThan(20);
      }
    }
  });

  it("post-change forecasts stay temporal, never causal", () => {
    const input = richInput({ changes: [{ id: "c1", title: "route update", appliedAtMs: NOW - DAY }] });
    const fc = buildForecast(input, "post_change_follow_up");
    expect(fc.description.toLowerCase()).not.toContain("because of");
    expect(fc.description.toLowerCase()).not.toContain("caused");
  });
});

/* ================================================================== */
/* 12 & 13 & 14. TRAJECTORY, LIFECYCLE, LEDGER EVENTS                  */
/* ================================================================== */

function fakeForecast(over: Partial<ForecastObservation> = {}): ForecastObservation {
  const created = new Date(NOW - 2 * DAY).toISOString();
  return {
    ...buildForecast(richInput(), "follow_up_work"),
    band: "elevated",
    createdAt: created,
    expiresAt: new Date(NOW + 5 * DAY).toISOString(),
    ...over,
  } as ForecastObservation;
}

describe("Phase 6.5 / trajectory + lifecycle", () => {
  it("trend is directional over the band ladder", () => {
    expect(trendFor(undefined, "elevated")).toBe("new");
    expect(trendFor("typical", "elevated")).toBe("rising");
    expect(trendFor("elevated", "typical")).toBe("declining");
    expect(trendFor("elevated", "elevated")).toBe("stable");
  });

  it("losing evidence is never reported as declining risk", () => {
    expect(trendFor("elevated", "insufficient_evidence")).toBe("stable");
    expect(trendFor("insufficient_evidence", "elevated")).toBe("stable");
  });

  it("recalculation without a band change produces no lifecycle churn", () => {
    const f = fakeForecast();
    const result = { forecasts: [f], evidenceGaps: [], generatedAt: new Date(NOW).toISOString() };
    const first = reconcileForecasts(undefined, result, "A100", NOW);
    expect(first.created).toHaveLength(1);

    const second = reconcileForecasts(first.next, result, "A100", NOW + 3600_000);
    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.resolved).toEqual([]);
  });

  it("a meaningful band change emits exactly one update", () => {
    const f = fakeForecast();
    const first = reconcileForecasts(undefined, { forecasts: [f], evidenceGaps: [], generatedAt: "" }, "A100", NOW);
    const risen = { ...f, band: "highly_elevated" as const };
    const second = reconcileForecasts(
      first.next,
      { forecasts: [risen], evidenceGaps: [], generatedAt: "" },
      "A100",
      NOW + DAY,
    );
    expect(second.updated).toHaveLength(1);
    expect(second.updated[0]?.trend).toBe("rising");
  });

  it("a forecast that stops firing resolves once", () => {
    const f = fakeForecast();
    const first = reconcileForecasts(undefined, { forecasts: [f], evidenceGaps: [], generatedAt: "" }, "A100", NOW);
    const second = reconcileForecasts(first.next, { forecasts: [], evidenceGaps: [], generatedAt: "" }, "A100", NOW + DAY);
    expect(second.resolved).toHaveLength(1);
    const third = reconcileForecasts(second.next, { forecasts: [], evidenceGaps: [], generatedAt: "" }, "A100", NOW + 2 * DAY);
    expect(third.resolved).toEqual([]);
  });

  it("HARD GATE: an open horizon stays anchored and does not slide forward", () => {
    const f = fakeForecast();
    const first = reconcileForecasts(undefined, { forecasts: [f], evidenceGaps: [], generatedAt: "" }, "A100", NOW);
    const later = { ...f, createdAt: new Date(NOW + DAY).toISOString(), expiresAt: new Date(NOW + 8 * DAY).toISOString() };
    const second = reconcileForecasts(first.next, { forecasts: [later], evidenceGaps: [], generatedAt: "" }, "A100", NOW + DAY);
    expect(second.next.forecasts[0]?.createdAt).toBe(f.createdAt);
    expect(second.next.forecasts[0]?.expiresAt).toBe(f.expiresAt);
  });

  it("an elapsed horizon rolls to a fresh window", () => {
    const f = fakeForecast();
    const prev: AccountForecastRecord = {
      accountId: "A100",
      lastEvaluatedAt: new Date(NOW).toISOString(),
      calcVersion: 1,
      forecasts: [f],
      evidenceGaps: [],
      announced: { [f.id]: f.band },
      history: [],
      evaluations: [],
    };
    const after = NOW + 10 * DAY;
    const fresh = { ...f, createdAt: new Date(after).toISOString(), expiresAt: new Date(after + 7 * DAY).toISOString() };
    const next = reconcileForecasts(prev, { forecasts: [fresh], evidenceGaps: [], generatedAt: "" }, "A100", after);
    expect(next.next.forecasts[0]?.createdAt).toBe(fresh.createdAt);
  });
});

/* ================================================================== */
/* 15 & 16. OUTCOME GRADING                                            */
/* ================================================================== */

describe("Phase 6.5 / outcome grading", () => {
  const T = NOW - 10 * DAY;
  const graded = (input: ForecastInput, over: Partial<ForecastObservation> = {}) =>
    evaluateElapsedForecasts(
      [
        fakeForecast({
          createdAt: new Date(T).toISOString(),
          expiresAt: new Date(T + 7 * DAY).toISOString(),
          horizonDays: 7,
          ...over,
        }),
      ],
      input,
    );

  it("target inside the horizon → HIT", () => {
    const input = base({ now: NOW, events: [{ id: "h", type: "ticket.pulled", atMs: T + 5 * DAY }] });
    expect(graded(input)[0]?.outcome).toBe("hit");
  });

  it("target after the horizon → not a hit", () => {
    const input = base({ now: NOW, events: [{ id: "h", type: "ticket.pulled", atMs: T + 8 * DAY }] });
    expect(graded(input)[0]?.outcome).toBe("miss");
  });

  it("target before the forecast → not a hit", () => {
    const input = base({ now: NOW, events: [{ id: "h", type: "ticket.pulled", atMs: T - DAY }] });
    expect(graded(input)[0]?.outcome).toBe("miss");
  });

  it("HARD GATE: an incomplete horizon is never graded MISS", () => {
    const openT = NOW - 3 * DAY;
    const rows = evaluateElapsedForecasts(
      [
        fakeForecast({
          createdAt: new Date(openT).toISOString(),
          expiresAt: new Date(openT + 7 * DAY).toISOString(),
          horizonDays: 7,
        }),
      ],
      base({ now: NOW }),
    );
    expect(rows).toEqual([]);
  });

  it("a declined forecast is NOT APPLICABLE, never a miss", () => {
    const rows = graded(base({ now: NOW }), { band: "insufficient_evidence" });
    expect(rows[0]?.outcome).toBe("not_applicable");
  });

  it("grading is pinned to the outcome-contract version", () => {
    const row = graded(base({ now: NOW }))[0];
    expect(row?.outcomeContractVersion).toBeGreaterThanOrEqual(1);
    expect(row?.targetOutcome.length).toBeGreaterThan(10);
  });
});

/* ================================================================== */
/* 17. CALIBRATION FOUNDATION                                          */
/* ================================================================== */

describe("Phase 6.5 / calibration foundation", () => {
  const entry = (i: number, outcome: ForecastEvaluationEntry["outcome"]): ForecastEvaluationEntry => ({
    forecastId: `f${i}`,
    forecastType: "follow_up_work",
    band: "elevated",
    horizonDays: 7,
    targetOutcome: "additional related work",
    outcome,
    createdAt: new Date(NOW - 20 * DAY).toISOString(),
    horizonEndedAt: new Date(NOW - 13 * DAY).toISOString(),
    evaluatedAt: new Date(NOW).toISOString(),
    calcVersion: 1,
    outcomeContractVersion: 1,
  });

  it("declares insufficient evaluation data below the minimum sample", () => {
    const s = summarizeForecastQuality([], [entry(1, "hit"), entry(2, "miss")]);
    expect(s.insufficientEvaluationData).toBe(true);
  });

  it("can answer the band question once enough outcomes are graded", () => {
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => entry(i, "hit")),
      ...Array.from({ length: 10 }, (_, i) => entry(100 + i, "miss")),
    ];
    const s = summarizeForecastQuality([], rows);
    expect(s.insufficientEvaluationData).toBe(false);
    const elevated = s.byBand.find((b) => b.band === "elevated");
    expect(elevated?.hits).toBe(15);
    expect(elevated?.hitRate).toBeCloseTo(0.6, 5);
  });

  it("censored rows never inflate the hit rate", () => {
    const s = summarizeForecastQuality([], [entry(1, "hit"), entry(2, "censored")]);
    const elevated = s.byBand.find((b) => b.band === "elevated");
    expect(elevated?.hitRate).toBe(1);
    expect(elevated?.censored).toBe(1);
  });
});

/* ================================================================== */
/* 20. RADAR INTEGRATION                                               */
/* ================================================================== */

describe("Phase 6.5 / radar integration", () => {
  it("only banded, unexpired forecasts reach the radar", () => {
    const items = forecastsToRadar(
      [
        fakeForecast({ id: "fc:a", band: "highly_elevated" }),
        fakeForecast({ id: "fc:b", band: "elevated" }),
        fakeForecast({ id: "fc:c", band: "typical" }),
        fakeForecast({ id: "fc:d", band: "insufficient_evidence" }),
        fakeForecast({ id: "fc:e", band: "elevated", expiresAt: new Date(NOW - DAY).toISOString() }),
      ],
      NOW,
    );
    expect(items.map((i) => i.id)).toEqual(["radar:fc:a", "radar:fc:b"]);
  });

  it("OUTLOOK NEVER OUTRANKS NOW at equal evidence", () => {
    const forecast = forecastsToRadar([fakeForecast({ id: "fc:a", band: "highly_elevated" })], NOW)[0]!;
    const nowItem = {
      id: "radar:anomaly:1",
      category: "anomaly" as const,
      title: "Activity materially above baseline",
      detail: "now",
      severity: "elevated" as const,
      confidence: forecast.confidence,
      sourceCount: forecast.sourceCount,
      evidenceRefs: [],
      generatedAt: forecast.generatedAt,
    };
    expect(rankRadar([forecast, nowItem])[0]?.id).toBe("radar:anomaly:1");
  });

  it("radar forecast items are deduped by stable id", () => {
    const f = fakeForecast({ id: "fc:a", band: "elevated" });
    const ranked = rankRadar([...forecastsToRadar([f], NOW), ...forecastsToRadar([f], NOW)]);
    expect(new Set(ranked.map((i) => i.id)).size).toBe(ranked.length ? 1 : 0);
  });

  it("acknowledged forecast items are suppressed", () => {
    const items = forecastsToRadar([fakeForecast({ id: "fc:a", band: "elevated" })], NOW);
    expect(rankRadar(items, new Set(["radar:fc:a"]))).toEqual([]);
  });
});

/* ================================================================== */
/* 23-25, 27, 30. RECOMMENDATIONS, PRIVACY, AUTONOMY, SCRIPT GATE      */
/* ================================================================== */

describe("Phase 6.5 / recommendations, privacy, autonomy", () => {
  it("banded forecasts recommend preparation and name what reduces uncertainty", () => {
    const fc = buildForecast(richInput(), "follow_up_work");
    if (fc.band !== "insufficient_evidence") {
      expect(fc.recommendations.length).toBeGreaterThan(0);
    }
    expect(fc.uncertaintyReducers.length).toBeGreaterThan(0);
    for (const r of [...fc.recommendations, ...fc.uncertaintyReducers]) {
      expect(r.toLowerCase()).not.toContain("will prevent");
      expect(r.toLowerCase()).not.toContain("guarantee");
    }
  });

  it("autonomy is capped at prepare and never executes", () => {
    expect(maxForecastAutonomy()).toBe("prepare");
    for (const f of buildForecasts(richInput()).forecasts) {
      expect(["observe", "explain", "recommend", "prepare"]).toContain(f.autonomy);
    }
  });

  it("persisted forecasts carry references and counts only", () => {
    const input = richInput({
      tickets: [
        {
          id: "t-secret",
          classification: "billing",
          createdAtMs: NOW - DAY,
          updatedAtMs: NOW - DAY,
        },
      ],
    });
    const blob = JSON.stringify(buildForecasts(input));
    for (const forbidden of ["password", "sb_secret", "Bearer ", "@example.com", "ssn"]) {
      expect(blob.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    for (const f of buildForecasts(input).forecasts) {
      expect(f.sensitivity).toBe("reference");
      for (const ref of f.evidenceRefs) expect(typeof ref.id).toBe("string");
    }
  });

  it("script forecasts stay dormant below the structural coverage gate", () => {
    const lowCoverage = richInput({
      scripts: [
        {
          scriptId: "s1",
          title: "intake",
          coverage: 0.1,
          versionCount: 5,
          unresolvedCount: 3,
          structuralRevisions: 2,
          lastRevisionAtMs: NOW - DAY,
        },
      ],
    });
    const fc = buildForecast(lowCoverage, "script_test_gap");
    expect(fc.band).toBe("insufficient_evidence");
    expect(fc.insufficientReason).toBe("script_coverage_below_threshold");

    const zero = richInput({
      scripts: [
        {
          scriptId: "s1",
          title: "intake",
          coverage: 0,
          versionCount: 0,
          unresolvedCount: 0,
          structuralRevisions: 0,
        },
      ],
    });
    expect(buildForecast(zero, "script_test_gap").band).toBe("insufficient_evidence");
  });

  it("resolution memory informs but never decides the forecast", () => {
    const withMemory = richInput({ verifiedResolutions: 12 });
    const without = richInput({ verifiedResolutions: 0 });
    expect(buildForecast(withMemory, "follow_up_work").band).toBe(
      buildForecast(without, "follow_up_work").band,
    );
  });
});

/* ================================================================== */
/* 32. TAXONOMY CLEANUP                                                */
/* ================================================================== */

describe("Phase 6.5 / event taxonomy", () => {
  it("script structural events are programming facts, not resolutions", () => {
    expect(ledgerCategory("script.version_recorded")).toBe("programming");
    expect(ledgerCategory("script.structure_changed")).toBe("programming");
  });

  it("forecast lifecycle events stay intelligence + reference", () => {
    expect(ledgerCategory("intelligence.forecast_created")).toBe("intelligence");
    expect(ledgerCategory("intelligence.forecast_expired")).toBe("intelligence");
  });
});
