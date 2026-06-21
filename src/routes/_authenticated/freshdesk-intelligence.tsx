import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Sparkles, Search, Wrench, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  freshdeskSearch,
  type IntelFilters,
  type IntelResult,
  type SearchDebug,
} from "@/lib/api/freshdesk-search.functions";
import { FilterRow } from "@/components/freshdesk-intel/FilterRow";
import { ResultCard } from "@/components/freshdesk-intel/ResultCard";
import { SearchDebugPanel } from "@/components/freshdesk-intel/SearchDebugPanel";
import { ScanningState, EmptyState, ErrorState } from "@/components/freshdesk-intel/EmptyStates";
import { useIsAdmin } from "@/lib/auth/role-context";

export const Route = createFileRoute("/_authenticated/freshdesk-intelligence")({
  head: () => ({
    meta: [
      { title: "Freshdesk Intelligence — Account Intel Hub" },
      {
        name: "description",
        content: "AI-assisted Freshdesk search across live tickets with grouped results.",
      },
    ],
  }),
  component: FreshdeskIntelligencePage,
});

function FreshdeskIntelligencePage() {
  const isAdmin = useIsAdmin();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<IntelFilters>({ dateRange: { kind: "all" } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strong, setStrong] = useState<IntelResult[]>([]);
  const [possible, setPossible] = useState<IntelResult[]>([]);
  const [mentions, setMentions] = useState<IntelResult[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [debug, setDebug] = useState<SearchDebug | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [ran, setRan] = useState(false);

  const onSearch = useCallback(async () => {
    if (!query.trim() && !filters.accountNumber) {
      toast.info("Type a search query or set a filter.");
      return;
    }
    setLoading(true);
    setError(null); setRan(true);
    setStrong([]); setPossible([]); setMentions([]);
    setNotice(null); setAiNotice(null);
    try {
      const res = await freshdeskSearch({ data: { query, filters } });
      if (!res.ok) {
        setError(res.error ?? "Search failed.");
        if (res.debug) setDebug(res.debug);
        return;
      }
      setStrong(res.strong);
      setPossible(res.possible);
      setMentions(res.relatedMentions);
      setNotice(res.notice ?? null);
      setAiNotice(res.aiNotice ?? null);
      setDebug(res.debug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }, [query, filters]);

  const totalResults = strong.length + possible.length + mentions.length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.4))",
              boxShadow: "var(--shadow-glow-cyan)",
            }}
          >
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Freshdesk Intelligence</h1>
            <p className="text-xs text-muted-foreground">
              AI-assisted search across live Freshdesk tickets. Read-only.
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={() => setShowDebug((v) => !v)}>
            <Wrench className="mr-1.5 h-4 w-4" />
            {showDebug ? "Hide" : "Show"} Search Debug
          </Button>
        )}
      </header>

      <div className="glass-panel space-y-3 p-4">
        <div className="flex gap-2">
          <Input
            placeholder='Try: "PLA outage last 3 nights" or "stale Urgent tickets in Programming". Use Account # for exact account search.'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
          />
          <Button onClick={onSearch} disabled={loading}>
            <Search className="mr-1.5 h-4 w-4" />
            {loading ? "Scanning…" : "Search"}
          </Button>
        </div>
        <FilterRow value={filters} onChange={setFilters} />
      </div>

      {isAdmin && showDebug && <SearchDebugPanel lastDebug={debug} />}

      {loading && <ScanningState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && ran && totalResults === 0 && <EmptyState />}

      {!loading && notice && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100">
          {notice}
        </div>
      )}
      {!loading && aiNotice && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          {aiNotice}
        </div>
      )}

      {!loading && strong.length > 0 && (
        <GroupSection label="Strong Matches" count={strong.length} accent="emerald">
          {strong.map((r) => (
            <ResultCard
              key={r.candidate.ticket.number}
              candidate={r.candidate}
              ranked={r.ranked}
              inclusionReason={r.inclusionReason}
            />
          ))}
        </GroupSection>
      )}

      {!loading && possible.length > 0 && (
        <GroupSection label="Possible Matches" count={possible.length} accent="amber">
          {possible.map((r) => (
            <ResultCard
              key={r.candidate.ticket.number}
              candidate={r.candidate}
              ranked={r.ranked}
              inclusionReason={r.inclusionReason}
            />
          ))}
        </GroupSection>
      )}

      {!loading && mentions.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowMentions((v) => !v)}
            className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={"h-3.5 w-3.5 transition " + (showMentions ? "" : "-rotate-90")} />
            Related Mentions ({mentions.length})
          </button>
          {showMentions && (
            <div className="grid grid-cols-1 gap-3">
              {mentions.map((r) => (
                <ResultCard
                  key={r.candidate.ticket.number}
                  candidate={r.candidate}
                  ranked={r.ranked}
                  inclusionReason={r.inclusionReason}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupSection({
  label,
  count,
  accent,
  children,
}: {
  label: string;
  count: number;
  accent: "emerald" | "amber";
  children: React.ReactNode;
}) {
  const color = accent === "emerald" ? "var(--cyan-glow, #22d3ee)" : "var(--gold-glow, #f59e0b)";
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-8 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {label} <span className="text-foreground/70">({count})</span>
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3">{children}</div>
    </section>
  );
}
