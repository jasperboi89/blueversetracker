import { useState } from "react";
import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/role-context";
import { useAgentRuns } from "@/lib/agent/agent-store";

/**
 * Phase 17 — admin view of recent bounded agent runs.
 *
 * Shows the governed loop cycle by cycle: which intent the model produced,
 * which single capability it was allowed to invoke, what was blocked and why,
 * and the stop reason. No payloads, no prompts, no evidence bodies.
 */
export function AgentRunInspector() {
  const isAdmin = useIsAdmin();
  const runs = useAgentRuns();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  if (!isAdmin) return null;

  const detail = selected ? runs.find((r) => r.task.id === selected) : null;

  return (
    <div className="rounded-md border border-border/30 bg-white/[0.02]">
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Bot className="h-3 w-3" /> Agent runs
        <span className="ml-auto">{runs.length ? `${runs.length} recent` : "none this session"}</span>
      </button>

      {open && (
        <div className="max-h-72 space-y-2 overflow-auto border-t border-border/30 p-2 text-[11px] text-muted-foreground">
          {runs.length === 0 && <div>No bounded runs have been started in this session.</div>}
          {runs.map((r) => (
            <button
              key={r.task.id}
              onClick={() => setSelected(r.task.id === selected ? null : r.task.id)}
              className="block w-full truncate text-left hover:text-foreground"
            >
              {r.state === "completed" ? "✓" : r.state === "awaiting_confirmation" ? "⧗" : "✗"} {r.task.mode} ·{" "}
              {r.usage.cycles} cycles · {r.usage.capabilityCalls} calls · {r.state}
              {r.stopReason ? ` · ${r.stopReason}` : ""}
            </button>
          ))}

          {detail && (
            <div className="space-y-1 rounded border border-border/30 p-2">
              <div className="font-medium text-foreground/80">
                {detail.task.id} · {detail.task.mode}
              </div>
              <div className="break-words">{detail.task.objective}</div>
              <div>
                correlation {detail.task.correlationId} · context {detail.task.contextRef}
              </div>
              <div>
                Budget: {detail.usage.cycles}/{detail.budget.maxCycles} cycles ·{" "}
                {detail.usage.capabilityCalls}/{detail.budget.maxCapabilityCalls} calls ·{" "}
                {detail.usage.searches}/{detail.budget.maxSearches} searches · {detail.usage.elapsedMs}ms
              </div>
              {detail.stopNote && <div>{detail.stopNote}</div>}
              {detail.cycles.map((c) => (
                <div key={c.cycle} className="break-words">
                  {c.cycle}. {c.intentKind}
                  {c.capabilityId ? ` · ${c.capabilityId}` : ""} · {c.progressed ? "progress" : "no progress"}
                  {c.blocked ? ` · BLOCKED ${c.blocked.reasonCodes.join(",")}` : ""}
                </div>
              ))}
              {detail.observations.map((o) => (
                <div key={o.id} className="break-words">
                  obs {o.id} · {o.status} · {o.origin}/{o.confidence} · {o.facts.length} facts
                  {o.withheldFacts.length ? ` · ${o.withheldFacts.length} withheld` : ""}
                </div>
              ))}
              {detail.proposal && (
                <div>Prepared proposal: {detail.proposal.actionType} — awaiting your confirmation.</div>
              )}
              {detail.question && <div>Needs operator: {detail.question}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}