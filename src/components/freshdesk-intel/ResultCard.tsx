import { useState } from "react";
import { ExternalLink, ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { nightPlanStore } from "@/lib/night-plan-store";
import {
  freshdeskPullFullConversations,
  type IntelCandidate,
  type IntelRanked,
} from "@/lib/api/freshdesk-search.functions";

function signalColor(s?: IntelRanked["signal"]) {
  switch (s) {
    case "urgent": return "border-rose-400/50 bg-rose-500/10 text-rose-200";
    case "stale": return "border-amber-400/50 bg-amber-500/10 text-amber-200";
    case "ready-to-close": return "border-emerald-400/50 bg-emerald-500/10 text-emerald-200";
    case "duplicate": return "border-violet-400/50 bg-violet-500/10 text-violet-200";
    default: return "border-white/10 bg-white/5 text-muted-foreground";
  }
}

function confidenceLabel(c?: number) {
  if (c == null) return "—";
  if (c >= 0.75) return "High";
  if (c >= 0.45) return "Medium";
  return "Low";
}

export function ResultCard({
  candidate,
  ranked,
}: {
  candidate: IntelCandidate;
  ranked?: IntelRanked;
}) {
  const t = candidate.ticket;
  const [opening, setOpening] = useState(false);

  const openInFreshdesk = async () => {
    setOpening(true);
    try {
      // Lazily warm full conversations so downstream tooling has the thread.
      await freshdeskPullFullConversations({ data: { number: t.number } }).catch(() => undefined);
      window.open(t.freshdeskUrl, "_blank", "noopener");
    } finally {
      setOpening(false);
    }
  };

  const addToNightPlan = () => {
    const task = `FD #${t.number} — ${t.subject}`;
    const notes = [
      ranked?.suggestedAction ? `Action: ${ranked.suggestedAction}` : "",
      ranked?.issue ? `Issue: ${ranked.issue}` : "",
      `Link: ${t.freshdeskUrl}`,
    ].filter(Boolean).join("\n");
    const priority = ranked?.signal === "urgent" ? "must" : "normal";
    nightPlanStore.add(task, notes, priority);
    toast.success("Added to Night Plan");
  };

  return (
    <article className="glass-panel space-y-3 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">#{t.number}</span>
            {t.accountNumber && <span>· acct {t.accountNumber}</span>}
            {t.accountName && <span className="truncate">· {t.accountName}</span>}
          </div>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-foreground">{t.subject}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]">
          <Badge>{t.status}</Badge>
          {t.priority && <Badge>{t.priority}</Badge>}
          {t.groupName && <Badge>{t.groupName}</Badge>}
          {t.agentName && <Badge>{t.agentName}</Badge>}
          <Badge>upd {new Date(t.updatedAt).toLocaleDateString()}</Badge>
        </div>
      </header>

      {ranked ? (
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={"rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider " + signalColor(ranked.signal)}>
              {ranked.signal}
            </span>
            <span className="text-muted-foreground">Confidence: <span className="text-foreground">{confidenceLabel(ranked.confidence)}</span></span>
            {ranked.owner && <span className="text-muted-foreground">Owner: <span className="text-foreground">{ranked.owner}</span></span>}
          </div>
          {ranked.matchReason && <Row label="Why">{ranked.matchReason}</Row>}
          {ranked.issue && <Row label="Issue">{ranked.issue}</Row>}
          {ranked.latestUpdate && <Row label="Latest">{ranked.latestUpdate}</Row>}
          {ranked.suggestedAction && <Row label="Action">{ranked.suggestedAction}</Row>}
          {ranked.snippet && (
            <blockquote className="border-l-2 border-cyan-400/50 pl-2 italic text-muted-foreground">
              "{ranked.snippet}"
            </blockquote>
          )}
        </div>
      ) : (
        candidate.excerpt && (
          <p className="line-clamp-3 text-xs text-muted-foreground">{candidate.excerpt}</p>
        )
      )}

      <footer className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={openInFreshdesk} disabled={opening}>
          {opening ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
          Open in Freshdesk
        </Button>
        <Button size="sm" onClick={addToNightPlan}>
          <ListPlus className="mr-1.5 h-3.5 w-3.5" />
          Add to Night Plan
        </Button>
      </footer>
    </article>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-muted-foreground">
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="mr-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}:</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}