/**
 * Activation 7 — Intelligence evidence legend.
 *
 * A small, honest key for the portal-wide evidence vocabulary so operators can
 * read every intelligence surface (Radar, Outlook, Investigations, Script Twin)
 * with the same meaning. Colour is never the only signal — each state pairs an
 * icon and a word. This is presentation only; it asserts nothing about any
 * account and manufactures no data.
 */

import { EVIDENCE_STATES } from "@/lib/script/twin/evidence-state";
import { EvidenceBadge } from "@/components/knowledge/is-scripts/twin/twin-components";

export function IntelligenceLegend() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Evidence key
        </h3>
        <span className="font-mono text-[10.5px] text-muted-foreground/70">
          how sure the system is — colour is never the only signal
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EVIDENCE_STATES.map((state) => (
          <EvidenceBadge key={state} state={state} />
        ))}
      </div>
      <p className="mt-2 font-mono text-[10.5px] text-muted-foreground/70">
        Green (Verified) is reserved for confirmed facts. “Insufficient history” means the system is
        still gathering real evidence — never a fabricated result.
      </p>
    </div>
  );
}
