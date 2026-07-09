import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { setActiveWork } from "@/lib/workspace/active-work-store";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  additionalWorkStore,
  useAdditionalWork,
  type AddWorkIssueClassification,
} from "@/lib/additional-work-store";
import { AddWorkSnipModal } from "@/components/additional-work/AddWorkSnipModal";
import { formatCentralShort } from "@/lib/shift";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/additional-work/$workId/work")({
  head: () => ({ meta: [{ title: "Additional Work — Workspace" }] }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const { workId } = Route.useParams();
  const nav = useNavigate();
  const { items } = useAdditionalWork();
  const w = items.find((x) => x.id === workId);

  const [confirmComplete, setConfirmComplete] = useState(false);

  useEffect(() => {
    if (!w) return;
    setActiveWork({
      kind: "additional",
      id: workId,
      label: w.title || "Additional Work",
      to: "/_authenticated/additional-work/$workId/work",
      params: { workId },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, w?.title]);

  if (!w) {
    return (
      <>
        <div className="mx-auto max-w-3xl">
          <div className="glass-panel p-8 text-center">
            <p className="text-sm text-muted-foreground">Work item not found.</p>
            <Link to="/additional-work">
              <Button variant="ghost" className="mt-3"><ArrowLeft className="mr-1 h-4 w-4" /> Back to Additional Work</Button>
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Header */}
        <div className="glass-panel p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link to="/additional-work" className="hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back to Additional Work
                </Link>
              </div>
              <h1 className="mt-1 text-lg font-semibold text-foreground">{w.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {w.accountNumber ? (
                  <Link to="/accounts/$accountNumber" params={{ accountNumber: w.accountNumber }} className="rounded-full border border-border/40 px-2 py-0.5 hover:border-cyan-glow/60 hover:text-foreground">
                    <Building2 className="mr-1 inline h-3 w-3" />
                    {w.accountNumber} · {w.accountName}
                  </Link>
                ) : (
                  <span className="rounded-full border border-border/40 px-2 py-0.5">No account linked</span>
                )}
                <span
                  className="rounded-full border px-2 py-0.5 uppercase tracking-wider"
                  style={
                    w.status === "completed"
                      ? { color: "var(--green-glow)", borderColor: "color-mix(in oklab, var(--green-glow) 50%, transparent)" }
                      : { color: "var(--cyan-glow)", borderColor: "color-mix(in oklab, var(--cyan-glow) 40%, transparent)" }
                  }
                >
                  {w.status === "completed" ? "Completed" : "Currently Working On"}
                </span>
                <span>Updated {formatCentralShort(new Date(w.updatedAt))}</span>
              </div>
            </div>
            <div className="flex gap-2">
              {w.accountNumber && (
                <Link to="/accounts/$accountNumber" params={{ accountNumber: w.accountNumber }}>
                  <Button variant="ghost"><Building2 className="mr-1.5 h-4 w-4" /> Open Account</Button>
                </Link>
              )}
              {w.status === "working" && (
                <Button
                  onClick={() => setConfirmComplete(true)}
                  style={{ background: "linear-gradient(110deg, oklch(0.36 0.14 160 / 0.7), oklch(0.4 0.18 200 / 0.55))", border: "1px solid color-mix(in oklab, var(--green-glow) 50%, transparent)" }}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark Completed
                </Button>
              )}
            </div>
          </div>
        </div>

        <WorkDetailsSection workId={w.id} />
        <NotesSection workId={w.id} />
        <SnipsSection workId={w.id} />
        <ProgrammingStatusSection workId={w.id} />
        <CompletionSummarySection workId={w.id} />

        <MarkCompletedModal
          open={confirmComplete}
          onOpenChange={setConfirmComplete}
          workId={w.id}
          onDone={() => nav({ to: "/additional-work" })}
        />
      </div>
    </>
  );
}

function Collapsible({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-panel">
      <button onClick={() => setOpen((s) => !s)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border/30 px-4 py-3 sm:px-5 sm:py-4">{children}</div>}
    </div>
  );
}

function WorkDetailsSection({ workId }: { workId: string }) {
  const w = additionalWorkStore.get(workId)!;
  useAdditionalWork();
  const [title, setTitle] = useState(w.title);
  const [acctNum, setAcctNum] = useState(w.accountNumber ?? "");
  const [acctName, setAcctName] = useState(w.accountName ?? "");
  const [need, setNeed] = useState(w.whatNeedsDone);
  const [classification, setClassification] = useState<AddWorkIssueClassification | "">(w.issueClassification ?? "");

  const save = () => {
    additionalWorkStore.update(workId, {
      title: title.trim() || w.title,
      accountNumber: acctNum.trim() || undefined,
      accountName: acctName.trim() || undefined,
      whatNeedsDone: need,
      issueClassification: classification || undefined,
    });
    toast.success("Details saved.");
  };

  return (
    <Collapsible title="Work Details">
      <div className="space-y-3">
        <Field label="Work Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Account Number (optional)">
            <Input value={acctNum} onChange={(e) => setAcctNum(e.target.value)} onBlur={save} />
          </Field>
          <Field label="Account Name (optional)">
            <Input value={acctName} onChange={(e) => setAcctName(e.target.value)} onBlur={save} />
          </Field>
        </div>
        <Field label="What Needs Done">
          <RichTextEditor minHeight={72} value={need} onChange={setNeed} onBlur={save} />
        </Field>
        <Field label="Issue Classification (optional)">
          <Select value={classification} onValueChange={(v) => { setClassification(v as any); setTimeout(save, 0); }}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Scripting Issue">Scripting Issue</SelectItem>
              <SelectItem value="Client Change">Client Change</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </Collapsible>
  );
}

function NotesSection({ workId }: { workId: string }) {
  useAdditionalWork();
  const w = additionalWorkStore.get(workId)!;
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const add = () => {
    if (!draft.trim()) return;
    additionalWorkStore.addNote(workId, draft.trim());
    setDraft("");
    toast.success("Note added.");
  };

  return (
    <Collapsible title="Notes">
      <div className="space-y-3">
        <div className="flex gap-2">
          <RichTextEditor minHeight={72} value={draft} onChange={setDraft} placeholder="Add a note…" />
          <Button onClick={add} disabled={!draft.trim()}><Plus className="h-4 w-4" /></Button>
        </div>
        {w.notesList.length === 0 && (
          <p className="text-xs text-muted-foreground">No notes yet.</p>
        )}
        <ul className="space-y-2">
          {w.notesList.map((n) => (
            <li key={n.id} className="rounded-md border border-border/30 bg-white/[0.02] p-3">
              {editingId === n.id ? (
                <div className="space-y-2">
                  <RichTextEditor minHeight={72} value={editText} onChange={setEditText} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => { additionalWorkStore.editNote(workId, n.id, editText); setEditingId(null); toast.success("Note updated."); }}>Save</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{n.text}</p>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{n.initials} · {formatCentralShort(new Date(n.createdAt))}{n.editedAt ? " · edited" : ""}</span>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(n.id); setEditText(n.text); }} className="rounded p-1 hover:bg-white/5"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => setConfirmDel(n.id)} className="rounded p-1 hover:bg-white/5"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
      <Dialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <DialogContent className="glass-panel border-0 sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Note?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button onClick={() => { if (confirmDel) additionalWorkStore.deleteNote(workId, confirmDel); setConfirmDel(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}

function SnipsSection({ workId }: { workId: string }) {
  useAdditionalWork();
  const w = additionalWorkStore.get(workId)!;
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  return (
    <Collapsible title={`Snips (${w.snips.length})`}>
      <div className="space-y-3">
        <Button size="sm" variant="ghost" onClick={() => setModalOpen(true)}>
          <Plus className="mr-1 h-3 w-3" /> Add Snip
        </Button>
        {w.snips.length === 0 && <p className="text-xs text-muted-foreground">No snips yet.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {w.snips.map((s) => (
            <div key={s.id} className="flex gap-3 rounded-md border border-border/30 bg-white/[0.02] p-2">
              <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-md bg-black/30">
                {s.dataUrl && s.isImage ? (
                  <img src={s.dataUrl} alt={s.name} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-foreground">{s.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.category}</div>
                {s.label && <div className="line-clamp-1 text-xs text-muted-foreground">{s.label}</div>}
                <div className="mt-1 text-[10px] text-muted-foreground">{formatCentralShort(new Date(s.createdAt))}</div>
                <div className="mt-1 flex gap-1">
                  {s.dataUrl && s.isImage && (
                    <>
                      <button onClick={() => { navigator.clipboard.writeText(s.dataUrl!); toast.success("Copied."); }} className="rounded p-1 hover:bg-white/5" title="Copy"><Copy className="h-3 w-3" /></button>
                      <a href={s.dataUrl} download={s.name} className="rounded p-1 hover:bg-white/5" title="Download"><Download className="h-3 w-3" /></a>
                      <a href={s.dataUrl} target="_blank" rel="noreferrer" className="rounded p-1 hover:bg-white/5" title="Open full"><ExternalLink className="h-3 w-3" /></a>
                    </>
                  )}
                  <button onClick={() => setConfirmDel(s.id)} className="rounded p-1 hover:bg-white/5 ml-auto" title="Delete"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <AddWorkSnipModal workId={workId} open={modalOpen} onOpenChange={setModalOpen} />
      <Dialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <DialogContent className="glass-panel border-0 sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Snip?</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button onClick={() => { if (confirmDel) additionalWorkStore.deleteSnip(workId, confirmDel); setConfirmDel(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}

function ProgrammingStatusSection({ workId }: { workId: string }) {
  useAdditionalWork();
  const w = additionalWorkStore.get(workId)!;
  const [val, setVal] = useState(w.programmingStatusNotes);
  return (
    <Collapsible title="Programming Status Notes" defaultOpen={false}>
      <RichTextEditor
        minHeight={88}
        value={val}
        onChange={setVal}
        onBlur={() => additionalWorkStore.update(workId, { programmingStatusNotes: val })}
        placeholder="Optional — used later in the Programming Status Email"
      />
    </Collapsible>
  );
}

function CompletionSummarySection({ workId }: { workId: string }) {
  useAdditionalWork();
  const w = additionalWorkStore.get(workId)!;
  const [summary, setSummary] = useState(w.completionSummary ?? "");
  const [final, setFinal] = useState(w.completionFinalNotes ?? "");
  return (
    <Collapsible title="Completion Summary" defaultOpen={false}>
      <div className="space-y-3">
        <Field label="What was completed">
          <RichTextEditor minHeight={72} value={summary} onChange={setSummary} onBlur={() => additionalWorkStore.update(workId, { completionSummary: summary })} />
        </Field>
        <Field label="Final Notes (optional)">
          <RichTextEditor minHeight={72} value={final} onChange={setFinal} onBlur={() => additionalWorkStore.update(workId, { completionFinalNotes: final })} />
        </Field>
        {w.status === "completed" && (
          <div className="text-[11px] text-muted-foreground">
            Completed by {w.completedBy ?? "LTP"} · {w.completedAt ? formatCentralShort(new Date(w.completedAt)) : ""}
          </div>
        )}
      </div>
    </Collapsible>
  );
}

function MarkCompletedModal({
  open, onOpenChange, workId, onDone,
}: { open: boolean; onOpenChange: (v: boolean) => void; workId: string; onDone: () => void }) {
  const w = additionalWorkStore.get(workId);
  if (!w) return null;
  const titleMissing = !w.title.trim();
  const summaryMissing = !(w.completionSummary ?? "").trim();

  const confirm = () => {
    additionalWorkStore.markCompleted(workId);
    toast.success("Additional Work marked completed.");
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Mark Additional Work Completed?</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">This will:</p>
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            <li>Set status to Completed</li>
            <li>Save completed timestamp in Central</li>
            <li>Record initials as LTP</li>
            <li>Remove from active Additional Work</li>
            <li>Add to Recently Completed Work</li>
            {w.accountNumber && <li>Add to Account Timeline ({w.accountNumber})</li>}
          </ul>
          {summaryMissing && (
            <div className="rounded-md border border-gold-glow/40 bg-white/[0.03] p-2 text-xs" style={{ color: "var(--gold-glow)" }}>
              This work does not have a completion summary yet.
            </div>
          )}
          {titleMissing && (
            <div className="rounded-md border border-destructive/40 bg-white/[0.03] p-2 text-xs text-destructive">
              Work Title is required before completion.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={titleMissing}
            onClick={confirm}
            style={{ background: "linear-gradient(110deg, oklch(0.36 0.14 160 / 0.7), oklch(0.4 0.18 200 / 0.55))", border: "1px solid color-mix(in oklab, var(--green-glow) 50%, transparent)" }}
          >
            {summaryMissing ? "Mark Completed Anyway" : "Mark Completed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className={cn("mt-1")}>{children}</div>
    </div>
  );
}