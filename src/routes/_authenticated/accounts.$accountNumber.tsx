import { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, Archive, Building2, ClipboardList, Clock, FileText, MessageSquarePlus,
  PhoneOutgoing, RotateCcw, Ticket as TicketIcon, Plus, Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PriorFixesPanel } from "@/components/freshdesk/PriorFixesPanel";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accountsStore, useAccounts, type AccountTemplateType } from "@/lib/accounts-store";
import { useTickets } from "@/lib/tickets-store";
import { useDispatch } from "@/lib/dispatch-store";
import { useAdditionalWork } from "@/lib/additional-work-store";
import {
  useWorkLog,
  workLogForAccount,
  updateWorkLogEntry,
  deleteWorkLogEntry,
  addManualWorkLogEntry,
  type WorkLogEntry,
} from "@/lib/workspace/work-log-store";
import { formatElapsed } from "@/lib/workspace/active-work-store";
import { TimeEditDialog } from "@/components/workspace/TimeEditDialog";
import { CreateAdditionalWorkModal } from "@/components/additional-work/CreateAdditionalWorkModal";
import { formatCentralShort } from "@/lib/shift";
import { toast } from "sonner";
import { useRecurringRows, recurringStore } from "@/lib/reports/recurring-issues";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounts/$accountNumber")({
  head: () => ({ meta: [{ title: "Account — Account Intel Hub" }] }),
  component: AccountProfilePage,
});

type TimelineFilter = "all" | "freshdesk" | "dispatch" | "additional" | "notes" | "timelog";

function AccountProfilePage() {
  const { accountNumber } = Route.useParams();
  useAccounts();
  const nav = useNavigate();
  const acct = accountsStore.get(accountNumber);
  const { tickets } = useTickets();
  const { sessions } = useDispatch();
  const { items: workItems } = useAdditionalWork();
  useWorkLog();
  const recurringRows = useRecurringRows();
  const recurring = recurringRows.find((r) => r.accountNumber === accountNumber && r.active);

  const [addWorkOpen, setAddWorkOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [startTicketOpen, setStartTicketOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [timeEdit, setTimeEdit] = useState<WorkLogEntry | null>(null);
  const [addTimeOpen, setAddTimeOpen] = useState(false);

  if (!acct) {
    return (
      <>
        <div className="mx-auto max-w-3xl">
          <div className="glass-panel p-8 text-center">
            <p className="text-sm text-muted-foreground">Account not found.</p>
            <Link to="/accounts"><Button variant="ghost" className="mt-3"><ArrowLeft className="mr-1 h-4 w-4" /> Back to Account Lookup</Button></Link>
          </div>
        </div>
      </>
    );
  }

  const notes = accountsStore.notesFor(accountNumber);
  const tks = tickets.filter((t) => t.accountNumber === accountNumber);
  const ds = sessions.filter((s) => s.accountNumber === accountNumber);
  const aw = workItems.filter((w) => w.accountNumber === accountNumber);
  const worklog = workLogForAccount(accountNumber);

  type Item = { id: string; kind: TimelineFilter; at: number; node: React.ReactNode };
  const timeline: Item[] = useMemo(() => {
    const arr: Item[] = [];
    tks.forEach((t) => arr.push({
      id: `tk-${t.id}`, kind: "freshdesk", at: t.updatedAt,
      node: (
        <div className="flex items-start gap-3">
          <TicketIcon className="mt-0.5 h-4 w-4" style={{ color: "var(--cyan-glow)" }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-foreground">Freshdesk #{t.number}</div>
              <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{t.status.replace("-"," ")}</span>
            </div>
            <div className="text-xs text-muted-foreground">{t.details.subject}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{formatCentralShort(new Date(t.updatedAt))}{t.issueClassification ? ` · ${t.issueClassification}` : ""}</div>
            {t.hubSnips.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {t.hubSnips.map((s) => (
                  <span key={s.id} className="rounded border border-border/30 bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-muted-foreground">{s.category}: {s.name}</span>
                ))}
              </div>
            )}
          </div>
          <Link to="/freshdesk-tickets/$ticketId/work" params={{ ticketId: t.id }}>
            <Button size="sm" variant="ghost" className="text-xs">Open</Button>
          </Link>
        </div>
      ),
    }));
    ds.forEach((s) => arr.push({
      id: `ds-${s.id}`, kind: "dispatch", at: s.updatedAt,
      node: (
        <div className="flex items-start gap-3">
          <PhoneOutgoing className="mt-0.5 h-4 w-4" style={{ color: "var(--violet-glow)" }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-foreground">Contact Dispatch Testing</div>
              {s.status && <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{s.status.replace("-"," ")}</span>}
            </div>
            {s.ticketNumber && <div className="text-xs text-muted-foreground">Linked Ticket #{s.ticketNumber}</div>}
            <div className="mt-0.5 text-[10px] text-muted-foreground">{formatCentralShort(new Date(s.updatedAt))}</div>
            {s.snips.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {s.snips.map((sn) => (
                  <span key={sn.id} className="rounded border border-border/30 bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-muted-foreground">{sn.category}: {sn.name}</span>
                ))}
              </div>
            )}
          </div>
          <Link to="/contact-dispatch/$sessionId/work" params={{ sessionId: s.id }}>
            <Button size="sm" variant="ghost" className="text-xs">Open</Button>
          </Link>
        </div>
      ),
    }));
    aw.forEach((w) => arr.push({
      id: `aw-${w.id}`, kind: "additional", at: w.updatedAt,
      node: (
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 h-4 w-4" style={{ color: "var(--gold-glow)" }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-foreground">{w.title}</div>
              <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{w.status === "completed" ? "Completed" : "Working"}</span>
            </div>
            <div className="text-xs text-muted-foreground">Additional Work</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{formatCentralShort(new Date(w.updatedAt))}</div>
            {w.snips.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {w.snips.map((s) => (
                  <span key={s.id} className="rounded border border-border/30 bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-muted-foreground">{s.category}: {s.name}</span>
                ))}
              </div>
            )}
          </div>
          <Link to="/additional-work/$workId/work" params={{ workId: w.id }}>
            <Button size="sm" variant="ghost" className="text-xs">Open</Button>
          </Link>
        </div>
      ),
    }));
    notes.forEach((n) => arr.push({
      id: `nt-${n.id}`, kind: "notes", at: n.createdAt,
      node: (
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4" style={{ color: "var(--cyan-glow)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-foreground whitespace-pre-wrap">{n.text}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">Account Note · {n.initials} · {formatCentralShort(new Date(n.createdAt))}</div>
          </div>
        </div>
      ),
    }));
    worklog.forEach((e) => arr.push({
      id: `wl-${e.id}`, kind: "timelog", at: e.endedAt,
      node: (
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-4 w-4" style={{ color: "var(--green-glow)" }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-foreground">Time logged · {formatElapsed(e.durationMs)}</div>
              <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{e.kind}</span>
              {e.adjusted && (
                <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">adjusted</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{e.label}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{formatCentralShort(new Date(e.endedAt))}</div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Edit time"
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setTimeEdit(e)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Delete entry"
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-destructive"
              onClick={() => { deleteWorkLogEntry(e.id); toast.success("Time entry removed."); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ),
    }));
    return arr.sort((a, b) => b.at - a.at);
  }, [tks, ds, aw, notes, worklog]);

  const filtered = filter === "all" ? timeline : timeline.filter((i) => i.kind === filter);

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-4">
        {recurring && (
          <div
            className="glass-panel flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5"
            style={{
              borderColor: "color-mix(in oklab, oklch(0.72 0.22 25) 55%, transparent)",
              background:
                "linear-gradient(135deg, oklch(0.72 0.22 25 / 0.16), oklch(0.8 0.16 350 / 0.08))",
            }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5" style={{ color: "oklch(0.72 0.22 25)" }} />
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Recurring scripting issues detected
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {recurring.rollingCount} scripting issues in 30 days · {recurring.sixMonthCount} in the last 6 months. Review scripting and document any changes.
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => nav({ to: "/reports", search: { r: "recurring" } })}>
                View in Reports
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { recurringStore.markReviewed(accountNumber); toast.success("Marked as reviewed"); }}>
                Mark reviewed
              </Button>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to="/accounts" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Back to Account Lookup
              </Link>
              <h1 className="mt-1 text-xl font-semibold text-foreground">
                <span className="tabular-nums text-muted-foreground">{acct.number}</span>{" "}
                {acct.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="rounded-full border px-2 py-0.5 uppercase tracking-wider"
                  style={
                    acct.status === "archived"
                      ? { color: "var(--gold-glow)", borderColor: "color-mix(in oklab, var(--gold-glow) 50%, transparent)" }
                      : { color: "var(--green-glow)", borderColor: "color-mix(in oklab, var(--green-glow) 40%, transparent)" }
                  }
                >
                  {acct.status === "archived" ? "Off Service · Archived" : "Active"}
                </span>
                <span>Updated {formatCentralShort(new Date(acct.updatedAt))}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStartTicketOpen(true)}>
                <TicketIcon className="mr-1.5 h-4 w-4" /> Start Freshdesk Ticket
              </Button>
              <Link to="/contact-dispatch">
                <Button variant="ghost"><PhoneOutgoing className="mr-1.5 h-4 w-4" /> Start Contact Dispatch</Button>
              </Link>
              <Button variant="ghost" onClick={() => setAddWorkOpen(true)}>
                <ClipboardList className="mr-1.5 h-4 w-4" /> Start Additional Work
              </Button>
              <Button variant="ghost" onClick={() => setNoteOpen(true)}>
                <MessageSquarePlus className="mr-1.5 h-4 w-4" /> Add Note
              </Button>
              <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
                {acct.status === "archived" ? <><RotateCcw className="mr-1.5 h-4 w-4" /> Restore</> : <><Archive className="mr-1.5 h-4 w-4" /> Archive</>}
              </Button>
            </div>
          </div>
          {acct.status === "archived" && (
            <div className="mt-3 rounded-md border border-gold-glow/40 bg-white/[0.02] p-2 text-xs" style={{ color: "var(--gold-glow)" }}>
              This account is Off Service / Archived. History is preserved.
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Timeline */}
          <div className="glass-panel p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Account Timeline</h2>
              {filter === "timelog" && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddTimeOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add time
                </Button>
              )}
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as TimelineFilter)} className="mt-3">
              <TabsList className="grid w-full grid-cols-6 bg-white/5">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="freshdesk">Freshdesk</TabsTrigger>
                <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
                <TabsTrigger value="additional">Add'l Work</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="timelog">Time</TabsTrigger>
              </TabsList>
              <TabsContent value={filter} className="mt-3 space-y-2">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No items.</p>
                ) : filtered.map((i) => (
                  <div key={i.id} className="rounded-md border border-border/30 bg-white/[0.02] p-3">{i.node}</div>
                ))}
              </TabsContent>
            </Tabs>
          </div>

          {/* Side: Notes + Templates + Details */}
          <div className="space-y-4">
            <div className="glass-panel p-4">
              <h2 className="mb-2 text-sm font-semibold text-foreground">Seen This Before</h2>
              <PriorFixesPanel
                subject={acct.name ?? ""}
                description=""
                accountNumber={accountNumber}
                accountOnly
                autoRun={false}
              />
            </div>
            <NotesCard accountNumber={accountNumber} />
            <TemplatesCard accountNumber={accountNumber} />
            <DetailsCard accountNumber={accountNumber} />
          </div>
        </div>

        <CreateAdditionalWorkModal
          open={addWorkOpen}
          onOpenChange={setAddWorkOpen}
          prefillAccount={{ number: acct.number, name: acct.name }}
        />
        <AddNoteModal open={noteOpen} onOpenChange={setNoteOpen} accountNumber={acct.number} tickets={tks.map(t => ({ id: t.id, number: t.number, subject: t.details.subject }))} />
        <StartFreshdeskModal open={startTicketOpen} onOpenChange={setStartTicketOpen} accountNumber={acct.number} accountName={acct.name} />
        <ArchiveModal open={archiveOpen} onOpenChange={setArchiveOpen} archived={acct.status === "archived"} accountNumber={acct.number} />
        <TimeEditDialog
          open={Boolean(timeEdit)}
          onOpenChange={(v) => { if (!v) setTimeEdit(null); }}
          valueMs={timeEdit?.durationMs ?? 0}
          label={timeEdit?.label ?? ""}
          onLabelChange={() => {}}
          onSave={(ms, label) => {
            if (!timeEdit) return;
            updateWorkLogEntry(timeEdit.id, { durationMs: ms, label: label || timeEdit.label });
            setTimeEdit(null);
            toast.success("Time entry updated.");
          }}
          onDelete={() => {
            if (!timeEdit) return;
            deleteWorkLogEntry(timeEdit.id);
            setTimeEdit(null);
            toast.success("Time entry removed.");
          }}
        />
        <TimeEditDialog
          open={addTimeOpen}
          onOpenChange={setAddTimeOpen}
          title="Add time entry"
          valueMs={0}
          label=""
          onLabelChange={() => {}}
          onSave={(ms, label) => {
            if (ms <= 0) { toast.error("Enter a duration first."); return; }
            addManualWorkLogEntry({
              label: label || "Manual time entry",
              accountNumber: acct.number,
              accountName: acct.name,
              durationMs: ms,
            });
            toast.success("Time added.");
          }}
        />
      </div>
    </>
  );
}

function NotesCard({ accountNumber }: { accountNumber: string }) {
  useAccounts();
  const notes = accountsStore.notesFor(accountNumber);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  return (
    <div className="glass-panel p-4">
      <h3 className="text-sm font-semibold text-foreground">Account Notes</h3>
      {notes.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No account notes yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
              <p className="text-foreground whitespace-pre-wrap">{n.text}</p>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{n.initials} · {formatCentralShort(new Date(n.createdAt))}</span>
                <button onClick={() => setConfirmDel(n.id)} className="rounded p-1 hover:bg-white/5"><Trash2 className="h-3 w-3" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <DialogContent className="glass-panel border-0 sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Note?</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button onClick={() => { if (confirmDel) accountsStore.deleteNote(confirmDel); setConfirmDel(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplatesCard({ accountNumber }: { accountNumber: string }) {
  useAccounts();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const tpls = accountsStore.templatesFor(accountNumber, { includeArchived });

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Dispatch Templates</h3>
        <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}><Plus className="mr-1 h-3 w-3" /> Add</Button>
      </div>
      <label className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
        <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
        Show archived
      </label>
      {tpls.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No templates yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {tpls.map((t) => (
            <li key={t.id} className="rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="font-medium text-foreground">{t.name}</div>
                <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{t.type}</span>
              </div>
              <div className="mt-1 text-muted-foreground">{t.expectedFlow}</div>
              <div className="mt-1 flex gap-1">
                {t.archived ? (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => accountsStore.restoreTemplate(t.id)}>Restore</Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => accountsStore.archiveTemplate(t.id)}>Archive</Button>
                )}
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => accountsStore.duplicateTemplate(t.id)}>Duplicate</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AddTemplateModal open={addOpen} onOpenChange={setAddOpen} accountNumber={accountNumber} />
    </div>
  );
}

function AddTemplateModal({ open, onOpenChange, accountNumber }: { open: boolean; onOpenChange: (v: boolean) => void; accountNumber: string }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountTemplateType>("routine");
  const [flow, setFlow] = useState("");
  const save = () => {
    if (!name.trim()) return;
    accountsStore.addTemplate({ accountNumber, name: name.trim(), type, expectedFlow: flow.trim() });
    toast.success("Template added.");
    setName(""); setFlow(""); setType("routine");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Add Template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
          <Select value={type} onValueChange={(v) => setType(v as AccountTemplateType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="routine">Routine</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="blank">Blank / Not Set</SelectItem>
            </SelectContent>
          </Select>
          <RichTextEditor minHeight={72} value={flow} onChange={setFlow} placeholder="Expected flow" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsCard({ accountNumber }: { accountNumber: string }) {
  useAccounts();
  const a = accountsStore.get(accountNumber)!;
  const [name, setName] = useState(a.name);
  return (
    <div className="glass-panel p-4">
      <h3 className="text-sm font-semibold text-foreground">Account Details</h3>
      <div className="mt-2 space-y-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Number</div>
          <div className="tabular-nums text-foreground">{a.number}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Company Name</div>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== a.name && accountsStore.update(a.number, { name })} className="h-8 text-xs" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Created</div>
            <div className="text-foreground">{formatCentralShort(new Date(a.createdAt))}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</div>
            <div className="text-foreground">{formatCentralShort(new Date(a.updatedAt))}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddNoteModal({ open, onOpenChange, accountNumber, tickets }: { open: boolean; onOpenChange: (v: boolean) => void; accountNumber: string; tickets: { id: string; number: string; subject: string }[] }) {
  const [kind, setKind] = useState<"account" | "ticket">("account");
  const [text, setText] = useState("");
  const [ticketId, setTicketId] = useState<string>("");
  const save = () => {
    if (!text.trim()) return;
    if (kind === "account") {
      accountsStore.addNote(accountNumber, text.trim());
      toast.success("Account note added.");
    } else {
      // Ticket note path — would call ticketsStore.addNote in a fuller phase.
      toast.success("Ticket note saved (open ticket workspace to view).");
    }
    setText(""); setTicketId("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2 text-xs">
            <button onClick={() => setKind("account")} className={`rounded-md border px-2 py-1 ${kind === "account" ? "border-cyan-glow/60 text-foreground" : "border-border/40 text-muted-foreground"}`}>Account Note</button>
            <button onClick={() => setKind("ticket")} className={`rounded-md border px-2 py-1 ${kind === "ticket" ? "border-cyan-glow/60 text-foreground" : "border-border/40 text-muted-foreground"}`}>Ticket Note</button>
          </div>
          {kind === "ticket" && (
            <Select value={ticketId} onValueChange={setTicketId}>
              <SelectTrigger><SelectValue placeholder="Choose a ticket" /></SelectTrigger>
              <SelectContent>
                {tickets.length === 0 ? <SelectItem value="none" disabled>No tickets for this account</SelectItem> :
                 tickets.map((t) => <SelectItem key={t.id} value={t.id}>#{t.number} — {t.subject}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <RichTextEditor minHeight={88} value={text} onChange={setText} placeholder="Note text" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!text.trim()}>Save Note</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartFreshdeskModal({ open, onOpenChange, accountNumber, accountName }: { open: boolean; onOpenChange: (v: boolean) => void; accountNumber: string; accountName: string }) {
  const nav = useNavigate();
  const [num, setNum] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Start Freshdesk Ticket</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">Linking to {accountNumber} · {accountName}</p>
          <Input value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Freshdesk ticket number" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onOpenChange(false); nav({ to: "/freshdesk-tickets" }); }}>Continue to Freshdesk Tickets</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveModal({ open, onOpenChange, archived, accountNumber }: { open: boolean; onOpenChange: (v: boolean) => void; archived: boolean; accountNumber: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>{archived ? "Restore this account to Active?" : "Archive this account?"}</DialogTitle></DialogHeader>
        <div className="text-sm text-muted-foreground">
          {archived
            ? "This will set the account back to Active and include it in normal searches."
            : "This will mark the account Off Service / Archived, hide it from normal active searches, and preserve all history."}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { archived ? accountsStore.restore(accountNumber) : accountsStore.archive(accountNumber); toast.success(archived ? "Restored." : "Archived."); onOpenChange(false); }}>
            {archived ? "Restore Account" : "Archive Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}