import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  isPendingReview,
  type OperationalMemory,
} from "@/lib/memory/memory-contract";
import {
  archiveMemory,
  promoteMemory,
  rejectMemory,
  useOperationalMemories,
} from "@/lib/memory/memory-store";
import { captureEpisode } from "@/lib/memory/memory-runtime";

/**
 * "Learned from work" — the operator review surface for the Operational
 * Memory Cortex. Episodes are read-only history; candidates are proposals
 * that only become reusable knowledge when a human accepts them.
 */
export function OperationalMemoryPanel() {
  const memories = useOperationalMemories();
  const [tab, setTab] = useState<"candidates" | "episodes">("candidates");

  const candidates = useMemo(() => memories.filter(isPendingReview), [memories]);
  const episodes = useMemo(
    () => memories.filter((m) => m.class === "episodic" || m.status === "promoted").slice(0, 25),
    [memories],
  );
  const list = tab === "candidates" ? candidates : episodes;

  return (
    <section className="glass-panel rounded-xl border border-border/60 p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Learned from work</h2>
          <p className="text-sm text-muted-foreground">
            Experience captured from real shifts. Candidates stay unverified until you accept them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={tab === "candidates" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("candidates")}
          >
            Candidates ({candidates.length})
          </Button>
          <Button
            variant={tab === "episodes" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("episodes")}
          >
            Episodes ({episodes.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const saved = captureEpisode({ trigger: "manual_capture", minTransitions: 1 });
              toast[saved ? "success" : "message"](
                saved ? "Captured this stretch of work to memory." : "Not enough tracked activity to remember yet.",
              );
            }}
          >
            Remember current work
          </Button>
        </div>
      </header>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Memory is compiled when work is completed or a change is verified.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((m) => (
            <MemoryRow key={m.id} memory={m} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemoryRow({ memory: m }: { memory: OperationalMemory }) {
  const pending = isPendingReview(m);
  return (
    <li className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="rounded border border-border/60 px-1.5 py-0.5">{m.class.replace(/_/g, " ")}</span>
        <span className="rounded border border-border/60 px-1.5 py-0.5">{m.status}</span>
        <span className="rounded border border-border/60 px-1.5 py-0.5">{m.confidence}</span>
        <span>{new Date(m.occurredAt).toLocaleString()}</span>
      </div>
      <p className="text-sm font-medium">{m.title}</p>
      <p className="text-sm text-muted-foreground">{m.summary}</p>
      {m.evidence.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Sources: {m.evidence.map((e) => `${e.sourceType}${e.sourceId ? `:${e.sourceId}` : ""}`).join(", ")}
        </p>
      )}
      {pending && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => {
              promoteMemory(m.id);
              toast.success("Promoted — this is now confirmed, reusable knowledge.");
            }}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              rejectMemory(m.id);
              toast.message("Rejected — it stays as history and will not be reused.");
            }}
          >
            Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={() => archiveMemory(m.id)}>
            Archive
          </Button>
        </div>
      )}
    </li>
  );
}