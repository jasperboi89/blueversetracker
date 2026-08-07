import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function split(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

/**
 * Shared editor for any tracked duration — the live timer or a logged session.
 * Keeps time honest by letting the operator correct forgotten/left-running timers.
 */
export function TimeEditDialog({
  open,
  onOpenChange,
  title = "Edit time spent",
  valueMs,
  label,
  onLabelChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  valueMs: number;
  label?: string;
  onLabelChange?: (v: string) => void;
  onSave: (ms: number, label?: string) => void;
  onDelete?: () => void;
}) {
  const [h, setH] = useState(0);
  const [m, setM] = useState(0);
  const [s, setS] = useState(0);
  const [lbl, setLbl] = useState(label ?? "");

  useEffect(() => {
    if (!open) return;
    const p = split(valueMs);
    setH(p.h);
    setM(p.m);
    setS(p.s);
    setLbl(label ?? "");
  }, [open, valueMs, label]);

  const ms = (h * 3600 + m * 60 + s) * 1000;
  const nudge = (deltaMinutes: number) => {
    const p = split(Math.max(0, ms + deltaMinutes * 60_000));
    setH(p.h);
    setM(p.m);
    setS(p.s);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["Hours", h, setH, 99],
                ["Minutes", m, setM, 59],
                ["Seconds", s, setS, 59],
              ] as const
            ).map(([lab, val, set, max]) => (
              <div key={lab}>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{lab}</label>
                <Input
                  className="mt-1 font-mono tabular-nums"
                  inputMode="numeric"
                  value={String(val)}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ""));
                    set(Number.isFinite(n) ? Math.min(max, n) : 0);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[-15, -5, 5, 15, 30].map((d) => (
              <Button key={d} size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => nudge(d)}>
                {d > 0 ? `+${d}m` : `${d}m`}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setH(0);
                setM(0);
                setS(0);
              }}
            >
              Reset
            </Button>
          </div>
          {onLabelChange && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Label</label>
              <Input className="mt-1" value={lbl} onChange={(e) => setLbl(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {onDelete ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                onDelete();
                onOpenChange(false);
              }}
            >
              Delete entry
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSave(ms, onLabelChange ? lbl.trim() : undefined);
                onOpenChange(false);
              }}
            >
              Save time
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}