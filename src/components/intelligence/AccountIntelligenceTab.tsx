import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Wrench, History, Sparkles } from "lucide-react";
import { useAccountIntelligence } from "@/lib/core/account-intelligence";
import { ClaimInspector, type ClaimSource } from "./ClaimInspector";
import { AnomalyPanel } from "./AnomalyPanel";
import { OutlookPanel } from "./OutlookPanel";
import {
  filterTimeline,
  TIMELINE_CATEGORIES,
  type TimelineCategory,
  type TimelineItem,
} from "@/lib/core/account-timeline";
import type { PatternEvidenceRef, PatternObservation } from "@/lib/core/pattern-intelligence";

/**
 * Account Cortex — Intelligence tab (Phase 3, Parts 3/4/5/7/9).
 *
 * Extends the existing Account page. Clearly separates:
 *   CANONICAL FACT (timeline items, provenance "canonical")
 *   DERIVED OBSERVATION (pattern observations, via ClaimInspector)
 * AI SYNTHESIS is intentionally absent here — Phase 3 surfaces grounded,
 * deterministic intelligence only. Everything is evidence-linked and, where
 * derived, carries a confidence class the operator can give feedback on.
 */

function evidenceToSources(refs: PatternEvidenceRef[]): ClaimSource[] {
  return refs.map((r) =>
    r.type === "ticket"
      ? {
          label: `Ticket ${r.id}`,
          to: "/freshdesk-tickets/$ticketId/work",
          params: { ticketId: r.id },
        }
      : { label: `${r.type} ${r.id}` },
  );
}

function toneFor(sev: PatternObservation["severity"]): "info" | "notice" | "elevated" {
  return sev;
}

function SectionHeader({ icon: Icon, label }: { icon: typeof Activity; label: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </h3>
    </div>
  );
}

export function AccountIntelligenceTab({ accountNumber }: { accountNumber: string }) {
  const intel = useAccountIntelligence(accountNumber);
  const [filter, setFilter] = useState<TimelineCategory | "all">("all");
  const [showFixes, setShowFixes] = useState(false);

  const visibleTimeline = useMemo(
    () => filterTimeline(intel.timeline, filter).slice(0, 40),
    [intel.timeline, filter],
  );

  if (intel.loading && !intel.hasPack) {
    return <p className="text-sm text-muted-foreground">Assembling account intelligence…</p>;
  }

  return (
    <div className="space-y-6">
      {/* EARLY WARNING — deviation from baseline (Phase 5) */}
      <AnomalyPanel result={intel.anomalies} />

      {/* OUTLOOK — comparable-state forecasting (Phase 6). Deliberately kept
          separate from anomalies: deviation ≠ outlook. */}
      <OutlookPanel result={intel.forecasts} />

      {/* DERIVED OBSERVATIONS — pattern intelligence */}
      <section>
        <SectionHeader icon={Activity} label="Observations (derived)" />
        {intel.observations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No operational patterns observed for this account yet. Observations appear as recurring
            behavior or temporal associations accumulate — never invented.
          </p>
        ) : (
          <div className="space-y-2">
            {intel.observations.map((o) => (
              <ClaimInspector
                key={o.id}
                title={o.title}
                status={o.confidence.toUpperCase()}
                basis={o.description}
                lastObserved={o.lastObservedAt}
                tone={toneFor(o.severity)}
                sources={evidenceToSources(o.evidenceRefs)}
                feedback={{
                  targetType: "pattern",
                  targetId: o.id,
                  accountId: accountNumber,
                  patternType: o.patternType,
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* WHAT FIXED THIS BEFORE? */}
      <section>
        <SectionHeader icon={Wrench} label="What fixed this before?" />
        {intel.whatFixed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No prior resolutions recorded for this account.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowFixes((s) => !s)}
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Sparkles
                className="h-3.5 w-3.5"
                style={{ color: "var(--intel-accent)" }}
                aria-hidden
              />
              {showFixes ? "Hide" : `Show ${intel.whatFixed.length} relevant resolution(s)`}
            </button>
            {showFixes && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground/80">
                  Investigative evidence — verify before applying; not a directive.
                </p>
                {intel.whatFixed.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border p-3"
                    style={{ borderColor: "var(--surface-border)", background: "var(--surface-1)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {r.problem}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {r.verification}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{r.resolution}</p>
                    <div className="mt-1 text-[10px] text-muted-foreground/70">
                      {r.basis} · {new Date(r.date).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* CANONICAL TIMELINE */}
      <section>
        <SectionHeader icon={History} label="Intelligence timeline (canonical)" />
        <div className="mb-2 flex flex-wrap gap-1">
          {(["all", ...TIMELINE_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={`rounded-full border px-2 py-0.5 text-[10px] capitalize transition ${
                filter === c
                  ? "border-transparent text-foreground"
                  : "border-border/50 text-muted-foreground hover:text-foreground"
              }`}
              style={
                filter === c
                  ? { background: "color-mix(in oklab, var(--intel-accent) 16%, transparent)" }
                  : undefined
              }
            >
              {c}
            </button>
          ))}
        </div>
        {visibleTimeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded events for this filter.</p>
        ) : (
          <ol className="space-y-1.5">
            {visibleTimeline.map((item) => (
              <TimelineRow key={item.id} item={item} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const body = (
    <div
      className="flex items-start gap-2 rounded-md border p-2"
      style={{ borderColor: "var(--surface-border)", background: "var(--surface-1)" }}
    >
      <span
        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          background:
            item.provenance === "canonical" ? "var(--intel-accent)" : "var(--status-warning)",
        }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-foreground">{item.title}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {item.atIso ? new Date(item.atIso).toLocaleDateString() : ""}
          </span>
        </div>
        {item.detail && <p className="truncate text-[11px] text-muted-foreground">{item.detail}</p>}
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60">
          {item.category} · {item.provenance}
        </span>
      </div>
    </div>
  );
  return (
    <li>
      {item.link ? (
        <Link
          to={item.link.to as never}
          params={(item.link.params ?? {}) as never}
          className="block"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}
