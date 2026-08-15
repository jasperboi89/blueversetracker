import { useState } from "react";
import { AlertTriangle, Ban, Check, ChevronDown, ChevronRight, Compass, Hourglass, X } from "lucide-react";
import { useNextBestAction } from "@/lib/nba/use-next-best-action";
import type { NextBestAction } from "@/lib/nba/nba-contract";

/**
 * Phase 14 — quiet Next-Best-Action surface.
 *
 * One primary suggestion, never a flood. Writable suggestions only *prepare* a
 * Safe Action proposal; this component never mutates anything itself.
 */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function Reasoning({ action }: { action: NextBestAction }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Why this?
      </button>
      {open && (
        <div className="mt-1 space-y-1 rounded-md border border-border/30 bg-white/[0.02] p-2 text-[11px] text-muted-foreground">
          <p>{action.explanation}</p>
          <ul className="list-disc pl-4">
            {action.reasonCodes.map((c) => (
              <li key={c}>{c.replace(/_/g, " ").toLowerCase()}</li>
            ))}
          </ul>
          {action.evidenceRefs.length > 0 && <p>Evidence: {action.evidenceRefs.join(", ")}</p>}
          {action.missingEvidence.length > 0 && (
            <p>Missing evidence: {action.missingEvidence.map((m) => m.label).join("; ")}</p>
          )}
          {action.whatWouldChangeThis.length > 0 && (
            <p>
              This would change if: {action.whatWouldChangeThis.join("; ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function NextBestActionCard({ onPrepare }: { onPrepare?: (action: NextBestAction) => void }) {
  const { result, complete, dismiss } = useNextBestAction();

  const header = (
    <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      <Compass className="h-3 w-3" /> Next best action
    </h3>
  );

  if (result.outcome === "wait") {
    return (
      <section aria-label="Next best action" className="space-y-1">
        {header}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Hourglass className="mt-0.5 h-3 w-3 shrink-0" />
          {result.waitReason}
        </p>
      </section>
    );
  }

  if (result.outcome === "no_recommendation" || !result.primary) {
    return (
      <section aria-label="Next best action" className="space-y-1">
        {header}
        <p className="text-xs text-muted-foreground">{result.noRecommendationReason}</p>
        {result.missingEvidence.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Missing: {result.missingEvidence.slice(0, 2).map((m) => m.label).join("; ")}
          </p>
        )}
        {result.blocked.length > 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Ban className="mt-0.5 h-3 w-3 shrink-0" />
            {result.blocked[0].title} — {result.blocked[0].blockers[0]?.label ?? "blocked"}
          </p>
        )}
      </section>
    );
  }

  const p = result.primary;
  return (
    <section aria-label="Next best action" className="space-y-1">
      {header}
      <div className="rounded-md border border-border/40 bg-white/[0.02] p-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-foreground">{p.title}</p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="Mark as checked"
              title="Mark as checked"
              onClick={() => complete(p.fingerprint)}
              className="rounded-full border border-border/40 p-1 text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label="Dismiss suggestion"
              title="Not relevant"
              onClick={() => dismiss(p.fingerprint, "not_relevant")}
              className="rounded-full border border-border/40 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Chip>{p.kind}</Chip>
          <Chip>{p.confidence} confidence</Chip>
          <Chip>evidence {p.evidenceConfidence}</Chip>
          <Chip>risk {p.risk}</Chip>
        </div>
        <Reasoning action={p} />
        {p.proposedSafeAction && (
          <button
            type="button"
            onClick={() => onPrepare?.(p)}
            className="mt-1 rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Prepare action (needs your confirmation)
          </button>
        )}
      </div>
      {result.alternatives.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Alternative: {result.alternatives[0].title}
        </p>
      )}
      {result.blocked.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Blocked: {result.blocked[0].title} — {result.blocked[0].blockers[0]?.label ?? "blocked"}
        </p>
      )}
    </section>
  );
}