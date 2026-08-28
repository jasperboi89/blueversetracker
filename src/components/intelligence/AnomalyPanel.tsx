import { AlertTriangle, Hourglass } from "lucide-react";
import { ClaimInspector, type ClaimSource } from "./ClaimInspector";
import {
  ANOMALY_TYPE_LABEL,
  INSUFFICIENT_REASON_LABEL,
  type AnomalySignal,
} from "@/lib/core/anomaly-contract";
import type { AnomalyResult } from "@/lib/core/anomaly-engine";
import { useAnomalyState } from "@/lib/core/anomaly-store";
import { ANOMALY_TYPE_LABEL as TYPE_LABEL } from "@/lib/core/anomaly-contract";

/**
 * Phase 5 — Early Warning surface for one account.
 *
 * Two visually distinct zones, because they are epistemically different:
 *
 *   DEVIATIONS   — behavior measurably outside an established baseline.
 *   BASELINE     — the system explicitly saying it does not know yet.
 *
 * The second zone is quiet and non-alarming by design. It exists so "no
 * anomalies" is never mistaken for "everything is normal" when the truth is
 * "there is not enough history to tell".
 */

function evidenceToSources(a: AnomalySignal): ClaimSource[] {
  return a.evidenceRefs
    .filter((r) => r.type === "ticket")
    .slice(0, 8)
    .map((r) => ({
      label: `Ticket ${r.id}`,
      to: "/freshdesk-tickets/$ticketId/work",
      params: { ticketId: r.id },
    }));
}

function basisFor(a: AnomalySignal): string {
  const b = a.baseline;
  const z = a.deviation.robustZ;
  const stat =
    b.method === "none"
      ? "no dispersion measured"
      : `${b.method.toUpperCase()} spread ${b.method === "mad" ? b.mad : b.iqr}`;
  return `${a.description} Baseline: median ${b.median} ${b.metric} over ${b.sampleCount} period(s), ${b.nonZeroCount} active, ${stat}${z != null ? `, robust score ${z}` : ""}.`;
}

export function AnomalyPanel({ result }: { result: AnomalyResult }) {
  const { anomalies, baselineGaps } = result;
  const accountId = anomalies[0]?.accountId ?? baselineGaps[0]?.accountId ?? "";
  const persisted = useAnomalyState().byAccount[accountId];
  const history = (persisted?.history ?? []).slice(0, 5);

  return (
    <section className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Deviations from baseline
          </h3>
        </div>
        {anomalies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is measurably outside this account&apos;s established baselines. Deviations
            appear here only when there is enough history to compare against.
          </p>
        ) : (
          <div className="space-y-2">
            {anomalies.map((a) => (
              <ClaimInspector
                key={a.id}
                title={a.title}
                status={`${ANOMALY_TYPE_LABEL[a.anomalyType]} · ${a.confidence.toUpperCase()}`}
                basis={basisFor(a)}
                lastObserved={a.lastObservedAt}
                tone={a.severity}
                sources={evidenceToSources(a)}
                feedback={{
                  targetType: "observation",
                  targetId: a.id,
                  accountId: a.accountId,
                  patternType: a.anomalyType,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
            Resolved history
          </h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {history.map((h) => (
              <li key={`${h.id}:${h.at}`}>
                {TYPE_LABEL[h.anomalyType as keyof typeof TYPE_LABEL] ?? h.anomalyType} — no longer
                deviating as of {new Date(h.at).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {baselineGaps.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Hourglass className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden />
            <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
              Baseline still forming
            </h3>
          </div>
          <ul className="space-y-1.5">
            {baselineGaps.map((g) => (
              <li
                key={g.id}
                className="rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground"
                style={{ borderColor: "var(--surface-border)", background: "var(--surface-1)" }}
              >
                <span className="font-medium text-foreground/80">
                  {ANOMALY_TYPE_LABEL[g.anomalyType]}
                </span>{" "}
                — {g.description}
                {g.insufficientReason && (
                  <span className="text-muted-foreground/70">
                    {" "}
                    ({INSUFFICIENT_REASON_LABEL[g.insufficientReason]})
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted-foreground/60">
            These are not findings. They record that history is too thin to judge deviation — the
            system is not claiming behavior is normal.
          </p>
        </div>
      )}
    </section>
  );
}
