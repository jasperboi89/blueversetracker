import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function MarkReadyModal({
  open, onOpenChange, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: (alsoGenerate: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Mark Ready for Activation?</DialogTitle></DialogHeader>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>• set Contact Dispatch status to Ready for Activation</li>
          <li>• auto-set completed timestamp in Central</li>
          <li>• record initials as LTP</li>
          <li>• add to Recently Completed Work</li>
        </ul>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onConfirm(false); onOpenChange(false); }}>Mark Ready Only</Button>
          <Button
            onClick={() => { onConfirm(true); onOpenChange(false); }}
            style={{ background: "linear-gradient(110deg, oklch(0.82 0.18 155 / 0.5), oklch(0.4 0.18 290 / 0.5))", border: "1px solid oklch(0.82 0.18 155 / 0.5)", boxShadow: "0 0 16px oklch(0.82 0.18 155 / 0.4)" }}
          >Mark Ready + Generate Summary</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}