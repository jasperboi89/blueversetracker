import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function InactivityWarningModal({
  open,
  remainingMs,
  onStay,
  onSignOut,
}: {
  open: boolean;
  remainingMs: number;
  onStay: () => void;
  onSignOut: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000) - Math.floor((now - now) / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = (seconds % 60).toString().padStart(2, "0");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onStay(); }}>
      <DialogContent className="glass-panel border-border/40">
        <DialogHeader>
          <DialogTitle>Session Timeout Warning</DialogTitle>
          <DialogDescription>
            You will be signed out soon due to inactivity. Time remaining: <span className="font-mono">{mm}:{ss}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onSignOut}>Sign Out</Button>
          <Button onClick={onStay}>Stay Signed In</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}