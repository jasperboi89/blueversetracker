import { useState } from "react";
import { Copy, Download, ExternalLink, Send, Wand2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  buildDispatchSummary, dispatchStore, DISPATCH_STATUS_LABEL,
  type DispatchSession,
} from "@/lib/dispatch-store";
import { formatCentralShort } from "@/lib/shift";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SummaryNotesSection({ session, onMarkPostedRequest }: { session: DispatchSession; onMarkPostedRequest: () => void }) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);

  const recommended =
    session.status === "ready" ? "Ready for Activation Summary" :
    session.status === "waiting-cs" ? "Waiting on Customer Service Summary" :
    session.status === "waiting-prog" ? "Waiting on Programming Summary" :
    session.status === "not-ready" ? "Not Ready / Still Working Summary" :
    "Draft Summary";

  const enoughDetail =
    session.reasons.length > 0 || session.statusReason.trim().length > 0;

  const generate = (force = false) => {
    if (!enoughDetail && !force) { setWarningOpen(true); return; }
    const body = buildDispatchSummary(session, { onlyIssues });
    dispatchStore.addSummaryVersion(session.id, "Generated", body);
    setWarningOpen(false);
    toast.success("Summary generated.");
  };

  const writeManually = () => {
    dispatchStore.addSummaryVersion(session.id, "Manual Draft", session.summaryNotes || "");
    setWarningOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-muted-foreground">
          Current status: <span className="text-foreground">{session.status ? DISPATCH_STATUS_LABEL[session.status] : "—"}</span>
        </div>
        <div className="text-muted-foreground">Recommended: <span className="text-foreground">{recommended}</span></div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => generate(false)}><Wand2 className="mr-1 h-3.5 w-3.5" /> Generate Summary Note</Button>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Switch checked={onlyIssues} onCheckedChange={setOnlyIssues} id="only-issues" />
          <label htmlFor="only-issues">Only failed / retested / review-needed</label>
        </div>
        {session.summaryVersions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost"><History className="mr-1 h-3.5 w-3.5" /> Version History ({session.summaryVersions.length})</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-panel border-0">
              <DropdownMenuLabel>Versions (latest first)</DropdownMenuLabel>
              {session.summaryVersions.map((v) => (
                <DropdownMenuItem key={v.id} onClick={() => dispatchStore.restoreSummaryVersion(session.id, v.id)}>
                  <span className="text-xs">{v.label} — {formatCentralShort(new Date(v.createdAt))}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {warningOpen && (
        <div
          className="rounded-md border p-3 text-xs"
          style={{ borderColor: "oklch(0.85 0.16 85 / 0.5)", background: "oklch(0.85 0.16 85 / 0.1)" }}
        >
          <div className="font-medium text-foreground">Not enough detail documented yet.</div>
          <div className="mt-1 text-muted-foreground">Add more before generating, or override.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setWarningOpen(false)}>Add Missing Details</Button>
            <Button size="sm" onClick={() => generate(true)}>Generate Anyway</Button>
            <Button size="sm" variant="ghost" onClick={writeManually}>Write Note Manually</Button>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Summary Note (editable)</label>
        <Textarea
          rows={14}
          className="mt-1 font-mono text-xs"
          value={session.summaryNotes}
          onChange={(e) => dispatchStore.saveSummaryEdit(session.id, e.target.value)}
          placeholder="Generate a draft or write a manual summary."
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" disabled={!session.summaryNotes} onClick={() => { navigator.clipboard.writeText(session.summaryNotes); toast.success("Copied."); }}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy Final Version
        </Button>
        <Button size="sm" variant="ghost" disabled={!session.summaryNotes} onClick={() => { navigator.clipboard.writeText(session.summaryNotes.replace(/^\s*[-•].*$/gm, "").trim()); toast.success("Copied text only."); }}>
          Copy Text Only
        </Button>
        <Button size="sm" variant="ghost" disabled={session.snips.length === 0} onClick={() => {
          session.snips.filter((s) => s.dataUrl).forEach((s) => {
            const a = document.createElement("a");
            a.href = s.dataUrl!; a.download = s.name; a.click();
          });
        }}>
          <Download className="mr-1 h-3.5 w-3.5" /> Download Included Snips
        </Button>
        {session.ticketNumber && (
          <Button size="sm" variant="ghost" onClick={() => toast.info(`Freshdesk ticket #${session.ticketNumber} (mock).`)}>
            <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open Freshdesk Ticket
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onMarkPostedRequest} disabled={session.summaryVersions.length === 0}>
          <Send className="mr-1 h-3.5 w-3.5" /> Mark Posted Manually
        </Button>
        <Button size="sm" variant="ghost" onClick={() => {
          dispatchStore.addSummaryVersion(session.id, "User Edited", session.summaryNotes);
          toast.success("Saved as User Edited version.");
        }} disabled={!session.summaryNotes}>
          Save Summary Note
        </Button>
      </div>

      {session.summaryVersions[0]?.label === "Final Posted / Marked Used" && session.summaryVersions[0].postedAt && (
        <div className="text-[11px] text-muted-foreground">
          Marked posted manually at {formatCentralShort(new Date(session.summaryVersions[0].postedAt))} · LTP
        </div>
      )}
    </div>
  );
}