import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountsStore } from "@/lib/accounts-store";
import { nightPlanStore, type NightPlanItem } from "@/lib/night-plan-store";
import { toast } from "sonner";

export function ConvertFromNightPlanModal({
  item, open, onOpenChange, onConverted,
}: {
  item: NightPlanItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConverted?: () => void;
}) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ number: string; name: string } | null>(null);

  const results = useMemo(() => (q.trim() ? accountsStore.search(q, { includeArchived: false }) : []), [q]);

  const convert = (account?: { number: string; name: string }) => {
    const workId = nightPlanStore.convertToAdditionalWork(item.id, account);
    if (!workId) return;
    toast.success("Converted to Additional Work.");
    onOpenChange(false);
    onConverted?.();
    nav({ to: "/additional-work/$workId/work", params: { workId } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Convert to Additional Work?</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">"{item.task}"</p>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Attach Account (optional)</label>
            <Input className="mt-1" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="Search account number or name" />
          </div>
          {results.length > 0 && !picked && (
            <div className="space-y-1 rounded-lg border border-border/30 bg-white/[0.02] p-2 text-sm">
              {results.map((a) => (
                <button
                  key={a.number}
                  onClick={() => { setPicked({ number: a.number, name: a.name }); setQ(`${a.number} ${a.name}`); }}
                  className="block w-full rounded px-2 py-1 text-left hover:bg-white/5"
                >
                  <span className="tabular-nums text-muted-foreground">{a.number}</span>{" "}
                  <span className="text-foreground">{a.name}</span>
                </button>
              ))}
            </div>
          )}
          {picked && (
            <div className="rounded-md border border-cyan-glow/40 bg-white/[0.04] p-2 text-xs">
              Will attach to <span className="font-medium text-foreground">{picked.number} — {picked.name}</span>
            </div>
          )}
        </div>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="ghost" onClick={() => convert()}>Convert Without Account</Button>
          <Button
            disabled={!picked}
            onClick={() => picked && convert(picked)}
            style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
          >
            Attach Account & Convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}