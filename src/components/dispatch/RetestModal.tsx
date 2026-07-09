import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dispatchStore } from "@/lib/dispatch-store";
import { formatCentralShort } from "@/lib/shift";
import { toast } from "sonner";
import { useDropdownGroup } from "@/lib/settings/dropdowns-store";

export function RetestModal({
  sessionId, open, onOpenChange, target,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: { kind: "reason"; reasonId: string } | { kind: "section"; key: "phone" | "repeat" | "saveSummary" };
}) {
  const [result, setResult] = useState<"passed" | "still-failed" | "">("");
  const [notes, setNotes] = useState("");
  const resultOptions = useDropdownGroup("retestResult");

  const save = () => {
    if (!result) return;
    dispatchStore.addRetest(sessionId, target, { at: Date.now(), result, notes: notes.trim(), snipIds: [] });
    toast.success("Retest recorded.");
    setResult(""); setNotes(""); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Add Retest</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-[11px] text-muted-foreground">Timestamp will be saved as {formatCentralShort(new Date())}, LTP.</div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Result</label>
            <Select value={result} onValueChange={(v) => setResult(v as "passed" | "still-failed")}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select result" /></SelectTrigger>
              <SelectContent>
                {resultOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Retest Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!result}
            style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
          >Save Retest</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}