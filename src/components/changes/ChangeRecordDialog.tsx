import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CHANGE_RISKS, CHANGE_STATUSES, CHANGE_STATUS_LABELS, CHANGE_TYPES,
  CHANGE_TYPE_LABELS, CHECKLIST_PRESETS,
  type ChangeRisk, type ChangeStatus, type ChangeType,
} from "@/lib/changes/change-types";
import {
  deleteChangeRecord, updateChangeRecord,
  type AccountChangeRecord, type ChangeChecklistItem,
} from "@/lib/changes/changes.functions";

export function ChangeRecordDialog({
  record,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  record: AccountChangeRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (record: AccountChangeRecord) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<AccountChangeRecord | null>(record);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(record ? { ...record } : null);
  }, [record]);

  const checklistDone = useMemo(
    () => (draft?.checklist ?? []).filter((c) => c.done).length,
    [draft?.checklist],
  );

  if (!draft) return null;

  const set = <K extends keyof AccountChangeRecord>(key: K, value: AccountChangeRecord[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const applyPreset = (type: ChangeType) => {
    const items: ChangeChecklistItem[] = CHECKLIST_PRESETS[type].map((label, i) => ({
      id: `${type}-${i}`,
      label,
      done: false,
    }));
    setDraft((d) => (d ? { ...d, changeType: type, checklist: items } : d));
  };

  const save = async (extra?: Partial<AccountChangeRecord>) => {
    const next = { ...draft, ...extra };
    setSaving(true);
    try {
      const saved = await updateChangeRecord({
        data: {
          id: next.id,
          title: next.title.trim() || "Untitled change",
          changeType: next.changeType,
          accountNumber: next.accountNumber,
          accountName: next.accountName,
          beforeText: next.beforeText,
          afterText: next.afterText,
          requester: next.requester,
          risk: next.risk,
          status: next.status,
          rollbackNote: next.rollbackNote,
          checklist: next.checklist,
          ticketNumber: next.ticketNumber,
          testedBy: next.testedBy,
          notes: next.notes,
          verifiedAt: next.verifiedAt,
          appliedAt: next.appliedAt,
        },
      });
      onSaved(saved);
      setDraft(saved);
      toast.success("Change record saved.");
      return saved;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the change record.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteChangeRecord({ data: { id: draft.id } });
      onDeleted(draft.id);
      onOpenChange(false);
      toast.success("Change record deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the change record.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="sticky -top-6 z-10 -mx-6 -mt-6 bg-[var(--popover)] px-6 pb-3 pt-6">
          <DialogTitle>Change record</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">What changed</Label>
              <Input
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Updated weekend on-call rotation"
              />
            </div>
            <div>
              <Label className="text-xs">Change type</Label>
              <Select value={draft.changeType} onValueChange={(v) => applyPreset(v as ChangeType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{CHANGE_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Risk</Label>
              <Select value={draft.risk} onValueChange={(v) => set("risk", v as ChangeRisk)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANGE_RISKS.map((r) => (
                    <SelectItem key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Requested by</Label>
              <Input
                value={draft.requester}
                onChange={(e) => set("requester", e.target.value)}
                placeholder="Client contact or internal requester"
              />
            </div>
            <div>
              <Label className="text-xs">Ticket #</Label>
              <Input
                value={draft.ticketNumber}
                onChange={(e) => set("ticketNumber", e.target.value)}
                placeholder="Freshdesk ticket number"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Before</Label>
              <Textarea
                rows={4}
                value={draft.beforeText}
                onChange={(e) => set("beforeText", e.target.value)}
                placeholder="How it was set before you touched it"
              />
            </div>
            <div>
              <Label className="text-xs">After</Label>
              <Textarea
                rows={4}
                value={draft.afterText}
                onChange={(e) => set("afterText", e.target.value)}
                placeholder="How it is set now"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Rollback — how to undo this</Label>
            <Textarea
              rows={2}
              value={draft.rollbackNote}
              onChange={(e) => set("rollbackNote", e.target.value)}
              placeholder='e.g. "Set the Saturday on-call back to J. Rivera and remove the holiday override."'
            />
          </div>

          <div className="rounded-md border border-border/40 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-foreground">
                Pre-flight checks{" "}
                <span className="font-normal text-muted-foreground">
                  {checklistDone}/{draft.checklist.length}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => applyPreset(draft.changeType)}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to preset
              </Button>
            </div>
            {draft.checklist.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No checks yet — pick a change type or reset to the preset list.
              </p>
            ) : (
              <div className="space-y-1.5">
                {draft.checklist.map((item, idx) => (
                  <label key={item.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={(v) =>
                        set(
                          "checklist",
                          draft.checklist.map((c, i) => (i === idx ? { ...c, done: v === true } : c)),
                        )
                      }
                    />
                    <span className={item.done ? "line-through opacity-60" : ""}>{item.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Tested by</Label>
              <Input
                value={draft.testedBy}
                onChange={(e) => set("testedBy", e.target.value)}
                placeholder="Who verified it"
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={draft.status} onValueChange={(v) => set("status", v as ChangeStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANGE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{CHANGE_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything the next person needs to know"
            />
          </div>
        </div>

        <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 flex-wrap gap-2 border-t border-border/40 bg-[var(--popover)] px-6 py-4 sm:justify-between">
          <Button variant="ghost" className="text-destructive" onClick={remove}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() =>
                void save({ status: "applied", appliedAt: new Date().toISOString() })
              }
            >
              Mark applied
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() =>
                void save({ status: "verified", verifiedAt: new Date().toISOString() })
              }
            >
              <Check className="mr-1.5 h-4 w-4" /> Verified live
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}