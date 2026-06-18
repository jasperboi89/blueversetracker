import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function MarkActivatedModal({
  open, onOpenChange, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Mark this account Activated?</DialogTitle></DialogHeader>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>• set Contact Dispatch status to Activated</li>
          <li>• stamp activated timestamp + LTP initials</li>
          <li>• hide from Active Sessions and the Mini Dashboard</li>
          <li>• move to the Contact Dispatch Archive (you can reopen anytime)</li>
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => { onConfirm(); onOpenChange(false); }}
            style={{
              background: "linear-gradient(110deg, oklch(0.82 0.18 155 / 0.55), oklch(0.4 0.18 290 / 0.5))",
              border: "1px solid oklch(0.82 0.18 155 / 0.55)",
              boxShadow: "0 0 16px oklch(0.82 0.18 155 / 0.4)",
            }}
          >Mark Activated</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}