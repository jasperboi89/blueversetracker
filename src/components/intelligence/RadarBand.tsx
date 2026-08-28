import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Radar as RadarIcon, ArrowUpRight } from "lucide-react";
import {
  anomaliesToRadar,
  forecastsToRadar,
  rankRadar,
  type RadarCategory,
  type RadarItem,
  type RadarSeverity,
} from "@/lib/core/operational-radar";
import { useAccountCortexState } from "@/lib/core/account-cortex-store";
import { allAnomalies, useAnomalyState } from "@/lib/core/anomaly-store";
import { allForecasts, useForecastState } from "@/lib/core/forecast-store";
import { useRecurringRows } from "@/lib/reports/recurring-issues";
import { useIntelligenceFeedback, suppressedRadarIds } from "@/lib/core/intelligence-feedback";
import type { ConfidenceClass, PatternType } from "@/lib/core/pattern-intelligence";

/**
 * Operational Radar band for the Command Center (Phase 3, Part 6).
 *
 * A SMALL, ranked, grounded set of observations — not a dashboard. It is built
 * only from real signals: persisted Account Cortex observations (recorded when
 * accounts were evaluated) and the existing recurring-issues signal. Items the
 * operator marked not-relevant/incorrect/etc. are suppressed. When there is
 * nothing meaningful, it renders a calm empty state — never manufactured
 * activity.
 */

const PATTERN_TO_CATEGORY: Record<PatternType, RadarCategory> = {
  repeated_issue: "recurring",
  repeated_work: "recurring",
  escalation: "recurring",
  reopen: "recurring",
  change_incident_proximity: "change_followup",
  resolution_reuse: "resolution_match",
};

function severityOf(s: string): RadarSeverity {
  return s === "elevated" || s === "notice" ? s : "info";
}

function useRadarItems(): RadarItem[] {
  const cortex = useAccountCortexState();
  const anomalyState = useAnomalyState();
  const forecastState = useForecastState();
  const recurring = useRecurringRows();
  const feedback = useIntelligenceFeedback();

  return useMemo(() => {
    const now = new Date().toISOString();
    const items: RadarItem[] = [];
    // Accounts already covered by a specific recurring-category pattern item —
    // used to suppress the coarse recurring-rows item so the same account is not
    // surfaced twice.
    const recurringCovered = new Set<string>();

    for (const rec of Object.values(cortex.byAccount)) {
      for (const o of rec.observations) {
        const category = PATTERN_TO_CATEGORY[o.patternType] ?? "recurring";
        if (category === "recurring") recurringCovered.add(rec.accountId);
        items.push({
          id: `radar:${o.id}`,
          category,
          accountId: rec.accountId,
          title: o.title,
          detail: `${o.evidenceIds.length} related event${o.evidenceIds.length === 1 ? "" : "s"}`,
          severity: severityOf(o.severity),
          confidence: o.confidence as ConfidenceClass,
          sourceCount: o.evidenceIds.length,
          evidenceRefs: o.evidenceIds.map((e) => {
            const [type, ...rest] = e.split(":");
            return { type: (type ?? "event") as never, id: rest.join(":") };
          }),
          observationId: o.id,
          generatedAt: now,
        });
      }
    }

    for (const r of recurring) {
      if (!r.active) continue;
      if (recurringCovered.has(r.accountNumber)) continue;
      items.push({
        id: `radar:recurring:${r.accountNumber}`,
        category: "recurring",
        accountId: r.accountNumber,
        title: `Account ${r.accountNumber} — recurring issues`,
        detail: `${r.rollingCount} in 30 days (${r.sixMonthCount} in 6 months)`,
        severity: "elevated",
        confidence: "supported",
        sourceCount: r.rollingCount,
        evidenceRefs: [{ type: "account", id: r.accountNumber }],
        generatedAt: new Date(r.lastIssueAt).toISOString(),
      });
    }

    // Phase 5 deviations. Baseline-gap signals are deliberately excluded —
    // "we are still learning" is never an attention item.
    items.push(...anomaliesToRadar(allAnomalies(anomalyState)));

    // Phase 6 outlook. Ranked BELOW current problems by design, and only when
    // the engine produced an actual band — evidence gaps never appear here.
    items.push(...forecastsToRadar(allForecasts(forecastState), Date.now()));

    return rankRadar(items, suppressedRadarIds(feedback));
  }, [cortex, anomalyState, forecastState, recurring, feedback]);
}

const CATEGORY_LABEL: Record<RadarCategory, string> = {
  recurring: "Recurring",
  change_followup: "Change follow-up",
  resolution_match: "Resolution match",
  workload: "Workload",
  anomaly: "Anomaly",
  forecast: "Outlook",
  system: "System",
};

const SEVERITY_COLOR: Record<RadarSeverity, string> = {
  elevated: "var(--status-critical)",
  notice: "var(--status-warning)",
  info: "var(--status-info)",
};

export function RadarBand() {
  const items = useRadarItems();

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <RadarIcon className="h-4 w-4" style={{ color: "var(--intel-accent)" }} aria-hidden />
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Intelligence
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing needs attention right now. Grounded observations appear here as operational
          patterns emerge.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <div
                className="flex items-center gap-3 rounded-md border p-2.5"
                style={{
                  borderColor: "var(--surface-border)",
                  background: "var(--surface-1)",
                  boxShadow: `inset 3px 0 0 ${SEVERITY_COLOR[item.severity]}`,
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/60">
                      {CATEGORY_LABEL[item.category]}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{item.detail}</p>
                </div>
                {item.accountId && (
                  <Link
                    to="/accounts/$accountNumber"
                    params={{ accountNumber: item.accountId }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Inspect <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
