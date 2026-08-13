import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, RefreshCw, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findKnowledge } from "@/lib/retrieval/retrieval-service";
import {
  SOURCE_TYPE_LABEL,
  type RetrievalResponse,
  type RetrievalResult,
} from "@/lib/retrieval/retrieval-types";
import { formatCentralShort } from "@/lib/shift";

interface Props {
  /** What the operator is working on right now. */
  query: string;
  accountNumber?: string;
  autoRun?: boolean;
}

function MatchTags({ result }: { result: RetrievalResult }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
      {result.matchedBy.map((m) => (
        <span key={m} className="rounded border border-border/40 px-1 py-px">
          {m}
        </span>
      ))}
    </span>
  );
}

/**
 * "Have we seen this before?" — hybrid retrieval over the operator's own
 * resolutions, change records and runbooks. Always shows why a result matched
 * and where it came from; never invents an answer.
 */
export function SimilarPriorWorkPanel({ query, accountNumber, autoRun = true }: Props) {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<RetrievalResponse | null>(null);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setRes(
      await findKnowledge({
        query: q.slice(0, 400),
        ...(accountNumber ? { accountNumber } : {}),
        limit: 6,
      }),
    );
    setLoading(false);
  }, [query, accountNumber]);

  useEffect(() => {
    if (autoRun) void run();
  }, [autoRun, run]);

  return (
    <section className="glass-panel space-y-3 rounded-xl p-4">
      <header className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: "var(--violet-glow)" }} />
        <h3 className="font-display text-sm font-semibold">Similar prior work</h3>
        {res && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {res.modeUsed === "hybrid" ? "hybrid" : "keyword only"}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2"
          onClick={() => void run()}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </header>

      {res?.warnings.map((w) => (
        <p key={w} className="text-xs text-muted-foreground">
          {w}
        </p>
      ))}

      {!loading && res && res.results.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing similar in your indexed work yet.
        </p>
      )}

      <ul className="space-y-2">
        {(res?.results ?? []).map((r) => (
          <li
            key={`${r.sourceType}:${r.sourceId}:${r.chunkId ?? ""}`}
            className="rounded-lg border border-border/40 bg-white/[0.02] p-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-white/[0.06] px-1.5 py-px text-[10px] uppercase tracking-wide">
                {SOURCE_TYPE_LABEL[r.sourceType]}
              </span>
              {r.confidence === "verified" && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-300/90">
                  <ShieldCheck className="h-3 w-3" /> verified
                </span>
              )}
              {r.sourceStatus === "superseded" && (
                <span className="text-[10px] text-amber-300/80">superseded</span>
              )}
              {r.accountNumber && (
                <span className="text-[10px] text-muted-foreground">acct {r.accountNumber}</span>
              )}
              {r.sourceUpdatedAt && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
                  <Clock className="h-3 w-3" />
                  {formatCentralShort(new Date(r.sourceUpdatedAt))}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium">{r.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{r.snippet}</p>
            <div className="mt-1.5">
              <MatchTags result={r} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
