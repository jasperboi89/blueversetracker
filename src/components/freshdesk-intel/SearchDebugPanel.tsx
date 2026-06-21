import { useState } from "react";
import { Wrench, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  freshdeskSyncCheck,
  freshdeskAccountCoverage,
  type SearchDebug,
  type AccountCoverageReport,
} from "@/lib/api/freshdesk-search.functions";

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

      <Section title="Account coverage test (All Tickets / All Time)">
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
      <Row label="Data source">{debug.dataSource} (live Freshdesk)</Row>
      <Row label="Date range">{debug.dateRangeLabel}</Row>
      <Row label="Freshdesk query">
        <code className="break-all text-foreground/90">{debug.freshdeskQuery || "—"}</code>
      </Row>
      <Row label="Account field detected">{debug.accountFieldDetected ?? "none"}</Row>
      <Row label="Filters applied">
        <code className="text-foreground/90">{JSON.stringify(debug.filters)}</code>
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
      <Row label="Result counts">
        Strong {debug.groupCounts.strong} · Possible {debug.groupCounts.possible} · Mentions{" "}
        {debug.groupCounts.relatedMentions}
      </Row>
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

function AccountCoverageTester() {
  const [num, setNum] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AccountCoverageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!num.trim()) return;
    setLoading(true); setError(null); setReport(null);
    try {
      const res = await freshdeskAccountCoverage({ data: { accountNumber: num.trim() } });
      if (!res.ok) setError(res.error);
      else setReport(res.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coverage check failed.");
    } finally { setLoading(false); }
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
            <span className={report.scope === "all-time" ? "text-emerald-300" : "text-amber-300"}>
              {report.scope === "all-time"
                ? "All available tickets scanned"
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
            {report.mentionsScanned} ticket(s) scanned{report.mentionsPagesTruncated && " (truncated)"}
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
    setLoading(true); setError(null); setReport(null);
    try {
      const res = await freshdeskSyncCheck({ data: { number: num.trim() } });
      if (!res.ok) setError(res.error);
      else setReport(res.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed.");
    } finally { setLoading(false); }
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
          <Item ok={report.notes} label={`Notes / replies / conversation body (${report.conversationCount} across ${report.conversationPages} pages)`} />
          <li>
            Latest conversation:{" "}
            <span className="text-foreground">
              {report.latestConversationAt ? new Date(report.latestConversationAt).toLocaleString() : "—"}
            </span>
          </li>
          <Item ok={report.fullyIndexed} label="Fully indexed for AI search" />
          {report.errors.length > 0 && <li className="text-rose-300">Errors: {report.errors.join("; ")}</li>}
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
