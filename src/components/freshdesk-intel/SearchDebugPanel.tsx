import { useEffect, useState } from "react";
import { Wrench, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  freshdeskSyncCheck,
  freshdeskAccountCoverage,
  type SearchDebug,
  type AccountCoverageReport,
} from "@/lib/api/freshdesk-search.functions";
import {
  freshdeskIndexStatus,
  freshdeskSyncIndexBatch,
  type FreshdeskIndexStatus,
} from "@/lib/api/freshdesk-index.functions";

type SyncReport = {
  found: boolean;
  subject: boolean;
  description: boolean;
  customFields: boolean;
  tags: boolean;
  account: boolean;
  notes: boolean;
  conversationCount: number;
  conversationPages: number;
  latestConversationAt: number | null;
  lastSyncAt: number;
  errors: string[];
  fullyIndexed: boolean;
};

export function SearchDebugPanel({ lastDebug }: { lastDebug: SearchDebug | null }) {
  return (
    <div className="glass-panel space-y-4 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Wrench className="h-4 w-4" /> Search Debug (admin)
      </div>

      <Section title="Last search">
        {lastDebug ? <DebugView debug={lastDebug} /> : <Muted>No search run yet.</Muted>}
      </Section>

      <Section title="Intelligence index (last 6 months)">
        <IndexManager />
      </Section>

      <Section title="Account coverage test">
        <AccountCoverageTester />
      </Section>

      <Section title="Per-ticket content coverage">
        <ContentCoverageTester />
      </Section>
    </div>
  );
}

function DebugView({ debug }: { debug: SearchDebug }) {
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      <Row label="Mode">{debug.mode}</Row>
      <Row label="Data source">
        {debug.dataSource === "freshdesk-index"
          ? "persistent Freshdesk intelligence index"
          : "live Freshdesk API"}
      </Row>
      <Row label="Date range">{debug.dateRangeLabel}</Row>
      <Row label="Freshdesk query">
        <code className="break-all text-foreground/90">{debug.freshdeskQuery || "—"}</code>
      </Row>
      <Row label="Account field detected">{debug.accountFieldDetected ?? "none"}</Row>
      <Row label="Filters applied">
        <code className="text-foreground/90">{debug.filters}</code>
      </Row>
      <Row label="Tickets scanned">{debug.scanned}</Row>
      <Row label="Excluded before AI">
        {debug.excludedBeforeAi}
        {debug.exclusions.length > 0 && (
          <span className="ml-1 text-muted-foreground">
            ({debug.exclusions.map((e) => `${e.count} ${e.reason}`).join("; ")})
          </span>
        )}
      </Row>
      <Row label="Sent to AI">{debug.sentToAi}</Row>
      <Row label="Conversations pulled">
        {debug.conversationsPulled} across {debug.conversationPages} pages
      </Row>
      <Row label="Pagination truncated">{debug.paginationTruncated ? "yes" : "no"}</Row>
      {debug.indexDocumentCount !== undefined && (
        <Row label="Indexed tickets">{debug.indexDocumentCount}</Row>
      )}
      {debug.indexCompletedAt !== undefined && (
        <Row label="Index last completed">
          {debug.indexCompletedAt ? new Date(debug.indexCompletedAt).toLocaleString() : "not yet"}
        </Row>
      )}
      <Row label="Result counts">
        Strong {debug.groupCounts.strong} · Possible {debug.groupCounts.possible} · Mentions{" "}
        {debug.groupCounts.relatedMentions}
      </Row>
      {debug.skippedFields && debug.skippedFields.length > 0 && (
        <li>
          <div className="text-foreground">Custom fields skipped for account matching:</div>
          <ul className="ml-3 mt-1 space-y-0.5">
            {debug.skippedFields.map((s) => (
              <li key={s.name}>
                <code className="text-foreground/90">{s.name}</code> — {s.reason}
              </li>
            ))}
          </ul>
        </li>
      )}
      {debug.apiErrors && debug.apiErrors.length > 0 && (
        <li>
          <div className="text-rose-300">Freshdesk API errors:</div>
          <ul className="ml-3 mt-1 space-y-0.5 text-rose-200">
            {debug.apiErrors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </li>
      )}
      {debug.inclusionReasons.length > 0 && (
        <li>
          <div className="text-foreground">Why each result was included:</div>
          <ul className="ml-3 mt-1 space-y-0.5">
            {debug.inclusionReasons.map((r) => (
              <li key={r.ticketNumber}>
                <span className="font-mono text-foreground">#{r.ticketNumber}</span>{" "}
                <span className="rounded border border-white/10 bg-white/5 px-1 text-[10px] uppercase tracking-wider">
                  {r.group}
                </span>{" "}
                — {r.reason}
              </li>
            ))}
          </ul>
        </li>
      )}
      {debug.notes.length > 0 && (
        <li>
          <div className="text-foreground">Notes:</div>
          <ul className="ml-3 mt-1 space-y-0.5">
            {debug.notes.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        </li>
      )}
    </ul>
  );
}

function IndexManager() {
  const [status, setStatus] = useState<FreshdeskIndexStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = async () => {
    const next = await freshdeskIndexStatus();
    setStatus(next);
    return next;
  };

  useEffect(() => {
    void refreshStatus().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not check index status.");
    });
  }, []);

  const sync = async (rebuild: boolean) => {
    setLoading(true);
    setError(null);
    setProgress(rebuild ? "Starting a clean all-ticket index…" : "Checking for ticket updates…");
    try {
      let first = true;
      for (let batch = 0; batch < 3000; batch += 1) {
        const result = await freshdeskSyncIndexBatch({ data: { rebuild: rebuild && first } });
        first = false;
        if (!result.ok) {
          if (result.rateLimited) {
            const cooldownMs = Math.min(
              Math.max(result.retryAfterMs ?? 60_000, 30_000) + 5_000,
              125_000,
            );
            setProgress(
              `Freshdesk quota reached. Cooling down for ${Math.ceil(cooldownMs / 1000)} seconds, then resuming automatically…`,
            );
            await new Promise((resolve) => setTimeout(resolve, cooldownMs));
            continue;
          }
          throw new Error(result.error);
        }
        setProgress(
          `Indexed ${result.ticketsIndexed} ticket(s) and ${result.conversationsIndexed} conversation item(s)…`,
        );
        if (result.completed) break;
        // Server batches are intentionally paced so the initial build does
        // not consume the entire Freshdesk API quota in a burst.
        await new Promise((resolve) => setTimeout(resolve, 4_000));
      }
      const next = await refreshStatus();
      setProgress(
        next.completed
          ? `Index ready. ${next.documentCount} tickets are searchable.`
          : `Sync paused at page ${next.nextPage}. Run refresh again to continue.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Index sync failed.");
      await refreshStatus().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => refreshStatus()} disabled={loading}>
          Check status
        </Button>
        <Button size="sm" onClick={() => sync(false)} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Build / refresh index
        </Button>
        <Button size="sm" variant="ghost" onClick={() => sync(true)} disabled={loading}>
          Rebuild from scratch
        </Button>
      </div>
      {progress && <div className="text-cyan-200">{progress}</div>}
      {error && <div className="text-rose-300">{error}</div>}
      {status && (
        <ul className="space-y-1">
          <Row label="Index available">{status.available ? "yes" : "no"}</Row>
          <Row label="Searchable tickets">{status.documentCount}</Row>
          <Row label="Full sync complete">{status.completed ? "yes" : "no"}</Row>
          <Row label="Current page">{status.nextPage}</Row>
          <Row label="Last completed">
            {status.completedAt ? new Date(status.completedAt).toLocaleString() : "not yet"}
          </Row>
          {(status.lastError || status.error) && (
            <li className="text-amber-300">Last warning: {status.lastError ?? status.error}</li>
          )}
        </ul>
      )}
      {status && (!status.available || status.documentCount === 0) && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-amber-200">
          Full conversation search is not active. Apply the Supabase migrations, then click Build /
          refresh index. Until this is ready, an empty search result is not authoritative.
        </div>
      )}
      <div>
        The first build walks tickets updated within the last six months and stores their subject,
        description, custom fields, requester details, replies, and private/public notes for fast
        read-only search. Older indexed tickets are removed automatically.
      </div>
    </div>
  );
}

function AccountCoverageTester() {
  const [num, setNum] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AccountCoverageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!num.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await freshdeskAccountCoverage({ data: { accountNumber: num.trim() } });
      if (!res.ok) setError(res.error);
      else setReport(res.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coverage check failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          className="h-8 w-40"
          placeholder="Account #"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Check coverage
        </Button>
      </div>
      {error && <div className="text-xs text-rose-300">{error}</div>}
      {report && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          <Row label="Scope">
            <span className={report.scope === "six-months" ? "text-emerald-300" : "text-amber-300"}>
              {report.scope === "six-months"
                ? "Full six-month window scanned"
                : "Limited subset (pagination truncated)"}
            </span>
          </Row>
          <Row label="Account field">{report.accountFieldDetected ?? "none detected"}</Row>
          <Row label="Exact query">
            <code className="break-all text-foreground/90">{report.exactQuery ?? "—"}</code>
          </Row>
          <Row label="Exact matches">
            {report.exactTotal} ticket(s) across {report.exactPages} page(s)
            {report.exactTruncated && " (truncated)"}
          </Row>
          <Row label="Oldest / Newest">
            {report.oldest ? new Date(report.oldest).toLocaleDateString() : "—"} →{" "}
            {report.newest ? new Date(report.newest).toLocaleDateString() : "—"}
          </Row>
          <Row label="Mention scan">
            {report.mentionsScanned} ticket(s) scanned
            {report.mentionsPagesTruncated && " (truncated)"}
          </Row>
          {report.errors.length > 0 && (
            <li className="text-rose-300">Errors: {report.errors.join("; ")}</li>
          )}
          {report.notes.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContentCoverageTester() {
  const [num, setNum] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!num.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await freshdeskSyncCheck({ data: { number: num.trim() } });
      if (!res.ok) setError(res.error);
      else setReport(res.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          className="h-8 w-40"
          placeholder="Ticket #"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Check ticket content
        </Button>
      </div>
      {error && <div className="text-xs text-rose-300">{error}</div>}
      {report && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          <Item ok={report.found} label="Ticket found in Freshdesk" />
          <Item ok={report.subject} label="Subject present" />
          <Item ok={report.description} label="Description present" />
          <Item ok={report.customFields} label="Custom fields present" />
          <Item ok={report.tags} label="Tags present" />
          <Item ok={report.account} label="Account/company metadata present" />
          <Item
            ok={report.notes}
            label={`Notes / replies / conversation body (${report.conversationCount} across ${report.conversationPages} pages)`}
          />
          <li>
            Latest conversation:{" "}
            <span className="text-foreground">
              {report.latestConversationAt
                ? new Date(report.latestConversationAt).toLocaleString()
                : "—"}
            </span>
          </li>
          <Item ok={report.fullyIndexed} label="Fully indexed for AI search" />
          {report.errors.length > 0 && (
            <li className="text-rose-300">Errors: {report.errors.join("; ")}</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={"h-3 w-3 transition " + (open ? "rotate-90" : "")} />
        {title}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="text-foreground">{label}:</span> <span>{children}</span>
    </li>
  );
}
function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted-foreground">{children}</div>;
}
function Item({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li>
      <span className={ok ? "text-emerald-300" : "text-rose-300"}>{ok ? "✓" : "✗"}</span>{" "}
      <span className="text-foreground">{label}</span>
    </li>
  );
}
