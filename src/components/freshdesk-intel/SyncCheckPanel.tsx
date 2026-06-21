import { useState } from "react";
import { Wrench, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { freshdeskSyncCheck } from "@/lib/api/freshdesk-search.functions";

type Report = {
  found: boolean;
  descriptionPulled: boolean;
  conversationsPulled: boolean;
  conversationCount: number;
  latestConversationAt: number | null;
  lastSyncAt: number;
  errors: string[];
  fullyIndexed: boolean;
};

export function SyncCheckPanel() {
  const [num, setNum] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!num.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await freshdeskSyncCheck({ data: { number: num.trim() } });
      if (!res.ok) {
        setError(res.error ?? "Sync check failed.");
      } else {
        setReport(res.report);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync check failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel space-y-3 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Wrench className="h-4 w-4" /> Freshdesk Sync Check
      </div>
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
          Check
        </Button>
      </div>
      {error && <div className="text-xs text-rose-300">{error}</div>}
      {report && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          <Item ok={report.found} label="Ticket found in Freshdesk" />
          <Item ok={report.descriptionPulled} label="Description pulled" />
          <Item ok={report.conversationsPulled} label={`Conversations pulled (${report.conversationCount})`} />
          <li>
            Latest conversation:{" "}
            <span className="text-foreground">
              {report.latestConversationAt ? new Date(report.latestConversationAt).toLocaleString() : "—"}
            </span>
          </li>
          <li>
            Last sync: <span className="text-foreground">{new Date(report.lastSyncAt).toLocaleString()}</span>
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

function Item({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li>
      <span className={ok ? "text-emerald-300" : "text-rose-300"}>{ok ? "✓" : "✗"}</span>{" "}
      <span className="text-foreground">{label}</span>
    </li>
  );
}