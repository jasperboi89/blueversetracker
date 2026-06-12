import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function MarkPostedModal({
  open, onOpenChange, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Mark this Contact Dispatch summary note as posted manually?</DialogTitle></DialogHeader>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>• mark the current note version as posted</li>
          <li>• save posted timestamp in Central</li>
          <li>• record initials as LTP</li>
          <li>• keep version history inside the portal</li>
          <li>• does not change the final Contact Dispatch status</li>
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => { onConfirm(); onOpenChange(false); }}
            style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
          >Mark Posted</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}