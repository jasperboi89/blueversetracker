import { useState } from "react";
import { TrendingUp, ChevronDown, Telescope } from "lucide-react";
import {
  FORECAST_BAND_LABEL,
  FORECAST_TYPE_LABEL,
  HORIZON_LABEL,
  INSUFFICIENT_FORECAST_LABEL,
  isElevated,
  type ForecastObservation,
} from "@/lib/core/forecast-contract";
import type { ForecastResult } from "@/lib/core/forecast-engine";

/**
 * OUTLOOK (Phase 6) — comparable-state forecasting, kept visually and verbally
 * distinct from CURRENT FACT and from ANOMALY (Phase 5). Nothing here claims
 * certainty or causality: every card states its outcome window, how many
 * comparable states it rests on, and what it does NOT mean.
 */

function bandStyle(f: ForecastObservation): { color: string; bg: string } {
  if (f.band === "insufficient_evidence")
    return { color: "var(--muted-foreground)", bg: "transparent" };
  if (f.band === "highly_elevated")
    return {
      color: "var(--status-danger, var(--destructive))",
      bg: "color-mix(in oklab, var(--status-danger, var(--destructive)) 12%, transparent)",
    };
  if (f.band === "elevated")
    return {
      color: "var(--status-warning)",
      bg: "color-mix(in oklab, var(--status-warning) 12%, transparent)",
    };
  return {
    color: "var(--intel-accent)",
    bg: "color-mix(in oklab, var(--intel-accent) 10%, transparent)",
  };
}

const TREND_LABEL: Record<ForecastObservation["trend"], string> = {
  new: "New",
  rising: "Rising",
  stable: "Stable",
  declining: "Declining",
};

function ForecastCard({ forecast: f }: { forecast: ForecastObservation }) {
  const [open, setOpen] = useState(false);
  const style = bandStyle(f);

  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--surface-border)", background: "var(--surface-1)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ color: style.color, background: style.bg }}
            >
              {FORECAST_BAND_LABEL[f.band]}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {HORIZON_LABEL[f.horizon]} · {f.confidence} confidence · {TREND_LABEL[f.trend]}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{f.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-full border border-border/50 p-1 text-muted-foreground hover:text-foreground"
          aria-label={open ? "Hide forecast basis" : "Show forecast basis"}
          aria-expanded={open}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--surface-border)" }}>
          <Block label="Outcome window">
            <p className="text-xs text-muted-foreground">
              {HORIZON_LABEL[f.horizon]} — {f.targetOutcome}
            </p>
          </Block>

          <Block label="Current state">
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {f.currentStateSummary.map((s) => (
                <li key={s}>· {s}</li>
              ))}
            </ul>
          </Block>

          <Block label="Comparable states">
            {f.band === "insufficient_evidence" ? (
              <p className="text-xs text-muted-foreground">
                {f.insufficientReason
                  ? INSUFFICIENT_FORECAST_LABEL[f.insufficientReason]
                  : "Not enough comparable history to forecast."}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {f.outcomes.comparableCount} comparable state
                {f.outcomes.comparableCount === 1 ? "" : "s"} found ·{" "}
                {f.outcomes.observedCount} with an elapsed outcome window ·{" "}
                {f.outcomes.occurredCount} followed by the outcome
                {f.outcomes.unobservedCount > 0
                  ? ` · ${f.outcomes.unobservedCount} window(s) not yet elapsed`
                  : ""}
                .
              </p>
            )}
          </Block>

          {f.band !== "insufficient_evidence" && f.comparables.length > 0 && (
            <Block label="Why these states matched">
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {[...new Set(f.comparables.flatMap((c) => c.matchedOn))].slice(0, 6).map((m) => (
                  <li key={m}>· {m}</li>
                ))}
              </ul>
            </Block>
          )}

          {(f.supportingAnomalyIds.length > 0 || f.supportingPatternIds.length > 0) && (
            <Block label="Supporting signals">
              <p className="text-xs text-muted-foreground">
                {f.supportingAnomalyIds.length} current anomaly signal
                {f.supportingAnomalyIds.length === 1 ? "" : "s"} ·{" "}
                {f.supportingPatternIds.length} recorded pattern
                {f.supportingPatternIds.length === 1 ? "" : "s"} present in this state. These are
                inputs to the comparison, not the forecast itself.
              </p>
            </Block>
          )}

          {f.scriptContext && (
            <Block label="Script context">
              <p className="text-xs text-muted-foreground">
                Structural read {Math.round(f.scriptContext.coverage * 100)}% ·{" "}
                {f.scriptContext.unresolvedCount} unresolved reference
                {f.scriptContext.unresolvedCount === 1 ? "" : "s"}. Structure only — no script
                content is used.
              </p>
            </Block>
          )}

          {f.recommendations.length > 0 && (
            <Block label="Suggested preparation (operator decides)">
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {f.recommendations.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            </Block>
          )}

          {f.uncertaintyReducers.length > 0 && (
            <Block label="What would sharpen this">
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {f.uncertaintyReducers.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            </Block>
          )}

          <Block label="What this does not mean">
            <p className="text-xs text-muted-foreground/90">{f.whatThisDoesNotMean}</p>
          </Block>
        </div>
      )}
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
        {label}
      </div>
      {children}
    </div>
  );
}

export function OutlookPanel({ result }: { result: ForecastResult }) {
  const ranked = [...result.forecasts].sort(
    (a, b) => Number(isElevated(b.band)) - Number(isElevated(a.band)),
  );

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Telescope className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Outlook (comparable states)
        </h3>
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No outlook for this account. Forecasts appear only when comparable past states exist —
          nothing is projected from a single event.
        </p>
      ) : (
        <div className="space-y-2">
          {ranked.map((f) => (
            <ForecastCard key={f.id} forecast={f} />
          ))}
        </div>
      )}

      {result.evidenceGaps.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-muted-foreground/70" aria-hidden />
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              Insufficient forecast evidence
            </span>
          </div>
          <ul className="space-y-1">
            {result.evidenceGaps.map((g) => (
              <li key={g.id} className="text-xs text-muted-foreground">
                {FORECAST_TYPE_LABEL[g.forecastType]} —{" "}
                {g.insufficientReason
                  ? INSUFFICIENT_FORECAST_LABEL[g.insufficientReason]
                  : "not enough comparable history yet"}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-muted-foreground/70">
            This is a healthy state, not a failure — the system declines to forecast rather than
            guess.
          </p>
        </div>
      )}
    </section>
  );
}
