import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_FORECAST_PHRASES,
  FORECAST_TYPES,
  isElevated,
  type ForecastObservation,
} from "./forecast-contract";
import { buildForecast, buildForecasts, violatesForecastLanguage } from "./forecast-engine";
import { extractStateFeatures, observeOutcome, type ForecastInput } from "./comparable-state";
import { reconcileForecasts, trendFor } from "./forecast-store";
import { evaluateElapsedForecasts, summarizeForecastQuality } from "./forecast-evaluation";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-03-01T12:00:00.000Z");

function emptyInput(over: Partial<ForecastInput> = {}): ForecastInput {
  return {
    accountId: "ACC1",
    now: NOW,
    events: [],
    tickets: [],
    changes: [],
    work: [],
    ...over,
  };
}

/** A long, repetitive history: weekly ticket + follow-up work for 16 weeks. */
function richInput(): ForecastInput {
  const events: ForecastInput["events"] = [];
  const tickets: ForecastInput["tickets"] = [];
  for (let w = 16; w >= 0; w--) {
    const base = NOW - w * 7 * DAY;
    tickets.push({
      id: `T${w}`,
      classification: "call_flow",
      status: "completed",
      createdAtMs: base,
      updatedAtMs: base + DAY,
    });
    events.push({ id: `E${w}a`, type: "ticket.pulled", ticketId: `T${w}`, atMs: base });
    events.push({ id: `E${w}b`, type: "work.started", ticketId: `T${w}`, atMs: base + 2 * 60_000 });
    events.push({ id: `E${w}c`, type: "ticket.completed", ticketId: `T${w}`, atMs: base + DAY });
    events.push({ id: `E${w}d`, type: "work.completed", ticketId: `T${w}`, atMs: base + 2 * DAY });
  }
  return emptyInput({ events, tickets });
}

describe("forecast contract & language safety", () => {
  it("never emits causal or certainty language", () => {
    const result = buildForecasts(richInput());
    const all = [...result.forecasts, ...result.evidenceGaps];
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) {
      expect(violatesForecastLanguage(f)).toEqual([]);
      // Guardrail text ("this does not mean X will happen") legitimately
      // quotes forbidden phrasing in order to negate it; claims must not.
      const text = `${f.title} ${f.description}`.toLowerCase();
      for (const phrase of FORBIDDEN_FORECAST_PHRASES) {
        expect(text.includes(phrase)).toBe(false);
      }
    }
  });

  it("caps autonomy at prepare for every forecast type", () => {
    for (const type of FORECAST_TYPES) {
      const f = buildForecast(richInput(), type);
      expect(["observe", "explain", "recommend", "prepare"]).toContain(f.autonomy);
    }
  });

  it("always attaches an explicit outcome window and target outcome", () => {
    for (const type of FORECAST_TYPES) {
      const f = buildForecast(richInput(), type);
      expect(f.horizonDays).toBeGreaterThan(0);
      expect(f.targetOutcome.length).toBeGreaterThan(0);
      expect(Date.parse(f.expiresAt)).toBeGreaterThan(Date.parse(f.createdAt));
    }
  });
});

describe("insufficient forecast evidence is first-class", () => {
  it("returns insufficient_evidence for an empty account rather than a forecast", () => {
    const result = buildForecasts(emptyInput());
    expect(result.forecasts).toEqual([]);
    expect(result.evidenceGaps.length).toBeGreaterThan(0);
    for (const g of result.evidenceGaps) {
      expect(g.band).toBe("insufficient_evidence");
      expect(g.insufficientReason).toBeTruthy();
      expect(isElevated(g.band)).toBe(false);
    }
  });

  it("does not forecast from a single event", () => {
    const input = emptyInput({
      events: [{ id: "E1", type: "ticket.pulled", atMs: NOW - DAY }],
      tickets: [{ id: "T1", status: "open", createdAtMs: NOW - DAY }],
    });
    const result = buildForecasts(input);
    expect(result.forecasts.every((f) => f.band !== "highly_elevated")).toBe(true);
  });

  it("never reports insufficient evidence as low risk", () => {
    const g = buildForecasts(emptyInput()).evidenceGaps[0]!;
    expect(g.band).not.toBe("lower_than_usual");
  });
});

describe("temporal integrity", () => {
  it("state features only read facts at or before the anchor", () => {
    const input = richInput();
    const anchor = NOW - 30 * DAY;
    const withFuture = extractStateFeatures(input, anchor);
    const truncated = extractStateFeatures(
      {
        ...input,
        events: input.events.filter((e) => e.atMs <= anchor),
        tickets: input.tickets.filter((t) => (t.createdAtMs ?? 0) <= anchor),
      },
      anchor,
    );
    expect(withFuture).toEqual(truncated);
  });

  it("outcome observation only reads facts strictly after the anchor", () => {
    const input = richInput();
    const anchor = NOW - 60 * DAY;
    const features = extractStateFeatures(input, anchor);
    const before = observeOutcome(input, "follow_up_work", anchor, 7, features);
    const strippedPast = observeOutcome(
      {
        ...input,
        events: input.events.filter((e) => e.atMs > anchor),
        tickets: input.tickets.filter((t) => (t.createdAtMs ?? 0) > anchor),
      },
      "follow_up_work",
      anchor,
      7,
      features,
    );
    expect(before).toEqual(strippedPast);
  });

  it("censors comparable states whose window has not elapsed", () => {
    const input = richInput();
    const features = extractStateFeatures(input, input.now);
    expect(observeOutcome(input, "follow_up_work", input.now, 7, features)).toBe("unobserved");
  });
});

describe("determinism", () => {
  it("produces identical output for identical input", () => {
    const a = buildForecasts(richInput());
    const b = buildForecasts(richInput());
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe("forecast lifecycle reconciliation", () => {
  const mk = (id: string, band: ForecastObservation["band"]): ForecastObservation =>
    ({
      ...buildForecast(richInput(), "follow_up_work"),
      id,
      band,
    }) as ForecastObservation;

  it("marks first appearance as new and does not re-announce a stable band", () => {
    const first = reconcileForecasts(
      undefined,
      { forecasts: [mk("f1", "elevated")], evidenceGaps: [], generatedAt: "" },
      "ACC1",
      NOW,
    );
    expect(first.created).toHaveLength(1);
    expect(first.next.forecasts[0]!.trend).toBe("new");

    const second = reconcileForecasts(
      first.next,
      { forecasts: [mk("f1", "elevated")], evidenceGaps: [], generatedAt: "" },
      "ACC1",
      NOW + DAY,
    );
    expect(second.created).toHaveLength(0);
    expect(second.updated).toHaveLength(0);
    expect(second.next.forecasts[0]!.trend).toBe("stable");
  });

  it("announces a band change once and records history", () => {
    const first = reconcileForecasts(
      undefined,
      { forecasts: [mk("f1", "typical")], evidenceGaps: [], generatedAt: "" },
      "ACC1",
      NOW,
    );
    const second = reconcileForecasts(
      first.next,
      { forecasts: [mk("f1", "highly_elevated")], evidenceGaps: [], generatedAt: "" },
      "ACC1",
      NOW + DAY,
    );
    expect(second.updated).toHaveLength(1);
    expect(second.next.forecasts[0]!.trend).toBe("rising");
    expect(second.next.history[0]!.status).toBe("updated");
  });

  it("resolves forecasts that stop firing", () => {
    const first = reconcileForecasts(
      undefined,
      { forecasts: [mk("f1", "elevated")], evidenceGaps: [], generatedAt: "" },
      "ACC1",
      NOW,
    );
    const second = reconcileForecasts(
      first.next,
      { forecasts: [], evidenceGaps: [], generatedAt: "" },
      "ACC1",
      NOW + DAY,
    );
    expect(second.resolved).toHaveLength(1);
    expect(second.next.forecasts).toHaveLength(0);
    expect(second.next.history[0]!.status).toBe("resolved");
  });

  it("computes trajectory direction correctly", () => {
    expect(trendFor(undefined, "typical")).toBe("new");
    expect(trendFor("typical", "elevated")).toBe("rising");
    expect(trendFor("elevated", "typical")).toBe("declining");
    expect(trendFor("elevated", "elevated")).toBe("stable");
  });
});

describe("outcome evaluation & calibration", () => {
  it("does not grade a forecast whose horizon has not elapsed", () => {
    const input = richInput();
    const f = buildForecast(input, "follow_up_work");
    expect(evaluateElapsedForecasts([f], input)).toEqual([]);
  });

  it("grades elapsed forecasts and marks declined forecasts not_applicable", () => {
    const input = richInput();
    const base = buildForecast(input, "follow_up_work");
    const elapsed: ForecastObservation = {
      ...base,
      createdAt: new Date(NOW - 30 * DAY).toISOString(),
      expiresAt: new Date(NOW - 23 * DAY).toISOString(),
      band: "insufficient_evidence",
    };
    const graded = evaluateElapsedForecasts([elapsed], input);
    expect(graded).toHaveLength(1);
    expect(graded[0]!.outcome).toBe("not_applicable");
  });

  it("reports insufficient evaluation data instead of a fake accuracy figure", () => {
    const input = richInput();
    const f = buildForecast(input, "follow_up_work");
    const summary = summarizeForecastQuality([f], []);
    expect(summary.insufficientEvaluationData).toBe(true);
    for (const b of summary.byBand) expect(b.hitRate).toBeNull();
  });
});
