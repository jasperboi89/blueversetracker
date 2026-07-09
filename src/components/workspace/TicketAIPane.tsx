import { useState } from "react";
import { Loader2, Sparkles, ClipboardCopy, FileText, Tag, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aiClassifyTicket, aiDraftNote, aiSummarizeTicket } from "@/lib/ai/ai.functions";
import { aiStyleHint, setAIEnabled, useAISettings } from "@/lib/settings/ai-settings-store";
import { useIsAdmin } from "@/lib/auth/role-context";
import {
  ticketsStore,
  type IssueClassification,
  type Ticket,
  type WorkSession,
} from "@/lib/tickets-store";

function contextFromTicket(ticket: Ticket, session: WorkSession, style: string) {
  return {
    number: ticket.number,
    subject: ticket.details.subject,
    description: ticket.freshdeskNotes[0]?.body,
    accountName: ticket.accountName,
    notes: ticket.freshdeskNotes.slice(0, 40).map((n) => ({ author: n.author, body: n.body })),
    issueText: session.issueText,
    changesText: session.changesText,
    resultStatus: session.resultStatus ?? undefined,
    resultNotes: session.resultNotes,
    style,
  };
}

export function TicketAIPane({
  ticket,
  session,
  ticketId,
  onDraft,
}: {
  ticket: Ticket;
  session: WorkSession;
  ticketId: string;
  onDraft: (text: string) => void;
}) {
  const ai = useAISettings();
  const isAdmin = useIsAdmin();
  const [busy, setBusy] = useState<null | "summary" | "draft" | "classify">(null);
  const [summary, setSummary] = useState("");
  const [suggestion, setSuggestion] = useState<{
    classification?: string;
    nextAction?: string;
    owner?: string;
    reason?: string;
  } | null>(null);

  if (!ai.enabled) {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <ShieldOff className="h-3.5 w-3.5" /> AI is turned off.
        </div>
        {isAdmin && (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setAIEnabled(true)}>
            Enable AI
          </Button>
        )}
      </div>
    );
  }

  const style = aiStyleHint(ai);

  const runSummary = async () => {
    setBusy("summary");
    const res = await aiSummarizeTicket({ data: contextFromTicket(ticket, session, style) });
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? "AI failed.");
    setSummary(res.text ?? "");
  };

  const runDraft = async () => {
    setBusy("draft");
    const res = await aiDraftNote({ data: contextFromTicket(ticket, session, style) });
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? "AI failed.");
    if (res.text) {
      onDraft(res.text);
      toast.success("Draft note generated — review before posting.");
    }
  };

  const runClassify = async () => {
    setBusy("classify");
    const res = await aiClassifyTicket({ data: contextFromTicket(ticket, session, style) });
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? "AI failed.");
    setSuggestion(res.suggestion ?? null);
  };

  const applyClassification = () => {
    const c = suggestion?.classification;
    if (c === "Scripting Issue" || c === "Client Change" || c === "Other") {
      ticketsStore.setIssueClassification(ticketId, c as IssueClassification);
      toast.success(`Classification set to ${c}.`);
    }
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" className="h-7" onClick={runSummary} disabled={!!busy}>
          {busy === "summary" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} />
          )}
          Summarize thread
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={runDraft} disabled={!!busy}>
          {busy === "draft" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="mr-1 h-3.5 w-3.5" />
          )}
          Draft note
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={runClassify} disabled={!!busy}>
          {busy === "classify" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Tag className="mr-1 h-3.5 w-3.5" />
          )}
          Classify
        </Button>
      </div>

      {summary && (
        <div className="rounded-md border border-border/30 bg-white/[0.02] p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Thread summary</span>
            <button
              className="hover:text-foreground"
              onClick={() => {
                navigator.clipboard.writeText(summary);
                toast.success("Copied.");
              }}
            >
              <ClipboardCopy className="h-3 w-3" />
            </button>
          </div>
          <div className="whitespace-pre-wrap text-foreground/90">{summary}</div>
        </div>
      )}

      {suggestion && (
        <div className="rounded-md border border-border/30 bg-white/[0.02] p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Suggestion
          </div>
          <div className="space-y-0.5 text-foreground/90">
            {suggestion.classification && (
              <div>
                <span className="text-muted-foreground">Classification:</span>{" "}
                {suggestion.classification}
              </div>
            )}
            {suggestion.nextAction && (
              <div>
                <span className="text-muted-foreground">Next action:</span> {suggestion.nextAction}
              </div>
            )}
            {suggestion.owner && (
              <div>
                <span className="text-muted-foreground">Owner:</span> {suggestion.owner}
              </div>
            )}
          </div>
          {suggestion.classification && (
            <Button size="sm" variant="ghost" className="mt-1 h-7" onClick={applyClassification}>
              Apply classification
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
        <span>
          AI reads this ticket's text to help; every request is recorded in the Audit Log.
        </span>
        {isAdmin && (
          <button className="shrink-0 hover:text-foreground" onClick={() => setAIEnabled(false)}>
            Turn off
          </button>
        )}
      </div>
    </div>
  );
}
