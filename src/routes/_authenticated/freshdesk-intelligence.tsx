import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Sparkles, Search, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  freshdeskSearch,
  freshdeskIntelligenceRank,
  type IntelCandidate,
  type IntelFilters,
  type IntelRanked,
} from "@/lib/api/freshdesk-search.functions";
import { FilterRow } from "@/components/freshdesk-intel/FilterRow";
import { ResultCard } from "@/components/freshdesk-intel/ResultCard";
import { SyncCheckPanel } from "@/components/freshdesk-intel/SyncCheckPanel";
import { ScanningState, EmptyState, ErrorState } from "@/components/freshdesk-intel/EmptyStates";

export const Route = createFileRoute("/_authenticated/freshdesk-intelligence")({
  head: () => ({
    meta: [
      { title: "Freshdesk Intelligence — Account Intel Hub" },
      { name: "description", content: "Natural-language search across Freshdesk tickets with AI summaries." },
    ],
  }),
  component: FreshdeskIntelligencePage,
});

function FreshdeskIntelligencePage() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<IntelFilters>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<IntelCandidate[]>([]);
  const [ranked, setRanked] = useState<IntelRanked[]>([]);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [ran, setRan] = useState(false);

  const onSearch = useCallback(async () => {
    if (!query.trim() && !filters.accountNumber) {
      toast.info("Type a search query or set a filter.");
      return;
    }
    setLoading(true);
    setError(null);
    setRan(true);
    setRanked([]);
    setAiNotice(null);
    try {
      const res = await freshdeskSearch({ data: { query, filters } });
      if (!res.ok) {
        setCandidates([]);
        setError(res.error ?? "Search failed.");
        return;
      }
      setCandidates(res.candidates);
      if (res.candidates.length === 0) return;
      const ai = await freshdeskIntelligenceRank({
        data: { query, candidates: res.candidates },
      });
      if (!ai.ok) {
        setAiNotice(ai.error ?? "AI summaries unavailable.");
        setRanked([]);
      } else {
        setRanked(ai.ranked);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }, [query, filters]);

  const merged = useMemo(() => {
    if (!candidates.length) return [];
    const acct = filters.accountNumber?.trim();
    const acctRe = acct
      ? new RegExp(`(?:^|[^0-9])${acct.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?:[^0-9]|$)`)
      : null;
    const matchesAccount = (c: IntelCandidate) => {
      if (!acct) return true;
      const t = c.ticket;
      if (t.accountNumber && t.accountNumber === acct) return true;
      return (
        (acctRe?.test(t.subject ?? "") ?? false) ||
        (acctRe?.test(t.description ?? "") ?? false) ||
        (acctRe?.test(c.excerpt ?? "") ?? false)
      );
    };
    const byNum = new Map(ranked.map((r) => [r.ticketNumber, r]));
    return candidates
      .filter(matchesAccount)
      .map((c) => ({ candidate: c, ranked: byNum.get(c.ticket.number) }))
      .sort((a, b) => (b.ranked?.confidence ?? 0) - (a.ranked?.confidence ?? 0));
  }, [candidates, ranked, filters.accountNumber]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.4))",
              boxShadow: "var(--shadow-glow-cyan)",
            }}
          >
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Freshdesk Intelligence</h1>
            <p className="text-xs text-muted-foreground">
              Natural-language search across live Freshdesk tickets. Read-only.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowDebug((v) => !v)}>
          <Wrench className="mr-1.5 h-4 w-4" />
          {showDebug ? "Hide" : "Show"} Sync Check
        </Button>
      </header>

      <div className="glass-panel space-y-3 p-4">
        <div className="flex gap-2">
          <Input
            placeholder='Try: "PLA outage last 3 nights for account 1234" or "stale Urgent tickets in Programming"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
          <Button onClick={onSearch} disabled={loading}>
            <Search className="mr-1.5 h-4 w-4" />
            {loading ? "Scanning…" : "Search"}
          </Button>
        </div>
        <FilterRow value={filters} onChange={setFilters} />
      </div>

      {showDebug && <SyncCheckPanel />}

      {loading && <ScanningState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && ran && candidates.length === 0 && <EmptyState />}

      {!loading && aiNotice && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          {aiNotice}
        </div>
      )}

      {!loading && merged.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {merged.map(({ candidate, ranked }) => (
            <ResultCard key={candidate.ticket.number} candidate={candidate} ranked={ranked} />
          ))}
        </div>
      )}
    </div>
  );
}