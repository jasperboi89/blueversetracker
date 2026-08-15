import { useState } from "react";
import { Activity, ChevronDown, ChevronRight } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/role-context";
import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import { isSafeForOperationalGuidance } from "@/lib/core/evidence-contract";
import { realityLabel } from "@/lib/core/reality-boundary";

/**
 * Context Inspector — admin-only view of the Portal Context Envelope.
 *
 * Shows the *shape* of what the AI receives: location, active entities,
 * blockers, awareness, evidence ids/types/provenance and budget metadata.
 * Deliberately never renders ticket bodies, note bodies, caller data or the
 * account summary text — this is the nervous system, not a data dump.
 */
export function ContextInspector({ envelope }: { envelope: PortalContextEnvelope }) {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;

  const e = envelope;
  const sources = Array.from(new Set(e.evidence.map((x) => x.sourceType)));
  const facts = e.facts ?? [];
  const conflicts = e.evidenceConflicts ?? [];

  return (
    <div className="rounded-md border border-border/30 bg-white/[0.02]">
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Activity className="h-3 w-3" /> Context inspector
        <span className="ml-auto">
          {e.location.routeId}
          {e.active.ticket ? ` · ticket ${e.active.ticket.id}` : ""}
          {e.evidence.length ? ` · ${e.evidence.length} evidence` : ""}
        </span>
      </button>

      {open && (
        <div className="max-h-64 space-y-2 overflow-auto border-t border-border/30 p-2 text-[11px] text-muted-foreground">
          <Row label="Generated" value={e.generatedAt} />
          <Row label="Shift" value={e.shiftKey} />
          <Row
            label="Location"
            value={`${e.location.area}/${e.location.routeId}${e.location.entityId ? ` · ${e.location.entityType} ${e.location.entityId}` : ""}`}
          />
          <Row
            label="Active"
            value={
              [
                e.active.ticket && `ticket ${e.active.ticket.id}${e.active.ticket.onScreen ? "" : " (offscreen)"}`,
                e.active.account && `account ${e.active.account.id} [${e.active.account.origin}]`,
                e.active.workItem && `work ${e.active.workItem.id}`,
                e.active.dispatch && `dispatch ${e.active.dispatch.id}`,
                e.active.knowledgeNote && `note ${e.active.knowledgeNote.id}`,
              ]
                .filter(Boolean)
                .join(" · ") || "none"
            }
          />
          <Row
            label="Work state"
            value={`${e.workState.running ? "timer running" : "timer idle"} · unsaved ${
              e.workState.unsavedChanges ? e.workState.unsavedEntities.join("/") : "no"
            }${e.workState.editMode ? " · edit mode" : ""}`}
          />
          <Row label="Blockers" value={e.blockers.map((b) => `${b.type}:${b.label}`).join(" · ") || "none"} />
          <Row label="Awareness" value={e.awareness.map((a) => `${a.severity}`).join(" · ") || "none"} />
          <Row
            label="Account context"
            value={
              e.accountContext
                ? `${e.accountContext.accountNumber} · ${e.accountContext.freshness} · ${e.accountContext.counts.recentTickets}t/${e.accountContext.counts.knownFixes}f${
                    e.accountContext.unavailable.length ? ` · missing ${e.accountContext.unavailable.join(",")}` : ""
                  }`
                : "not attached"
            }
          />
          <Row label="Evidence sources" value={sources.join(", ") || "none"} />
          <div>
            <div className="font-medium text-foreground/80">Evidence ({e.evidence.length})</div>
            {e.evidence.slice(0, 12).map((ev) => (
              <div key={ev.id} className="truncate">
                • {ev.sourceType}:{ev.sourceId} — {ev.origin}
                {ev.confidence ? `/${ev.confidence}` : ""}
                {ev.freshness ? `/${ev.freshness}` : ""}
              </div>
            ))}
            {e.evidence.length === 0 && <div>none attached</div>}
          </div>
          <Row
            label="Budget"
            value={`available ${e.budget.evidenceAvailable}${
              e.budget.assemblyMs !== undefined ? ` · assembled in ${e.budget.assemblyMs}ms` : ""
            } · trimming happens server-side against the router budget`}
          />
          <div>
            <div className="font-medium text-foreground/80">Reality boundary ({facts.length})</div>
            {facts.slice(0, 14).map((f) => (
              <div key={f.id} className="truncate">
                {isSafeForOperationalGuidance(f) ? "✓" : "·"} {realityLabel(f)} {f.subject.type}:{f.subject.id} —{" "}
                {f.predicate} = {String(f.value)}
              </div>
            ))}
            {facts.length === 0 && <div>no facts projected</div>}
          </div>
          <div>
            <div className="font-medium text-foreground/80">Conflicts ({conflicts.length})</div>
            {conflicts.map((c) => (
              <div key={c.id} className="break-words">
                • {c.subject.type}:{c.subject.id} {c.predicate} —{" "}
                {c.values.map((v) => `"${v.value}" (${v.origin}/${v.confidence})`).join(" vs ")}
              </div>
            ))}
            {conflicts.length === 0 && <div>none detected</div>}
          </div>
          <div>
            <div className="font-medium text-foreground/80">Warnings ({e.warnings.length})</div>
            {e.warnings.map((w, i) => (
              <div key={`${w.code}-${i}`}>• {w.code}{w.source ? ` (${w.source})` : ""}</div>
            ))}
            {e.warnings.length === 0 && <div>none</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 font-medium text-foreground/80">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}
