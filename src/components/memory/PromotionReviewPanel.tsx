import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  canPreparePromotion,
  type CuratedMemoryCandidate,
  type PromotionPacket,
} from "@/lib/curator/curator-contract";
import { allowedOperations } from "@/lib/curator/promotion-packet";
import { useCuratedCandidates, usePromotionHistory } from "@/lib/curator/curator-store";
import {
  approvePromotion,
  confirmMemoryAccuracy,
  preparePromotion,
  type PromotionChoice,
} from "@/lib/curator/promotion-service";
import { runCurationPass, summarizePass } from "@/lib/curator/curator-runtime";

/**
 * Knowledge promotion review. The Curator only ever proposes — nothing on this
 * surface writes to the Vault or Resolution Memory without an explicit choice,
 * and confirming that a memory is accurate is kept separate from approving
 * reusable guidance.
 */
export function PromotionReviewPanel() {
  const candidates = useCuratedCandidates();
  const history = usePromotionHistory();
  const [openId, setOpenId] = useState<string | null>(null);
  const [packet, setPacket] = useState<PromotionPacket | null>(null);
  const [busy, setBusy] = useState(false);

  const queue = useMemo(
    () =>
      candidates
        .filter((c) => c.lifecycle !== "dismissed" && c.lifecycle !== "merged")
        .sort((a, b) => rank(b) - rank(a))
        .slice(0, 40),
    [candidates],
  );

  async function open(c: CuratedMemoryCandidate) {
    setOpenId(c.id);
    setPacket(null);
    setBusy(true);
    const prepared = await preparePromotion(c.id);
    setBusy(false);
    if (!prepared) {
      toast.message("No safe promotion proposal could be built for this one yet.");
      setOpenId(null);
      return;
    }
    setPacket(prepared.packet);
  }

  async function decide(p: PromotionPacket, choice: PromotionChoice) {
    setBusy(true);
    const result = await approvePromotion(p, choice);
    setBusy(false);
    toast[result.ok ? "success" : "error"](result.message);
    if (result.ok) {
      setOpenId(null);
      setPacket(null);
    }
  }

  return (
    <section className="glass-panel rounded-xl border border-border/60 p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Promotion review</h2>
          <p className="text-sm text-muted-foreground">
            Patterns the portal noticed across real work. Nothing becomes knowledge until you say so.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.message(`Curation: ${summarizePass(runCurationPass()).join(", ")}`)}
        >
          Re-check patterns
        </Button>
      </header>

      {queue.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to review. Candidates appear once the same situation shows up across several shifts.
        </p>
      ) : (
        <ul className="space-y-3">
          {queue.map((c) => (
            <li key={c.id} className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="rounded border border-border/60 px-1.5 py-0.5">{c.type.replace(/_/g, " ")}</span>
                <span className="rounded border border-border/60 px-1.5 py-0.5">{c.lifecycle.replace(/_/g, " ")}</span>
                <span className="rounded border border-border/60 px-1.5 py-0.5">{c.reality.confidence}</span>
                <span>
                  seen {c.support.episodeCount}× · {c.support.accountCount} account
                  {c.support.accountCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-sm font-medium">{c.title}</p>
              <p className="text-sm text-muted-foreground">{c.proposedStatement}</p>
              {c.blockReason && (
                <p className="text-xs text-destructive">
                  Blocked: {c.blockReason.replace(/_/g, " ")} — resolve this before promoting.
                </p>
              )}

              {openId === c.id && packet ? (
                <PacketView packet={packet} busy={busy} onDecide={decide} onClose={() => setOpenId(null)} />
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" disabled={busy || !canPreparePromotion(c)} onClick={() => void open(c)}>
                    Review proposal
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      confirmMemoryAccuracy(c.id);
                      toast.success("Marked accurate — that confirms the episode, not a reusable procedure.");
                    }}
                  >
                    This is accurate
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Promotion history ({history.length})</summary>
          <ul className="mt-2 space-y-1">
            {history.slice(0, 20).map((h) => (
              <li key={h.id}>
                {new Date(h.at).toLocaleString()} — {h.operation} → {h.destination.replace(/_/g, " ")} ({h.status})
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PacketView({
  packet,
  busy,
  onDecide,
  onClose,
}: {
  packet: PromotionPacket;
  busy: boolean;
  onDecide: (p: PromotionPacket, choice: PromotionChoice) => void;
  onClose: () => void;
}) {
  const ops = allowedOperations(packet);
  const account = packet.relatedAccounts[0]?.id ?? "";
  const target = packet.targetId ?? packet.currentKnowledgeMatches[0]?.sourceId ?? "";

  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{packet.proposedKnowledge.title}</p>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{packet.proposedKnowledge.summary}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 text-xs">
        <div>
          <p className="font-medium">Why it's ready</p>
          <ul className="list-disc pl-4 text-muted-foreground">
            {packet.readinessSignals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium">Supporting work</p>
          <ul className="list-disc pl-4 text-muted-foreground">
            {packet.supportingMemories.slice(0, 6).map((m) => (
              <li key={m.memoryId}>
                {m.title} — {new Date(m.occurredAt).toLocaleDateString()} ({m.confidence})
              </li>
            ))}
          </ul>
        </div>
      </div>

      {packet.conflicts.length > 0 && (
        <p className="text-xs text-destructive">
          {packet.conflicts.length} conflicting evidence item(s). Promotion stays blocked until resolved.
        </p>
      )}

      {packet.diff && packet.diff.length > 0 && (
        <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed">
          {packet.diff.map((l, i) => (
            <div
              key={i}
              className={
                l.kind === "added"
                  ? "text-emerald-500"
                  : l.kind === "removed"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            >
              {l.kind === "added" ? "+ " : l.kind === "removed" ? "- " : "  "}
              {l.text}
            </div>
          ))}
        </pre>
      )}

      <div className="flex flex-wrap gap-2">
        {ops.includes("create") && packet.suggestedDestination === "knowledge_vault" && (
          <Button size="sm" disabled={busy} onClick={() => onDecide(packet, { operation: "create", destination: "knowledge_vault" })}>
            Create Vault draft
          </Button>
        )}
        {ops.includes("create") && packet.suggestedDestination === "resolution_memory" && account && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onDecide(packet, { operation: "create", destination: "resolution_memory", accountNumber: account })}
          >
            Save as verified fix
          </Button>
        )}
        {ops.includes("update") && target && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide(packet, { operation: "update", noteId: target })}>
            Update existing note
          </Button>
        )}
        {ops.includes("merge") && target && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide(packet, { operation: "merge", noteId: target })}>
            Merge into note
          </Button>
        )}
        {ops.includes("supersede") && target && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide(packet, { operation: "supersede", noteId: target })}>
            Supersede note
          </Button>
        )}
        {ops.includes("reinforce") && target && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide(packet, { operation: "reinforce", resolutionId: target })}>
            Reinforce resolution
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide(packet, { operation: "keep_as_memory" })}>
          Keep as memory only
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide(packet, { operation: "dismiss" })}>
          Not useful
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function rank(c: CuratedMemoryCandidate): number {
  const stage =
    c.lifecycle === "review_ready" ? 4 : c.lifecycle === "recurring" ? 3 : c.lifecycle === "supported" ? 2 : 1;
  return stage * 100 + c.support.episodeCount;
}
