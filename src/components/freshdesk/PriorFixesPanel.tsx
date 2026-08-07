import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, ExternalLink, Copy, BookOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { findPriorFixes, type PriorFixesResult } from "@/lib/api/prior-fixes.functions";
import { formatCentralShort } from "@/lib/shift";

interface Props {
  ticketNumber?: string;
  subject: string;
  description: string;
  accountNumber?: string;
  /** Only show hits for this account (account page). */
  accountOnly?: boolean;
  /** Called when the operator wants a past fix as a starting draft. */
  onUseFix?: (text: string) => void;
  autoRun?: boolean;
}

export function PriorFixesPanel({
  ticketNumber,
  subject,
  description,
  accountNumber,
  accountOnly,
  onUseFix,
  autoRun = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriorFixesResult | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await findPriorFixes({
        data: {
          ...(ticketNumber ? { ticketNumber } : {}),
          subject: subject.slice(0, 400),
          description: description.slice(0, 12000),
          ...(accountNumber ? { accountNumber } : {}),
          ...(accountOnly ? { accountOnly: true } : {}),
        },
      });
      setResult(res);
    } catch {
      setResult({
        ok: false,
        indexAvailable: false,
        tickets: [],
        notes: [],
        query: "",
        error: "Lookup failed.",
      });
    } finally {
      setLoading(false);
    }
  }, [ticketNumber, subject, description, accountNumber, accountOnly]);

  useEffect(() => {
    if (autoRun) void run();
  }, [autoRun, run]);

  const copyFix = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Fix copied.");
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {result?.query ? `Matching on: ${result.query}` : "Past tickets and notes"}
        </div>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => void run()} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          )}
          Search again
        </Button>
      </div>

      {loading && !result && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for similar work…
        </div>
      )}

      {result?.error && <div className="text-amber-400/90">{result.error}</div>}

      {result && !loading && result.tickets.length === 0 && result.notes.length === 0 && (
        <div className="text-muted-foreground">
          {result.indexAvailable
            ? "No similar past tickets or notes found."
            : "The ticket index isn't available yet — run a sync from Freshdesk Intelligence."}
        </div>
      )}

      {result?.tickets.map((t) => (
        <div key={t.ticketNumber} className="rounded-md border border-border/30 bg-white/[0.02] p-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium tabular-nums text-foreground">#{t.ticketNumber}</span>
                {t.accountNumber && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t.accountNumber}
                    {t.accountName ? ` · ${t.accountName}` : ""}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formatCentralShort(new Date(t.updatedAt))}
                </span>
              </div>
              <div className="truncate text-foreground/90">{t.subject || "—"}</div>
            </div>
            <a
              href={t.freshdeskUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
              title="Open in Freshdesk"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {t.why && (
            <div className="mt-1.5 flex gap-1.5 text-foreground/80">
              <Search className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "var(--cyan-glow)" }} />
              <span>{t.why}</span>
            </div>
          )}

          {(t.fix || t.excerpt) && (
            <div className="mt-1.5 rounded border border-border/20 bg-black/20 p-1.5 text-foreground/75">
              {t.fix || t.excerpt}
            </div>
          )}

          <div className="mt-1.5 flex flex-wrap gap-1">
            {t.fix && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => void copyFix(t.fix)}
              >
                <Copy className="mr-1 h-3 w-3" /> Copy fix
              </Button>
            )}
            {t.fix && onUseFix && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => onUseFix(`From #${t.ticketNumber}: ${t.fix}`)}
              >
                Use as draft
              </Button>
            )}
          </div>
        </div>
      ))}

      {result && result.notes.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Knowledge Vault
          </div>
          {result.notes.map((n) => (
            <div key={n.id} className="rounded-md border border-border/30 bg-white/[0.02] p-2">
              <div className="flex items-center gap-1.5">
                <BookOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground/90">{n.title}</span>
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {n.noteType}
                </span>
              </div>
              {n.excerpt && <div className="mt-1 text-foreground/70">{n.excerpt}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}