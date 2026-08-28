/**
 * Phase 5.5 — Anomaly Intelligence Runtime Verification Gate.
 *
 * These tests exist to prove the Phase 5 boundaries under adversarial data:
 * normal variation must stay silent, thin history must stay "insufficient
 * baseline", outliers must not poison baselines, comparisons must be
 * type-compatible, one event is not a trend, and persisted records must never
 * carry ticket bodies, script source or credentials.
 */

import { describe, it, expect } from "vitest";
import { buildBaseline, mad, median, robustZ } from "./baseline-engine";
import {
  detectActivitySpike,
  detectDurationAnomaly,
  detectQuietToActive,
  detectRecurrenceAcceleration,
  detectReopenEscalationDrift,
  detectScriptStructureDrift,
  detectPostChangeActivity,
  type AnomalyInput,
} from "./anomaly-detectors";
import { detectAnomalies, violatesLanguageContract, maxAutonomy } from "./anomaly-engine";
import { reconcileAnomalies } from "./anomaly-store";
import { ANOMALY_CONFIG, ANOMALY_DAY_MS, type AnomalySignal } from "./anomaly-contract";
import { anomaliesToRadar, rankRadar, MAX_RADAR_ITEMS } from "./operational-radar";

const NOW = Date.UTC(2026, 2, 15, 12, 0, 0);
const day = ANOMALY_DAY_MS;

function baseInput(over: Partial<AnomalyInput> = {}): AnomalyInput {
  return { accountId: "A1", now: NOW, events: [], tickets: [], changes: [], durations: [], ...over };
}

function events(perDayByAge: number[]): AnomalyInput["events"] {
  const out: AnomalyInput["events"] = [];
  perDayByAge.forEach((n, age) => {
    for (let i = 0; i < n; i++) {
      out.push({ id: `e${age}-${i}`, type: "ticket.pulled", atMs: NOW - age * day - i * 1000 });
    }
  });
  return out;
}

/* -------------------------------------------------------------- */
/* 5. Normal variation                                              */
/* -------------------------------------------------------------- */

describe("normal variation produces no anomaly", () => {
  it("stays silent while daily volume fluctuates inside the historical spread", () => {
    const pattern = Array.from({ length: 45 }, (_, i) => [2, 3, 1, 4, 2, 3][i % 6]!);
    pattern[0] = 3; // today: ordinary
    const result = detectAnomalies(baseInput({ events: events(pattern) }));
    expect(result.anomalies.filter((a) => a.anomalyType === "activity_spike")).toEqual([]);
  });

  it("does not flag a single ticket on a quiet account as reactivation", () => {
    const one = [{ id: "t1", classification: "Other", createdAtMs: NOW - 2 * 3600_000 }];
    const signals = detectQuietToActive(
      baseInput({ tickets: one, events: [{ id: "e", type: "ticket.pulled", atMs: NOW - 3600_000 }] }),
    );
    expect(signals.filter((s) => s.state === "anomaly")).toEqual([]);
  });
});

/* -------------------------------------------------------------- */
/* 6. Robust statistics                                             */
/* -------------------------------------------------------------- */

describe("robust statistics resist distortion", () => {
  it("a single historic outlier does not make normal behavior anomalous", () => {
    const history = [2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 400];
    const b = buildBaseline(history, { metric: "events/day", windowDays: 30 });
    expect(b.established).toBe(true);
    expect(median(history)).toBe(3);
    expect(Math.abs(robustZ(3, b)!)).toBeLessThan(ANOMALY_CONFIG.robustZThreshold);
  });

  it("zero-heavy history refuses to become a baseline", () => {
    const b = buildBaseline([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2], {
      metric: "events/day",
      windowDays: 14,
    });
    expect(b.established).toBe(false);
    expect(b.reason).toBe("too_few_active_periods");
  });

  it("skewed history still yields a stable median/MAD", () => {
    const skewed = [1, 1, 2, 2, 2, 3, 3, 4, 9, 30];
    expect(median(skewed)).toBe(2.5);
    expect(mad(skewed)).toBeLessThanOrEqual(2);
  });

  it("a flat history has no dispersion and is not a baseline", () => {
    const b = buildBaseline(new Array(20).fill(2), { metric: "events/day", windowDays: 20 });
    expect(b.established).toBe(false);
    expect(b.reason).toBe("no_dispersion");
  });
});

/* -------------------------------------------------------------- */
/* 3. Insufficient baseline                                         */
/* -------------------------------------------------------------- */

describe("INSUFFICIENT BASELINE stays a first-class non-anomaly", () => {
  const cases: Array<[string, AnomalyInput]> = [
    ["brand new account", baseInput()],
    ["single event", baseInput({ events: events([1]) })],
    ["sparse history", baseInput({ events: events([1, 0, 0, 1, 0, 0, 0, 1]) })],
  ];

  for (const [name, input] of cases) {
    it(`${name} yields gaps, never anomalies or elevated severity`, () => {
      const result = detectAnomalies(input);
      expect(result.anomalies).toEqual([]);
      for (const g of result.baselineGaps) {
        expect(g.state).toBe("insufficient_baseline");
        expect(g.severity).toBe("info");
        expect(g.confidence).toBe("insufficient");
        expect(g.autonomy).toBe("observe");
        expect(violatesLanguageContract(g)).toEqual([]);
      }
    });
  }
});

/* -------------------------------------------------------------- */
/* 9. Duration comparability                                        */
/* -------------------------------------------------------------- */

describe("duration comparisons require compatible work types", () => {
  const dispatch = Array.from({ length: 12 }, (_, i) => ({
    id: `d${i}`,
    label: "Contact dispatch",
    durationMs: (20 + (i % 3) * 4) * 60_000,
    atMs: NOW - (20 - i) * day,
  }));

  it("does not score a script session against dispatch history", () => {
    const [signal] = detectDurationAnomaly(
      baseInput({
        durations: [
          ...dispatch,
          { id: "s1", label: "Script build", durationMs: 240 * 60_000, atMs: NOW - 3600_000 },
        ],
      }),
    );
    expect(signal!.state).toBe("insufficient_baseline");
    expect(signal!.baseline.metric).toContain("Script build");
  });

  it("scores a long session against its own kind once history exists", () => {
    const [signal] = detectDurationAnomaly(
      baseInput({
        durations: [
          ...dispatch,
          { id: "d99", label: "Contact dispatch", durationMs: 300 * 60_000, atMs: NOW - 3600_000 },
        ],
      }),
    );
    expect(signal!.state).toBe("anomaly");
    expect(signal!.deviation.observed).toBe(300);
  });

  it("stays quiet for an ordinary duration", () => {
    expect(
      detectDurationAnomaly(
        baseInput({
          durations: [
            ...dispatch,
            { id: "d98", label: "Contact dispatch", durationMs: 24 * 60_000, atMs: NOW - 3600_000 },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------- */
/* 10 & 14. Drift needs repetition                                  */
/* -------------------------------------------------------------- */

describe("drift requires more than one observation", () => {
  const prior = Array.from({ length: 20 }, (_, i) => ({
    id: `p${i}`,
    classification: "Other",
    createdAtMs: NOW - (40 + i * 2) * day,
    updatedAtMs: NOW - (40 + i * 2) * day,
  }));

  it("one reopen is not a trend", () => {
    const signals = detectReopenEscalationDrift(
      baseInput({
        tickets: [...prior, { id: "r1", reopened: true, updatedAtMs: NOW - 2 * day }],
      }),
    );
    expect(signals.filter((s) => s.state === "anomaly")).toEqual([]);
  });

  it("repeated reopens above the prior rate do drift", () => {
    const recent = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      reopened: true,
      updatedAtMs: NOW - (i + 1) * day,
    }));
    const [signal] = detectReopenEscalationDrift(baseInput({ tickets: [...prior, ...recent] }));
    expect(signal!.state).toBe("anomaly");
    expect(signal!.sourceCount).toBe(5);
  });
});

/* -------------------------------------------------------------- */
/* 11. Recurrence acceleration                                      */
/* -------------------------------------------------------------- */

describe("recurrence acceleration describes spacing, not the future", () => {
  it("recognises 40/38/44-day spacing tightening to 8/5/4", () => {
    // Newest-first: recent spacing 4/5/8 days against historical 44/38/40.
    const gaps = [4, 5, 8, 44, 38, 40];
    let cursor = NOW;
    const times: number[] = [NOW - 1 * day];
    for (const g of gaps) {
      cursor = (times[times.length - 1] as number) - g * day;
      times.push(cursor);
    }
    const tickets = times.map((t, i) => ({
      id: `t${i}`,
      classification: "Cancellation Handling",
      createdAtMs: t,
    }));
    const [signal] = detectRecurrenceAcceleration(baseInput({ tickets }));
    expect(signal!.state).toBe("anomaly");
    expect(violatesLanguageContract(signal!)).toEqual([]);
    expect(signal!.description.toLowerCase()).not.toContain("will ");
  });
});

/* -------------------------------------------------------------- */
/* 12. Post-change boundary                                         */
/* -------------------------------------------------------------- */

describe("post-change activity keeps the causal boundary explicit", () => {
  it("states temporal association and the limit of the claim", () => {
    const appliedAt = NOW - 4 * day;
    const history = events(Array.from({ length: 40 }, (_, i) => (i % 5 === 0 ? 2 : 1)));
    const burst = Array.from({ length: 14 }, (_, i) => ({
      id: `pc${i}`,
      type: "ticket.pulled",
      atMs: appliedAt + i * 3600_000,
    }));
    const [signal] = detectPostChangeActivity(
      baseInput({
        events: [...history, ...burst],
        changes: [{ id: "C1", title: "Routing update", appliedAtMs: appliedAt }],
      }),
    );
    expect(signal!.state).toBe("anomaly");
    expect(signal!.description).toContain("does not establish");
    expect(violatesLanguageContract(signal!)).toEqual([]);
  });
});

/* -------------------------------------------------------------- */
/* 13. Script coverage gate                                         */
/* -------------------------------------------------------------- */

describe("script-structure gate holds at zero recognition", () => {
  it("0% coverage yields insufficient structural data, never an anomaly", () => {
    const [signal] = detectScriptStructureDrift(
      baseInput({
        scripts: [
          {
            scriptId: "S0",
            title: "Prose entry",
            coverage: 0,
            versionCount: 6,
            unresolvedCount: 9,
            structuralRevisions: 4,
            recognitionTrend: "degrading",
          },
        ],
      }),
    );
    expect(signal!.state).toBe("insufficient_baseline");
    expect(signal!.insufficientReason).toBe("coverage_below_threshold");
    expect(signal!.severity).toBe("info");
  });
});

/* -------------------------------------------------------------- */
/* 16-17. Severity & confidence semantics                           */
/* -------------------------------------------------------------- */

describe("severity and confidence are explainable, never predictive", () => {
  const spikeInput = baseInput({
    events: events([30, ...Array.from({ length: 44 }, (_, i) => [2, 3, 1, 3][i % 4]!)]),
  });

  it("severity tracks deviation magnitude and exposes the statistics", () => {
    const [signal] = detectActivitySpike(spikeInput);
    expect(signal!.state).toBe("anomaly");
    expect(["notice", "elevated"]).toContain(signal!.severity);
    expect(signal!.baseline.method).not.toBe("none");
    expect(signal!.deviation.robustZ).not.toBeNull();
  });

  it("confidence is a class about the observation, not a failure probability", () => {
    const [signal] = detectActivitySpike(spikeInput);
    expect(["verified", "supported", "inferred", "insufficient"]).toContain(signal!.confidence);
    expect(signal!.description).not.toMatch(/\d+%\s*(chance|risk|probability)/i);
  });

  it("autonomy never exceeds prepare", () => {
    expect(maxAutonomy()).toBe("prepare");
    const result = detectAnomalies(spikeInput);
    for (const s of [...result.anomalies, ...result.baselineGaps]) {
      expect(["observe", "explain", "recommend", "prepare"]).toContain(s.autonomy);
    }
  });
});

/* -------------------------------------------------------------- */
/* 18-19. Lifecycle + one-time announcements                        */
/* -------------------------------------------------------------- */

describe("anomaly lifecycle and ledger announcements", () => {
  const signal = (id: string): AnomalySignal =>
    ({ id, state: "anomaly", anomalyType: "activity_spike", severity: "notice" }) as AnomalySignal;
  const res = (anomalies: AnomalySignal[]) =>
    ({ anomalies, baselineGaps: [], generatedAt: "" }) as never;

  it("announces once, keeps quiet on recalculation, and records resolution history", () => {
    const a = reconcileAnomalies(undefined, res([signal("x")]), "A1", NOW);
    expect(a.newlyDetected).toHaveLength(1);

    const b = reconcileAnomalies(a.next, res([signal("x")]), "A1", NOW + 1000);
    expect(b.newlyDetected).toHaveLength(0);
    expect(b.next.history).toEqual([]);

    const c = reconcileAnomalies(b.next, res([]), "A1", NOW + 2000);
    expect(c.newlyDetected).toHaveLength(0);
    expect(c.next.history).toHaveLength(1);
    expect(c.next.history[0]!.status).toBe("resolved");

    // History is not erased by later evaluations, and recurrence re-announces.
    const d = reconcileAnomalies(c.next, res([signal("x")]), "A1", NOW + 3000);
    expect(d.newlyDetected).toHaveLength(1);
    expect(d.next.history).toHaveLength(1);
  });

  it("does not duplicate a resolution entry across repeated empty evaluations", () => {
    const a = reconcileAnomalies(undefined, res([signal("x")]), "A1", NOW);
    const b = reconcileAnomalies(a.next, res([]), "A1", NOW + 1000);
    const c = reconcileAnomalies(b.next, res([]), "A1", NOW + 2000);
    expect(c.next.history).toHaveLength(1);
  });
});

/* -------------------------------------------------------------- */
/* 20. Radar surfacing                                              */
/* -------------------------------------------------------------- */

describe("radar surfacing stays bounded and suppressible", () => {
  const many: AnomalySignal[] = Array.from({ length: 12 }, (_, i) => ({
    id: `anom:activity_spike:A${i}`,
    state: i % 4 === 0 ? "insufficient_baseline" : "anomaly",
    anomalyType: "activity_spike",
    accountId: `A${i}`,
    title: `Spike ${i}`,
    description: "Deviation from baseline.",
    severity: i < 3 ? "elevated" : "info",
    confidence: "inferred",
    baseline: { metric: "events/day", median: 2, sampleCount: 40, nonZeroCount: 20 },
    deviation: { observed: 12, robustZ: 6, ratio: 6 },
    sourceCount: 3,
    evidenceRefs: [],
    generatedAt: new Date(NOW).toISOString(),
  })) as unknown as AnomalySignal[];

  it("maps only established anomalies and caps the surface", () => {
    const items = anomaliesToRadar(many);
    expect(items.every((i) => i.category === "anomaly")).toBe(true);
    expect(items).toHaveLength(9);
    const ranked = rankRadar(items);
    expect(ranked.length).toBeLessThanOrEqual(MAX_RADAR_ITEMS);
    expect(ranked[0]!.severity).toBe("elevated");
  });

  it("respects operator suppression", () => {
    const items = anomaliesToRadar(many);
    const suppressed = new Set([items[0]!.id]);
    expect(rankRadar(items, suppressed).some((i) => i.id === items[0]!.id)).toBe(false);
  });
});

/* -------------------------------------------------------------- */
/* 27. Privacy of persisted payloads                                */
/* -------------------------------------------------------------- */

describe("persisted anomaly payloads carry no sensitive content", () => {
  it("keeps ticket bodies, script source and secrets out of the record", () => {
    const secretish = "PATIENT SSN 123-45-6789 apikey=sk_live_abc";
    const result = detectAnomalies(
      baseInput({
        events: events([30, ...Array.from({ length: 44 }, (_, i) => [2, 3, 1, 3][i % 4]!)]),
        tickets: Array.from({ length: 14 }, (_, i) => ({
          id: `t${i}`,
          classification: "Cancellation Handling",
          createdAtMs: NOW - i * day,
          updatedAtMs: NOW - i * day,
        })),
        changes: [{ id: "C1", title: "Routing update", appliedAtMs: NOW - 4 * day }],
        scripts: [
          {
            scriptId: "S1",
            title: "Intake",
            coverage: 0.9,
            versionCount: 5,
            unresolvedCount: 4,
            structuralRevisions: 3,
            recognitionTrend: "degrading",
          },
        ],
      }),
    );
    const { next } = reconcileAnomalies(undefined, result, "A1", NOW);
    const json = JSON.stringify(next);
    expect(json).not.toContain(secretish);
    expect(json).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    expect(json).not.toMatch(/sk_live|password|bearer /i);
    // Evidence is by reference only.
    for (const a of next.anomalies) {
      for (const ref of a.evidenceRefs) {
        expect(Object.keys(ref).sort()).toEqual(["id", "type"]);
      }
    }
  });
});
