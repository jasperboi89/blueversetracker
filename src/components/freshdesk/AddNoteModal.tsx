import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { ticketsStore } from "@/lib/tickets-store";
import { toast } from "sonner";

export function AddNoteModal({ ticketId, open, onOpenChange }: { ticketId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [body, setBody] = useState("");
  const save = () => {
    if (!body.trim()) return;
    ticketsStore.addNote(ticketId, body.trim());
    toast.success("Note saved to Hub history.");
    setBody("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setBody(""); onOpenChange(v); }}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Hub Note</DialogTitle>
        </DialogHeader>
        <RichTextEditor value={body} onChange={setBody} minHeight={110} placeholder="Note saved to Hub only — does not post to Freshdesk." autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!body.trim()}
            style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
          >Save Note</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}