import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accountsStore } from "@/lib/accounts-store";
import { additionalWorkStore, type AddWorkIssueClassification } from "@/lib/additional-work-store";
import { useDropdownGroup } from "@/lib/settings/dropdowns-store";
import { rememberSubject } from "@/lib/settings/subject-presets-store";
import { SubjectBuilder } from "@/components/additional-work/SubjectBuilder";
import { htmlToPlainText } from "@/lib/rich-text";
import { toast } from "sonner";

export function CreateAdditionalWorkModal({
  open, onOpenChange, prefillAccount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillAccount?: { number: string; name: string };
}) {
  const nav = useNavigate();
  const classificationOptions = useDropdownGroup("issueClassification");
  const [title, setTitle] = useState("");
  const [acctNum, setAcctNum] = useState(prefillAccount?.number ?? "");
  const [acctName, setAcctName] = useState(prefillAccount?.name ?? "");
  const [need, setNeed] = useState("");
  const [notes, setNotes] = useState("");
  const [classification, setClassification] = useState<AddWorkIssueClassification | "">("");
  const [progNotes, setProgNotes] = useState("");

  const matches = useMemo(() => {
    const q = (acctNum || acctName).trim();
    if (!q) return [];
    return accountsStore.search(q, { includeArchived: true }).slice(0, 5);
  }, [acctNum, acctName]);

  const reset = () => {
    setTitle(""); setAcctNum(prefillAccount?.number ?? ""); setAcctName(prefillAccount?.name ?? "");
    setNeed(""); setNotes(""); setClassification(""); setProgNotes("");
  };

  const save = (openAfter = true) => {
    if (!title.trim() || !need.trim()) {
      toast.error("Work Title and What Needs Done are required.");
      return;
    }
    const w = additionalWorkStore.create({
      title: title.trim(),
      accountNumber: acctNum.trim() || undefined,
      accountName: acctName.trim() || undefined,
      whatNeedsDone: need.trim(),
      notes: notes.trim(),
      programmingStatusNotes: progNotes.trim(),
      issueClassification: classification || undefined,
    });
    rememberSubject(title.trim(), acctNum.trim() || undefined);
    toast.success("Additional Work created.");
    reset();
    onOpenChange(false);
    if (openAfter) nav({ to: "/additional-work/$workId/work", params: { workId: w.id } });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="glass-panel border-0 sm:max-w-xl">
        <DialogHeader><DialogTitle>Create Additional Work</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <Field label="Work Title *">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Email client about holiday hours" />
            <div className="mt-1.5">
              <SubjectBuilder
                value={title}
                onChange={setTitle}
                accountNumber={acctNum.trim() || undefined}
                accountName={acctName || undefined}
                describeText={htmlToPlainText(need)}
              />
            </div>
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Account Number (optional)">
              <Input value={acctNum} onChange={(e) => {
                setAcctNum(e.target.value);
                const a = accountsStore.get(e.target.value.trim());
                if (a) setAcctName(a.name);
              }} placeholder="e.g. 1042" />
            </Field>
            <Field label="Account Name (optional)">
              <Input value={acctName} onChange={(e) => setAcctName(e.target.value)} placeholder="Company name" />
            </Field>
          </div>
          {matches.length > 0 && (
            <div className="rounded-lg border border-border/30 bg-white/[0.02] p-2 text-xs">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Matching accounts</div>
              {matches.map((a) => (
                <button
                  key={a.number}
                  type="button"
                  onClick={() => { setAcctNum(a.number); setAcctName(a.name); }}
                  className="block w-full rounded px-2 py-1 text-left hover:bg-white/5"
                >
                  <span className="tabular-nums text-muted-foreground">{a.number}</span>{" "}
                  <span className="text-foreground">{a.name}</span>
                </button>
              ))}
            </div>
          )}
          <Field label="What Needs Done *">
            <RichTextEditor minHeight={72} value={need} onChange={setNeed} placeholder="Describe the task or follow-up" />
          </Field>
          <Field label="Notes (optional)">
            <RichTextEditor minHeight={72} value={notes} onChange={setNotes} placeholder="Optional context" />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Issue Classification (optional)">
              <Select value={classification} onValueChange={(v) => setClassification(v as any)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {classificationOptions.map((o) => <SelectItem key={o.id} value={o.label}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <div className="rounded-md border border-border/30 bg-white/[0.02] px-3 py-2 text-sm">Currently Working On</div>
            </Field>
          </div>
          <Field label="Programming Status Notes (optional)">
            <RichTextEditor minHeight={72} value={progNotes} onChange={setProgNotes} placeholder="For Programming Status Email later" />
          </Field>
        </div>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="ghost" onClick={() => save(false)}>Save & Close</Button>
          <Button onClick={() => save(true)} style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}>
            Save & Open Work
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
      <div className="mt-1">{children}</div>
    </div>
  );
}