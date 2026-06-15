import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Clock } from "lucide-react";
import type { NightPlanItem } from "@/lib/night-plan-store";

const priorityLabel: Record<NightPlanItem["priority"], string> = {
  must: "Must",
  important: "Important",
  normal: "Normal",
};

export function RolloverPromptModal({
  open,
  onOpenChange,
  activeItems,
  onCarry,
  onFresh,
  onSnooze,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activeItems: NightPlanItem[];
  onCarry: () => void;
  onFresh: () => void;
  onSnooze: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[color:var(--cyan-glow)]" />
            Shift ends soon
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            {activeItems.length} item{activeItems.length === 1 ? "" : "s"} still open. Move them to tomorrow's plan and start fresh?
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
            {activeItems.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-foreground/90">{i.task || <em className="text-muted-foreground">Untitled</em>}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{priorityLabel[i.priority]}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            At 6:00 AM Central the plan resets automatically. If you skip this prompt, leftovers will be dismissed.
          </p>
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onSnooze}>
            <Clock className="mr-1 h-3.5 w-3.5" /> Snooze 10 min
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onFresh}>Start Fresh</Button>
            <Button onClick={onCarry} style={{ background: "var(--cyan-glow)", color: "#04150a" }}>
              Move to Tomorrow <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}