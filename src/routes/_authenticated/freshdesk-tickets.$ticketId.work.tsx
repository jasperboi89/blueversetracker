import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ImagePlus,
  LayoutGrid,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { RichText } from "@/components/ui/rich-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildGeneratedNote,
  STATUS_LABEL,
  suggestTemplate,
  ticketsStore,
  useTickets,
  type IssueClassification,
  type NoteTemplate,
  type ResultStatus,
  type Ticket,
  type WorkSession,
  type SnipCategory,
} from "@/lib/tickets-store";
import { AddSnipModal } from "@/components/freshdesk/AddSnipModal";
import { AccountLinker } from "@/components/freshdesk/AccountLinker";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { PaneCanvas, useIsNarrow } from "@/components/workspace/PaneCanvas";
import { resolveFloating, setLayoutMode, usePaneLayout } from "@/lib/workspace/pane-layout-store";
import { FloatingPane } from "@/components/workspace/FloatingPane";
import type { PaneDefault } from "@/lib/workspace/pane-layout-store";
import { setActiveWork } from "@/lib/workspace/active-work-store";
import { AccountMemoryPane } from "@/components/workspace/AccountMemoryPane";
import { TicketAIPane } from "@/components/workspace/TicketAIPane";
import { InlineWorkTimer } from "@/components/workspace/InlineWorkTimer";
import { aiSummarizeTicket } from "@/lib/ai/ai.functions";
import { aiStyleHint, useAISettings } from "@/lib/settings/ai-settings-store";
import { formatCentralShort } from "@/lib/shift";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copyRichSummary, copyMarkdownSummary, snipCounts } from "@/lib/summary/rich-copy";

export const Route = createFileRoute("/_authenticated/freshdesk-tickets/$ticketId/work")({
  head: () => ({ meta: [{ title: "Ticket Work — Account Intel Hub" }] }),
  component: WorkspacePage,
});

// Default floating-desk tiling (percent of canvas): Freshdesk reference on the
// left, your work in the middle, notes/snips/generate on the right.
const PANE_DEFS: Record<string, PaneDefault> = {
  reference: { xPct: 0, yPct: 0, wPct: 33, hPct: 44 },
  account: { xPct: 0, yPct: 45, wPct: 33, hPct: 30 },
  ai: { xPct: 0, yPct: 76, wPct: 33, hPct: 24 },
  issue: { xPct: 34, yPct: 0, wPct: 32, hPct: 32 },
  changes: { xPct: 34, yPct: 34, wPct: 32, hPct: 32 },
  result: { xPct: 34, yPct: 68, wPct: 32, hPct: 32 },
  notes: { xPct: 67, yPct: 0, wPct: 33, hPct: 30 },
  snips: { xPct: 67, yPct: 31, wPct: 33, hPct: 34 },
  generate: { xPct: 67, yPct: 66, wPct: 33, hPct: 34 },
};

function WorkspacePage() {
  const { ticketId } = useParams({ from: "/_authenticated/freshdesk-tickets/$ticketId/work" });
  const navigate = useNavigate();
  const { tickets, workSessions } = useTickets();
  const ticket = tickets.find((t) => t.id === ticketId);
  const session: WorkSession = workSessions[ticketId] ?? ticketsStore.getSession(ticketId);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [highlightSection, setHighlightSection] = useState<string | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [postedOpen, setPostedOpen] = useState(false);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<null | { ok: boolean; text: string }>(null);
  const [snipOpen, setSnipOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isNarrow = useIsNarrow();
  const paneLayout = usePaneLayout();
  const floating = resolveFloating(paneLayout.mode, isNarrow);
  const aiSettings = useAISettings();
  const [summarizingIssue, setSummarizingIssue] = useState(false);

  useEffect(() => {
    ticketsStore.touchRecent(ticketId);
  }, [ticketId]);

  useEffect(() => {
    if (!ticket) return;
    setActiveWork({
      kind: "ticket",
      id: ticketId,
      label: `Ticket #${ticket.number}`,
      to: "/_authenticated/freshdesk-tickets/$ticketId/work",
      params: { ticketId },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, ticket?.number]);

  if (!ticket) {
    return (
      <div className="mx-auto max-w-2xl pt-16 text-center">
        <div className="glass-panel p-8">
          <p className="text-sm text-muted-foreground">Ticket not found.</p>
          <Button asChild className="mt-4">
            <Link to="/freshdesk-tickets">Back to Freshdesk Tickets</Link>
          </Button>
        </div>
      </div>
    );
  }

  const toggle = (k: string) => setOpenSections((o) => ({ ...o, [k]: !o[k] }));
  const open = (k: string) => {
    setOpenSections((o) => ({ ...o, [k]: true }));
    setTimeout(() => {
      sectionRefs.current[k]?.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightSection(k);
      setTimeout(() => setHighlightSection(null), 1600);
    }, 50);
  };

  const update = (patch: Partial<WorkSession>) => ticketsStore.updateSession(ticketId, patch);

  const sync = async () => {
    setSyncing(true);
    const { ok } = await ticketsStore.sync(ticketId);
    setSyncing(false);
    setSyncMsg(
      ok
        ? { ok: true, text: "Synced." }
        : { ok: false, text: "Sync failed. Try again or open Freshdesk." },
    );
    setTimeout(() => setSyncMsg(null), 3500);
  };

  const issueChip = chipFor(session.issueText);
  const changesChip = chipFor(session.changesText);
  const resultChip = session.resultStatus ? "Complete" : "Empty";
  const noteCountChip = `${ticket.hubHistory.filter((h) => h.kind === "note").length} notes`;
  const snipCountChip = `${ticket.hubSnips.length} attached`;

  const generate = (force = false) => {
    const missingList: string[] = [];
    if (!session.issueText.trim()) missingList.push("Ticket Issue");
    if (!session.changesText.trim()) missingList.push("Changes Made");
    if (!session.resultStatus) missingList.push("Result / Testing");

    if (missingList.length > 0 && !force) {
      setMissing(missingList);
      return;
    }
    // hard block only on truly required reasons given selected status
    if (session.resultStatus === "failed" && !session.failureReason.trim()) {
      toast.error("Failure Reason is required for Failed status.");
      open("result");
      return;
    }
    if (
      (session.resultStatus === "waiting-cs" || session.resultStatus === "waiting-prog") &&
      !session.waitingReason.trim()
    ) {
      toast.error("Waiting Reason is required for Waiting status.");
      open("result");
      return;
    }
    const template = session.templateOverride ?? suggestTemplate(ticket.issueClassification);
    const text = buildGeneratedNote(ticket, session, template);
    update({ generatedNote: text, noteVersion: session.noteVersion + 1 });
    setMissing(null);
    toast.success("Note generated.");
  };

  const completeBlocked = !session.resultStatus ? false : false; // completion only requires classification

  const referenceBody = (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Subject</div>
        <div className="text-foreground/90">{ticket.details.subject || "—"}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Company", ticket.details.company],
          ["Type", ticket.details.type],
          ["Priority", ticket.details.priority],
          ["Group", ticket.details.group],
          ["Agent", ticket.details.agent],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="text-foreground/90">{v || "—"}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Freshdesk Conversation ({ticket.freshdeskNotes.length})
        </div>
        <div className="space-y-2">
          {ticket.freshdeskNotes.length === 0 && (
            <div className="text-muted-foreground">No Freshdesk notes pulled. Sync to fetch.</div>
          )}
          {ticket.freshdeskNotes.map((n) => (
            <div key={n.id} className="rounded-md border border-border/30 bg-white/[0.02] p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="truncate">{n.author}</span>
                <span>{formatCentralShort(new Date(n.createdAt))}</span>
              </div>
              <RichText className="text-foreground/90" html={n.body} />
            </div>
          ))}
        </div>
      </div>
      {ticket.freshdeskAttachments.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Attachments ({ticket.freshdeskAttachments.length})
          </div>
          <div className="space-y-1">
            {ticket.freshdeskAttachments.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded px-1 py-0.5 text-foreground/80 hover:bg-white/5"
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{a.name}</span>
                {a.size && <span className="shrink-0 text-muted-foreground">{a.size}</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const summarizeIntoIssue = async () => {
    setSummarizingIssue(true);
    const res = await aiSummarizeTicket({
      data: {
        number: ticket.number,
        subject: ticket.details.subject,
        description: ticket.freshdeskNotes[0]?.body,
        accountName: ticket.accountName,
        notes: ticket.freshdeskNotes.slice(0, 40).map((n) => ({ author: n.author, body: n.body })),
        style: aiStyleHint(aiSettings),
      },
    });
    setSummarizingIssue(false);
    if (!res.ok) {
      toast.error(res.error ?? "AI failed.");
      return;
    }
    if (res.text) {
      update({ issueText: res.text });
      toast.success("Issue summarized.");
    }
  };

  const issueBody = (
    <div className="space-y-2">
      <RichTextEditor
        minHeight={110}
        value={session.issueText}
        onChange={(v) => update({ issueText: v })}
        placeholder="Describe the ticket issue freely. Prefilled from Freshdesk on pull."
      />
      {aiSettings.enabled && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={summarizeIntoIssue}
          disabled={summarizingIssue}
        >
          {summarizingIssue ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} />
          )}
          Summarize into Issue
        </Button>
      )}
    </div>
  );

  const changesBody = (
    <RichTextEditor
      minHeight={110}
      value={session.changesText}
      onChange={(v) => update({ changesText: v })}
      placeholder="Describe what you changed. Bullets allowed."
    />
  );

  const resultBody = (
    <div className="space-y-3">
      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Status</label>
        <Select
          value={session.resultStatus ?? ""}
          onValueChange={(v) => update({ resultStatus: v as ResultStatus })}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="waiting-cs">Waiting on Customer Service</SelectItem>
            <SelectItem value="waiting-prog">Waiting on Programming</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {session.resultStatus === "failed" && (
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Failure Reason *
          </label>
          <Input
            value={session.failureReason}
            onChange={(e) => update({ failureReason: e.target.value })}
            className="mt-1"
            placeholder="Required for Failed"
          />
        </div>
      )}
      {(session.resultStatus === "waiting-cs" || session.resultStatus === "waiting-prog") && (
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Waiting Reason *
          </label>
          <Input
            value={session.waitingReason}
            onChange={(e) => update({ waitingReason: e.target.value })}
            className="mt-1"
            placeholder="Required while waiting"
          />
        </div>
      )}
      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Testing / Result Notes
        </label>
        <RichTextEditor
          value={session.resultNotes}
          onChange={(v) => update({ resultNotes: v })}
          minHeight={72}
          className="mt-1"
        />
      </div>
    </div>
  );

  const notesBody = (
    <div className="space-y-3">
      <div className="flex gap-2">
        <RichTextEditor
          value={noteDraft}
          onChange={setNoteDraft}
          minHeight={72}
          placeholder="Add a Hub note (LTP, Central timestamp)."
        />
        <Button
          onClick={() => {
            if (!noteDraft.trim()) return;
            ticketsStore.addNote(ticketId, noteDraft.trim());
            setNoteDraft("");
            toast.success("Note added.");
          }}
          disabled={!noteDraft.trim()}
        >
          <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {ticket.hubHistory
          .filter((h) => h.kind === "note")
          .map((h) => (
            <div
              key={h.id}
              className="rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm"
            >
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>{h.initials}</span>
                <span>{formatCentralShort(new Date(h.createdAt))}</span>
              </div>
              <div className="text-foreground/90">{h.body}</div>
            </div>
          ))}
        {ticket.hubHistory.filter((h) => h.kind === "note").length === 0 && (
          <div className="text-xs text-muted-foreground">No Hub notes yet.</div>
        )}
      </div>
    </div>
  );

  const snipsBody = (
    <div className="space-y-3">
      <Button onClick={() => setSnipOpen(true)} size="sm">
        <ImagePlus className="mr-1 h-3.5 w-3.5" /> Add Snip
      </Button>
      <div className="grid gap-2 sm:grid-cols-2">
        {ticket.hubSnips.map((s) => (
          <div
            key={s.id}
            className="rounded-md border border-border/30 bg-white/[0.02] p-3 text-xs"
          >
            {s.dataUrl && s.isImage ? (
              <img src={s.dataUrl} alt={s.name} className="mb-2 h-32 w-full rounded object-cover" />
            ) : (
              <div className="mb-2 grid h-32 place-items-center rounded bg-white/[0.04] text-muted-foreground">
                <FileText className="h-5 w-5" />
              </div>
            )}
            <div className="font-medium text-foreground">{s.name}</div>
            <div className="text-muted-foreground">
              {s.category}
              {s.label ? ` · ${s.label}` : ""}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {formatCentralShort(new Date(s.createdAt))} · {s.initials}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {s.dataUrl && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigator.clipboard.writeText(s.dataUrl!)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <a
                    href={s.dataUrl}
                    download={s.name}
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs hover:bg-white/5"
                  >
                    <Download className="h-3 w-3" />
                  </a>
                  <a
                    href={s.dataUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs hover:bg-white/5"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => ticketsStore.removeSnip(ticketId, s.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        {ticket.hubSnips.length === 0 && (
          <div className="text-xs text-muted-foreground">No snips attached.</div>
        )}
      </div>
    </div>
  );

  const generateBody = (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Issue Classification
          </label>
          <Select
            value={ticket.issueClassification ?? ""}
            onValueChange={(v) => {
              ticketsStore.setIssueClassification(ticketId, v as IssueClassification);
              update({ templateOverride: null });
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Scripting Issue">Scripting Issue</SelectItem>
              <SelectItem value="Client Change">Client Change</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Note Template
          </label>
          <Select
            value={session.templateOverride ?? suggestTemplate(ticket.issueClassification)}
            onValueChange={(v) => update({ templateOverride: v as NoteTemplate })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Standard Ticket Work Note">Standard Ticket Work Note</SelectItem>
              <SelectItem value="Client Change Note">Client Change Note</SelectItem>
              <SelectItem value="Scripting Issue Note">Scripting Issue Note</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {(ticket.issueClassification === "Scripting Issue" ||
        ticket.issueClassification === "Client Change") && (
        <div className="rounded-md border border-border/40 bg-white/[0.02] p-2 text-[11px] text-muted-foreground">
          Snips are recommended for this note type so others can clearly see what changed.
        </div>
      )}

      {missing && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            borderColor: "oklch(0.85 0.16 85 / 0.4)",
            background:
              "linear-gradient(120deg, oklch(0.85 0.16 85 / 0.12), oklch(0.85 0.16 210 / 0.08))",
          }}
        >
          <div className="font-medium text-foreground">Missing Details</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Before generating, this ticket may need:
          </div>
          <ul className="mt-1 text-xs text-foreground/90">
            {missing.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missing.includes("Ticket Issue") && (
              <Button size="sm" variant="ghost" onClick={() => open("issue")}>
                Go to Ticket Issue
              </Button>
            )}
            {missing.includes("Changes Made") && (
              <Button size="sm" variant="ghost" onClick={() => open("changes")}>
                Go to Changes Made
              </Button>
            )}
            {missing.includes("Result / Testing") && (
              <Button size="sm" variant="ghost" onClick={() => open("result")}>
                Go to Result / Testing
              </Button>
            )}
            <Button size="sm" onClick={() => generate(true)}>
              Generate Anyway
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => generate(false)}>
          <Wand2 className="mr-1 h-3.5 w-3.5" /> Generate Note
        </Button>
        <Button
          size="sm"
          disabled={!session.generatedNote}
          onClick={() => copyRichSummary(session.generatedNote, ticket.hubSnips)}
          style={{
            background:
              "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))",
            border: "1px solid oklch(0.78 0.18 220 / 0.45)",
          }}
        >
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy with Snips (Rich)
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!session.generatedNote}
          onClick={() => copyMarkdownSummary(session.generatedNote, ticket.hubSnips)}
        >
          Copy Markdown
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            navigator.clipboard.writeText(session.generatedNote.replace(/\[.*?\]/g, "").trim())
          }
          disabled={!session.generatedNote}
        >
          Copy Text Only
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            ticket.hubSnips
              .filter((s) => s.dataUrl)
              .forEach((s) => {
                const a = document.createElement("a");
                a.href = s.dataUrl!;
                a.download = s.name;
                a.click();
              });
          }}
        >
          Download Included Snips
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.open(ticket.details.freshdeskUrl, "_blank")}
        >
          <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open Freshdesk Ticket
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPostedOpen(true)}
          disabled={!session.generatedNote}
        >
          <Send className="mr-1 h-3.5 w-3.5" /> Mark Posted Manually
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            ticketsStore.updateSession(ticketId, {});
            toast.success("Work session saved.");
          }}
        >
          <Save className="mr-1 h-3.5 w-3.5" /> Save Work Session
        </Button>
      </div>

      {ticket.hubSnips.length > 0 &&
        (() => {
          const c = snipCounts(ticket.hubSnips);
          return (
            <div className="text-[11px] text-muted-foreground">
              Bundled with copy: {c.images} image{c.images === 1 ? "" : "s"}, {c.files} file
              {c.files === 1 ? "" : "s"} from snips.
            </div>
          );
        })()}

      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Generated Note Preview (editable)
        </label>
        <RichTextEditor
          value={session.generatedNote}
          onChange={(v) => update({ generatedNote: v })}
          minHeight={264}
          className="mt-1 font-mono text-xs"
          placeholder="Click Generate Note to build a preview from the sections above."
        />
        {session.notePosted && session.notePostedAt && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            Marked posted manually at {formatCentralShort(new Date(session.notePostedAt))} · LTP · v
            {session.noteVersion}
          </div>
        )}
      </div>
    </div>
  );

  const sections: { id: string; title: string; chip: string; body: React.ReactNode }[] = [
    {
      id: "reference",
      title: "Freshdesk Reference",
      chip: `#${ticket.number}`,
      body: referenceBody,
    },
    {
      id: "account",
      title: "Account Memory",
      chip: ticket.accountNumber || "—",
      body: <AccountMemoryPane accountNumber={ticket.accountNumber} currentTicketId={ticketId} />,
    },
    {
      id: "ai",
      title: "AI Assist",
      chip: "beta",
      body: (
        <TicketAIPane
          ticket={ticket}
          session={session}
          ticketId={ticketId}
          onDraft={(text) => update({ generatedNote: text, noteVersion: session.noteVersion + 1 })}
        />
      ),
    },
    { id: "issue", title: "Ticket Issue", chip: issueChip, body: issueBody },
    { id: "changes", title: "Changes Made", chip: changesChip, body: changesBody },
    { id: "result", title: "Result / Testing", chip: resultChip, body: resultBody },
    { id: "notes", title: "Notes", chip: noteCountChip, body: notesBody },
    { id: "snips", title: "Snips", chip: snipCountChip, body: snipsBody },
    {
      id: "generate",
      title: "Generate Note / Export",
      chip: session.generatedNote ? "Ready" : "Empty",
      body: generateBody,
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1800px] flex-col gap-5">
      {/* Header */}
      <div className="glass-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Ticket Work Workspace
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tabular-nums text-foreground">
                Ticket #{ticket.number}
              </h1>
              <InlineWorkTimer id={ticketId} />
            </div>
            <div className="mt-1">
              <AccountLinker ticket={ticket} />
            </div>
            <div className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
              <div>
                Status: <span className="text-foreground">{STATUS_LABEL[ticket.status]}</span>
              </div>
              {ticket.dueAt && (
                <div>
                  Due:{" "}
                  <span className="text-foreground">
                    {formatCentralShort(new Date(ticket.dueAt))}
                  </span>
                </div>
              )}
              {ticket.syncedAt && (
                <div>
                  Synced:{" "}
                  <span className="text-foreground">
                    {formatCentralShort(new Date(ticket.syncedAt))}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" asChild>
              <Link to="/freshdesk-tickets">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Freshdesk Tickets
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={sync} disabled={syncing}>
              <RefreshCw className={cn("mr-1 h-3.5 w-3.5", syncing && "animate-spin")} /> Sync
              Freshdesk
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(ticket.details.freshdeskUrl, "_blank")}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open Freshdesk
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              style={{ color: "oklch(0.82 0.18 25)" }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete Ticket
            </Button>
            <Button
              size="sm"
              onClick={() => setCompleteOpen(true)}
              className="text-foreground"
              style={{
                background:
                  "linear-gradient(110deg, oklch(0.4 0.18 290 / 0.55), oklch(0.4 0.16 240 / 0.7))",
                border: "1px solid oklch(0.78 0.18 220 / 0.5)",
                boxShadow: "0 0 16px oklch(0.7 0.22 295 / 0.4)",
              }}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark Ticket Completed
            </Button>
          </div>
        </div>
        {syncMsg && (
          <div
            className="mt-3 inline-block rounded-md px-2 py-1 text-[11px]"
            style={{
              background: syncMsg.ok
                ? "linear-gradient(120deg, oklch(0.82 0.18 155 / 0.18), oklch(0.85 0.16 210 / 0.18))"
                : "linear-gradient(120deg, oklch(0.85 0.16 85 / 0.22), oklch(0.72 0.22 25 / 0.22))",
              color: syncMsg.ok ? "var(--green-glow)" : "oklch(0.92 0.1 35)",
              border: `1px solid ${syncMsg.ok ? "oklch(0.82 0.18 155 / 0.5)" : "oklch(0.72 0.22 25 / 0.5)"}`,
            }}
          >
            {syncMsg.text}
          </div>
        )}
      </div>

      {/* Sections — stacked accordion or floating glass desk, per the layout mode */}
      {!floating ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground"
              onClick={() => setLayoutMode("floating")}
            >
              <LayoutGrid className="mr-1 h-3.5 w-3.5" /> Floating layout
            </Button>
          </div>
          {sections.map((s) => (
            <SectionCard
              key={s.id}
              id={s.id}
              title={s.title}
              chip={s.chip}
              open={!!openSections[s.id]}
              onToggle={() => toggle(s.id)}
              highlight={highlightSection === s.id}
              innerRef={(el) => (sectionRefs.current[s.id] = el)}
            >
              {s.body}
            </SectionCard>
          ))}
        </div>
      ) : (
        <PaneCanvas paneIds={sections.map((s) => s.id)}>
          {sections.map((s) => (
            <FloatingPane key={s.id} id={s.id} title={s.title} chip={s.chip} def={PANE_DEFS[s.id]}>
              {s.body}
            </FloatingPane>
          ))}
        </PaneCanvas>
      )}

      <MarkPostedDialog
        open={postedOpen}
        onOpenChange={setPostedOpen}
        onConfirm={() => {
          ticketsStore.markPosted(ticketId);
          toast.success("Marked as posted.");
        }}
      />
      <MarkCompletedDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        ticket={ticket}
        session={session}
        onComplete={(cls) => {
          ticketsStore.markCompleted(ticketId, cls);
          toast.success(`Ticket #${ticket.number} completed.`);
          navigate({ to: "/freshdesk-tickets" });
        }}
      />
      <AddSnipModal ticketId={ticketId} open={snipOpen} onOpenChange={setSnipOpen} />
      <ConfirmModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ticket #${ticket.number}?`}
        description="This permanently removes the ticket, its notes, snips, attachments, and hub history. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          const num = ticket.number;
          const { ok } = ticketsStore.deleteTicket(ticketId);
          setConfirmDelete(false);
          if (ok) {
            toast.success(`Ticket #${num} deleted.`);
            navigate({ to: "/freshdesk-tickets" });
          }
        }}
      />
    </div>
  );
}

function chipFor(text: string) {
  if (!text.trim()) return "Empty";
  if (text.trim().length < 30) return "In Progress";
  return "Complete";
}

function SectionCard({
  id,
  title,
  chip,
  open,
  onToggle,
  highlight,
  innerRef,
  children,
}: {
  id: string;
  title: string;
  chip: string;
  open: boolean;
  onToggle: () => void;
  highlight?: boolean;
  innerRef?: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={innerRef}
      className={cn("glass-panel transition", highlight && "ring-2 ring-[var(--cyan-glow)]")}
      style={highlight ? { boxShadow: "0 0 28px var(--cyan-glow)" } : undefined}
    >
      <button onClick={onToggle} className="flex w-full items-center justify-between p-4">
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <span className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {chip}
        </span>
      </button>
      {open && <div className="border-t border-border/30 p-4">{children}</div>}
    </div>
  );
}

function MarkPostedDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark this note as posted manually?</DialogTitle>
        </DialogHeader>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>• mark the current note version as posted</li>
          <li>• save posted timestamp in Central</li>
          <li>• record initials as LTP</li>
          <li>• keep the version history inside the portal</li>
          <li>• does not change ticket status</li>
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            style={{
              background:
                "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))",
              border: "1px solid oklch(0.78 0.18 220 / 0.45)",
            }}
          >
            Mark Posted
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkCompletedDialog({
  open,
  onOpenChange,
  ticket,
  session,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: Ticket;
  session: WorkSession;
  onComplete: (c: IssueClassification) => void;
}) {
  const [cls, setCls] = useState<IssueClassification | "">(ticket.issueClassification ?? "");
  useEffect(() => {
    if (open) setCls(ticket.issueClassification ?? "");
  }, [open, ticket.issueClassification]);

  const warnings: string[] = [];
  if (!session.issueText.trim()) warnings.push("Ticket Issue is empty");
  if (!session.changesText.trim()) warnings.push("Changes Made is empty");
  if (!session.resultStatus) warnings.push("Result / Testing not set");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Ticket Completed?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Issue Classification *
            </label>
            <Select value={cls} onValueChange={(v) => setCls(v as IssueClassification)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Required" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Scripting Issue">Scripting Issue</SelectItem>
                <SelectItem value="Client Change">Client Change</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {warnings.length > 0 && (
            <div className="rounded-md border border-border/40 bg-white/[0.02] p-2 text-xs text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">Heads up</div>
              {warnings.map((w) => (
                <div key={w}>• {w}</div>
              ))}
              <div className="mt-1 text-muted-foreground/70">
                These don't block completion — only Issue Classification is required.
              </div>
            </div>
          )}
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• update the Hub ticket status to Completed</li>
            <li>• add completed timestamp in Central</li>
            <li>• record initials as LTP</li>
            <li>• remove from active Freshdesk work</li>
            <li>• add to Recently Completed Work</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!cls}
            onClick={() => {
              onComplete(cls as IssueClassification);
              onOpenChange(false);
            }}
            style={{
              background:
                "linear-gradient(110deg, oklch(0.82 0.18 155 / 0.5), oklch(0.4 0.18 290 / 0.5))",
              border: "1px solid oklch(0.82 0.18 155 / 0.5)",
              boxShadow: "0 0 16px oklch(0.82 0.18 155 / 0.4)",
            }}
          >
            Mark Completed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
