import { describe, it, expect } from "vitest";
import {
  buildBaseline,
  dailyBuckets,
  intervalsMs,
  iqr,
  mad,
  median,
  quantile,
  ratioToBaseline,
  robustZ,
} from "./baseline-engine";
import {
  detectAnomalies,
  rankAnomalies,
  violatesLanguageContract,
  type AnomalyInput,
} from "./anomaly-engine";
import {
  detectActivitySpike,
  detectDurationAnomaly,
  detectIssueConcentration,
  detectPostChangeActivity,
  detectQuietToActive,
  detectRecurrenceAcceleration,
  detectReopenEscalationDrift,
  detectScriptStructureDrift,
} from "./anomaly-detectors";
import { ANOMALY_CONFIG, ANOMALY_DAY_MS } from "./anomaly-contract";
import { reconcileAnomalies } from "./anomaly-store";

const NOW = Date.UTC(2026, 2, 15, 12, 0, 0);
const day = ANOMALY_DAY_MS;

function baseInput(over: Partial<AnomalyInput> = {}): AnomalyInput {
  return {
    accountId: "A1",
    now: NOW,
    events: [],
    tickets: [],
    changes: [],
    durations: [],
    ...over,
  };
}

/** Steady 2 events/day for `days` days ending yesterday, plus jitter. */
function steadyEvents(days: number, perDay: number, jitterAt: number[] = []): AnomalyInput["events"] {
  const out: AnomalyInput["events"] = [];
  for (let d = 1; d <= days; d++) {
    const n = perDay + (jitterAt.includes(d) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      out.push({ id: `e${d}-${i}`, type: "ticket.pulled", atMs: NOW - d * day - i * 1000 });
    }
  }
  return out;
}

describe("robust statistics", () => {
  it("computes median and quantiles without being dragged by an outlier", () => {
    const values = [1, 1, 2, 2, 2, 3, 3, 400];
    expect(median(values)).toBe(2);
    expect(quantile(values, 0)).toBe(1);
    expect(quantile(values, 1)).toBe(400);
    // A mean would be ~51.75 — the whole reason means are not used.
    expect(median(values)).toBeLessThan(10);
  });

  it("computes MAD and IQR", () => {
    expect(mad([1, 1, 2, 2, 4, 6])).toBe(1);
    expect(iqr([1, 2, 3, 4, 5])).toBe(2);
  });

  it("buckets timestamps into trailing days, newest last", () => {
    const buckets = dailyBuckets([NOW - 1000, NOW - 1000, NOW - day - 1000], NOW, 3);
    expect(buckets).toEqual([0, 1, 2]);
  });

  it("derives ascending intervals", () => {
    expect(intervalsMs([30, 10, 20])).toEqual([10, 10]);
    expect(intervalsMs([5])).toEqual([]);
  });
});

describe("baseline establishment", () => {
  it("refuses a baseline with too few samples", () => {
    const b = buildBaseline([1, 2, 3], { metric: "events/day", windowDays: 56 });
    expect(b.established).toBe(false);
    expect(b.reason).toBe("too_few_samples");
  });

  it("refuses a baseline built from mostly-empty periods", () => {
    const samples = new Array(30).fill(0);
    samples[0] = 5;
    const b = buildBaseline(samples, { metric: "events/day", windowDays: 56 });
    expect(b.established).toBe(false);
    expect(b.reason).toBe("too_few_active_periods");
  });

  it("refuses a baseline with no dispersion", () => {
    const b = buildBaseline(new Array(30).fill(4), { metric: "events/day", windowDays: 56 });
    expect(b.established).toBe(false);
    expect(b.reason).toBe("no_dispersion");
  });

  it("establishes a baseline with real history and spread, and scores deviation", () => {
    const samples = [2, 2, 3, 2, 4, 2, 3, 2, 2, 5, 3, 2, 2, 3, 4, 2, 3, 2, 2, 3];
    const b = buildBaseline(samples, { metric: "events/day", windowDays: 56 });
    expect(b.established).toBe(true);
    expect(b.summary.method).toBe("mad");
    expect(robustZ(30, b)).toBeGreaterThan(ANOMALY_CONFIG.robustZThreshold);
    expect(robustZ(3, b)).toBeLessThan(ANOMALY_CONFIG.robustZThreshold);
    expect(ratioToBaseline(6, b)).toBeGreaterThan(1);
  });

  it("returns null deviation for an unestablished baseline", () => {
    expect(robustZ(10, buildBaseline([1], { metric: "m", windowDays: 7 }))).toBeNull();
  });
});

describe("INSUFFICIENT BASELINE is first-class, never an anomaly", () => {
  it("emits a baseline-gap signal instead of a spike on a brand-new account", () => {
    const input = baseInput({
      events: [
        { id: "a", type: "ticket.pulled", atMs: NOW - 1000 },
        { id: "b", type: "ticket.pulled", atMs: NOW - 2000 },
        { id: "c", type: "ticket.pulled", atMs: NOW - 3000 },
        { id: "d", type: "ticket.pulled", atMs: NOW - 4000 },
      ],
    });
    const signals = detectActivitySpike(input);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.state).toBe("insufficient_baseline");
    expect(signals[0]!.confidence).toBe("insufficient");
    expect(signals[0]!.severity).toBe("info");
    expect(signals[0]!.autonomy).toBe("observe");
  });

  it("separates gaps from anomalies in the engine result", () => {
    const result = detectAnomalies(baseInput({ events: steadyEvents(3, 1) }));
    expect(result.anomalies).toHaveLength(0);
    expect(result.baselineGaps.length).toBeGreaterThan(0);
    expect(result.baselineGaps.every((g) => g.state === "insufficient_baseline")).toBe(true);
  });

  it("never marks a duration unusual before enough sessions exist", () => {
    const durations = [1, 2, 3].map((i) => ({
      id: `w${i}`,
      durationMs: i * 60_000,
      atMs: NOW - i * day,
    }));
    durations.push({ id: "w-huge", durationMs: 900 * 60_000, atMs: NOW - 1000 });
    const signals = detectDurationAnomaly(baseInput({ durations }));
    expect(signals[0]!.state).toBe("insufficient_baseline");
  });
});

describe("detectors against established baselines", () => {
  it("flags an activity spike", () => {
    const events = [
      ...steadyEvents(40, 2, [3, 9, 17, 25]),
      ...Array.from({ length: 25 }, (_, i) => ({
        id: `spike${i}`,
        type: "ticket.pulled",
        ticketId: `T${i % 4}`,
        atMs: NOW - i * 1000,
      })),
    ];
    const [signal] = detectActivitySpike(baseInput({ events }));
    expect(signal!.state).toBe("anomaly");
    expect(signal!.anomalyType).toBe("activity_spike");
    expect(signal!.deviation.robustZ!).toBeGreaterThan(ANOMALY_CONFIG.robustZThreshold);
    expect(signal!.severity).toBe("elevated");
  });

  it("does not flag ordinary volume", () => {
    expect(detectActivitySpike(baseInput({ events: steadyEvents(40, 2, [4, 12, 20]) }))).toEqual(
      [],
    );
  });

  it("flags issue concentration only against a real prior mix", () => {
    const prior = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      classification: i % 3 === 0 ? "Scripting Issue" : "Other",
      createdAtMs: NOW - (20 + i) * day,
    }));
    const recent = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i}`,
      classification: "Scripting Issue",
      createdAtMs: NOW - (i + 1) * 3600_000,
    }));
    const [signal] = detectIssueConcentration(baseInput({ tickets: [...prior, ...recent] }));
    expect(signal!.state).toBe("anomaly");
    expect(signal!.anomalyType).toBe("issue_concentration");
    expect(signal!.severity).toBe("elevated");

    const thin = detectIssueConcentration(baseInput({ tickets: recent }));
    expect(thin[0]!.state).toBe("insufficient_baseline");
  });

  it("flags a quiet → active shift", () => {
    const events = [
      { id: "old1", type: "ticket.pulled", atMs: NOW - 40 * day },
      { id: "old2", type: "ticket.pulled", atMs: NOW - 39 * day },
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `new${i}`,
        type: "ticket.pulled",
        atMs: NOW - i * 3600_000,
      })),
    ];
    const [signal] = detectQuietToActive(baseInput({ events }));
    expect(signal!.state).toBe("anomaly");
    expect(signal!.title).toContain("quiet days");
  });

  it("flags a duration deviation once enough sessions exist", () => {
    const durations = Array.from({ length: 12 }, (_, i) => ({
      id: `w${i}`,
      durationMs: (20 + (i % 3) * 5) * 60_000,
      atMs: NOW - (13 - i) * day,
    }));
    durations.push({ id: "w-long", durationMs: 400 * 60_000, atMs: NOW - 3600_000 });
    const [signal] = detectDurationAnomaly(baseInput({ durations }));
    expect(signal!.state).toBe("anomaly");
    expect(signal!.title).toContain("longer");
  });

  it("flags reopen/escalation drift against the prior rate", () => {
    const prior = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      updatedAtMs: NOW - (40 + i * 5) * day,
      reopened: i === 0,
    }));
    const recent = Array.from({ length: 4 }, (_, i) => ({
      id: `r${i}`,
      updatedAtMs: NOW - (i + 1) * day,
      escalated: true,
    }));
    const [signal] = detectReopenEscalationDrift(baseInput({ tickets: [...prior, ...recent] }));
    expect(signal!.state).toBe("anomaly");
    expect(signal!.autonomy).toBe("recommend");
  });

  it("flags recurrence acceleration when the gap tightens", () => {
    const times = [120, 90, 60, 30, 2].map((d) => NOW - d * day);
    const tickets = times.map((t, i) => ({
      id: `t${i}`,
      classification: "Scripting Issue",
      createdAtMs: t,
    }));
    const [signal] = detectRecurrenceAcceleration(baseInput({ tickets }));
    expect(signal!.state).toBe("anomaly");
    expect(signal!.anomalyType).toBe("recurrence_acceleration");
  });

  it("describes post-change activity as temporal association only", () => {
    const appliedAt = NOW - 5 * day;
    const events = [
      ...steadyEvents(40, 1, [6, 14, 22, 30]),
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `pc${i}`,
        type: "ticket.pulled",
        atMs: appliedAt + i * 3600_000,
      })),
    ];
    const [signal] = detectPostChangeActivity(
      baseInput({ events, changes: [{ id: "C1", title: "Routing update", appliedAtMs: appliedAt }] }),
    );
    expect(signal!.state).toBe("anomaly");
    expect(signal!.description).toContain("Temporal association");
    expect(signal!.description).toContain("does not establish");
  });
});

describe("script-structure anomalies stay dormant below recognition thresholds", () => {
  const script = {
    scriptId: "S1",
    title: "Intake",
    coverage: 0.9,
    versionCount: 5,
    unresolvedCount: 4,
    structuralRevisions: 3,
    recognitionTrend: "degrading" as const,
  };

  it("does not activate below the coverage threshold", () => {
    const [signal] = detectScriptStructureDrift(
      baseInput({ scripts: [{ ...script, coverage: 0.4 }] }),
    );
    expect(signal!.state).toBe("insufficient_baseline");
    expect(signal!.insufficientReason).toBe("coverage_below_threshold");
  });

  it("does not activate with too few recorded versions", () => {
    const [signal] = detectScriptStructureDrift(
      baseInput({ scripts: [{ ...script, versionCount: 2 }] }),
    );
    expect(signal!.state).toBe("insufficient_baseline");
    expect(signal!.insufficientReason).toBe("too_few_samples");
  });

  it("activates only when coverage and version history clear the bar", () => {
    const [signal] = detectScriptStructureDrift(baseInput({ scripts: [script] }));
    expect(signal!.state).toBe("anomaly");
    expect(signal!.severity).toBe("elevated");
  });
});

describe("language + autonomy contract", () => {
  it("no signal makes a causal or predictive assertion", () => {
    const prior = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      classification: i % 3 === 0 ? "Scripting Issue" : "Other",
      createdAtMs: NOW - (20 + i) * day,
      updatedAtMs: NOW - (20 + i) * day,
      reopened: i % 4 === 0,
    }));
    const result = detectAnomalies(
      baseInput({
        events: steadyEvents(40, 2, [5, 13, 21]),
        tickets: prior,
        changes: [{ id: "C1", title: "Routing update", appliedAtMs: NOW - 4 * day }],
        durations: Array.from({ length: 12 }, (_, i) => ({
          id: `w${i}`,
          durationMs: (20 + (i % 3) * 5) * 60_000,
          atMs: NOW - (13 - i) * day,
        })),
        scripts: [
          {
            scriptId: "S1",
            title: "Intake",
            coverage: 0.9,
            versionCount: 5,
            unresolvedCount: 2,
            structuralRevisions: 3,
            recognitionTrend: "degrading",
          },
        ],
      }),
    );
    for (const s of [...result.anomalies, ...result.baselineGaps]) {
      expect(violatesLanguageContract(s)).toEqual([]);
      expect(["observe", "explain", "recommend", "prepare"]).toContain(s.autonomy);
    }
  });

  it("caps the anomaly surface and ranks elevated first", () => {
    const result = detectAnomalies(
      baseInput({ events: steadyEvents(40, 2, [5, 13, 21]), tickets: [] }),
    );
    expect(result.anomalies.length).toBeLessThanOrEqual(6);
    const sorted = [...result.anomalies].sort(rankAnomalies);
    expect(sorted.map((s) => s.id)).toEqual(result.anomalies.map((s) => s.id));
  });
});

describe("anomaly reconciliation", () => {
  const signal = {
    id: "anom:activity_spike:A1",
    state: "anomaly" as const,
  } as never;

  it("announces a new anomaly once and not again", () => {
    const result = { anomalies: [signal], baselineGaps: [], generatedAt: "" } as never;
    const first = reconcileAnomalies(undefined, result, "A1", NOW);
    expect(first.newlyDetected).toHaveLength(1);
    const second = reconcileAnomalies(first.next, result, "A1", NOW);
    expect(second.newlyDetected).toHaveLength(0);
  });

  it("drops announcements for anomalies that stopped firing", () => {
    const withSignal = { anomalies: [signal], baselineGaps: [], generatedAt: "" } as never;
    const empty = { anomalies: [], baselineGaps: [], generatedAt: "" } as never;
    const a = reconcileAnomalies(undefined, withSignal, "A1", NOW);
    const b = reconcileAnomalies(a.next, empty, "A1", NOW);
    expect(b.next.announcedIds).toEqual([]);
    const c = reconcileAnomalies(b.next, withSignal, "A1", NOW);
    expect(c.newlyDetected).toHaveLength(1);
  });
});
