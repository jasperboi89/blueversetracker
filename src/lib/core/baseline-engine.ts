/**
 * Phase 5 — Baseline engine.
 *
 * Robust statistics only: median, MAD and IQR. Means and standard deviations
 * are deliberately NOT used — a single 40-ticket night would drag a mean
 * baseline up far enough to hide the next real spike, and would simultaneously
 * inflate the standard deviation so nothing ever looks unusual again.
 *
 * Everything here is pure: same inputs → same outputs, no clock reads beyond
 * the `now` passed in, no I/O.
 */

import {
  ANOMALY_CONFIG,
  ANOMALY_DAY_MS,
  type BaselineMethod,
  type BaselineSummary,
  type InsufficientReason,
} from "./anomaly-contract";

/* ------------------------------------------------------------------ */
/* Robust statistics                                                    */
/* ------------------------------------------------------------------ */

/** Linear-interpolated quantile over a copy of the values. 0 ≤ q ≤ 1. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * Math.min(Math.max(q, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** Interquartile range (Q3 − Q1). */
export function iqr(values: readonly number[]): number {
  return quantile(values, 0.75) - quantile(values, 0.25);
}

/** Median absolute deviation from the median. */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/** Consistency constants that put MAD/IQR on a comparable, normal-ish scale. */
const MAD_SCALE = 1.4826;
const IQR_SCALE = 1.349;

/* ------------------------------------------------------------------ */
/* Bucketing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Count timestamps into consecutive day-wide buckets ending at `now`.
 * Returns oldest → newest, length `days`. Bucket `days - 1` is the trailing
 * 24 hours (the "current" period most detectors evaluate).
 */
export function dailyBuckets(timesMs: readonly number[], now: number, days: number): number[] {
  const buckets = new Array<number>(Math.max(days, 0)).fill(0);
  if (buckets.length === 0) return buckets;
  for (const t of timesMs) {
    if (!Number.isFinite(t) || t > now) continue;
    const age = Math.floor((now - t) / ANOMALY_DAY_MS);
    if (age < 0 || age >= days) continue;
    const idx = days - 1 - age;
    buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}

/* ------------------------------------------------------------------ */
/* Baselines                                                            */
/* ------------------------------------------------------------------ */

export interface Baseline {
  /** "established" means deviation scoring is meaningful. */
  established: boolean;
  reason?: InsufficientReason;
  summary: BaselineSummary;
}

export interface BaselineOptions {
  metric: string;
  windowDays: number;
  minSamples?: number;
  minActivePeriods?: number;
  /** Treat every sample as "active" (e.g. duration samples, which are never 0). */
  allSamplesActive?: boolean;
}

/**
 * Build a baseline from a set of period samples. A baseline is only
 * ESTABLISHED when there is enough history, enough non-empty periods, and
 * measurable dispersion. Otherwise the caller must emit an
 * "insufficient_baseline" signal — never an anomaly.
 */
export function buildBaseline(samples: readonly number[], opts: BaselineOptions): Baseline {
  const minSamples = opts.minSamples ?? ANOMALY_CONFIG.minBaselineDays;
  const minActive = opts.minActivePeriods ?? ANOMALY_CONFIG.minActivePeriods;

  const med = median(samples);
  const madValue = mad(samples);
  const iqrValue = iqr(samples);
  const nonZero = opts.allSamplesActive ? samples.length : samples.filter((v) => v > 0).length;

  let method: BaselineMethod = "none";
  let scale = 0;
  if (madValue > 0) {
    method = "mad";
    scale = madValue * MAD_SCALE;
  } else if (iqrValue > 0) {
    method = "iqr";
    scale = iqrValue / IQR_SCALE;
  }

  const summary: BaselineSummary = {
    metric: opts.metric,
    windowDays: opts.windowDays,
    sampleCount: samples.length,
    nonZeroCount: nonZero,
    median: round(med),
    mad: round(madValue),
    iqr: round(iqrValue),
    scale: round(scale),
    method,
  };

  if (samples.length < minSamples) {
    return { established: false, reason: "too_few_samples", summary };
  }
  if (nonZero < minActive) {
    return { established: false, reason: "too_few_active_periods", summary };
  }
  if (method === "none") {
    return { established: false, reason: "no_dispersion", summary };
  }
  return { established: true, summary };
}

/**
 * Iglewicz–Hoaglin modified z-score against an established baseline.
 * Returns null when the baseline has no usable scale.
 */
export function robustZ(observed: number, baseline: Baseline): number | null {
  const { median: med, scale } = baseline.summary;
  if (!baseline.established || scale <= 0) return null;
  return round((observed - med) / scale);
}

/** observed / median, or null when the median is zero. */
export function ratioToBaseline(observed: number, baseline: Baseline): number | null {
  const med = baseline.summary.median;
  return med > 0 ? round(observed / med) : null;
}

/**
 * Sorted ascending gaps (ms) between consecutive event times. Fewer than two
 * timestamps yields an empty list — there is no interval to speak of.
 */
export function intervalsMs(timesMs: readonly number[]): number[] {
  const sorted = [...timesMs].filter(Number.isFinite).sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) out.push(sorted[i]! - sorted[i - 1]!);
  return out;
}

function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}
