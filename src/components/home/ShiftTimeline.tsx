import { useMemo, useState } from "react";
import { Coffee, Plus, Settings2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useShiftSettings } from "@/lib/settings/shift-settings-store";
import {
  formatClock,
  fromTimeValue,
  newMarkerId,
  offsetFromShiftStart,
  setMarkers,
  shiftLengthMinutes,
  sortMarkers,
  toTimeValue,
  useShiftMarkers,
  type ShiftMarker,
} from "@/lib/settings/shift-markers-store";
import { getCentralHM } from "@/lib/shift";

/**
 * SHIFT WINDOW 2.0 — a readable timeline of the night with operator-defined
 * markers (breaks, lunch, coverage, milestones).
 *
 * Presentation only. Markers are a local display preference; nothing here
 * schedules, enforces or reports anything.
 */
export function ShiftTimeline({ now, progress }: { now: Date; progress: number }) {
  const settings = useShiftSettings();
  const markers = useShiftMarkers();

  const total = shiftLengthMinutes(
    settings.startHour,
    settings.startMinute,
    settings.endHour,
    settings.endMinute,
  );

  const placed = useMemo(
    () =>
      sortMarkers(markers, settings.startHour, settings.startMinute)
        .map((m) => {
          const off = offsetFromShiftStart(m.hour, m.minute, settings.startHour, settings.startMinute);
          return { marker: m, pct: (off / total) * 100, off };
        })
        .filter((p) => p.pct >= 0 && p.pct <= 100),
    [markers, settings.startHour, settings.startMinute, total],
  );

  const nowHM = getCentralHM(now);
  const nowOff = offsetFromShiftStart(
    nowHM.hour,
    nowHM.minute,
    settings.startHour,
    settings.startMinute,
  );
  const inWindow = nowOff <= total;
  const pct = Math.round(progress * 100);

  const next = placed.find((p) => p.off > nowOff);

  return (
    <div className="cc-timeline">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Shift Timeline
        </span>
        <MarkerEditor />
      </div>

      <div className="cc-timeline__track" role="img" aria-label={`Shift ${pct}% elapsed`}>
        <div className="cc-timeline__fill" style={{ width: `${pct}%` }} />
        {placed.map(({ marker, pct: left }) => (
          <span
            key={marker.id}
            className="cc-timeline__marker"
            data-kind={marker.milestone ? "milestone" : "break"}
            style={{ left: `${left}%` }}
            title={`${marker.name} · ${formatClock(marker.hour, marker.minute)}${
              marker.durationMin ? ` · ${marker.durationMin} min` : ""
            }`}
          />
        ))}
        {inWindow && (
          <span className="cc-timeline__now" style={{ left: `${pct}%` }} aria-hidden />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <span className="tabular-nums">
          {formatClock(settings.startHour, settings.startMinute)}
        </span>
        <span className="truncate text-center">
          {next ? (
            <>
              Next marker · <span className="text-foreground">{next.marker.name}</span> at{" "}
              {formatClock(next.marker.hour, next.marker.minute)}
            </>
          ) : markers.length === 0 ? (
            "No markers set"
          ) : (
            "No further markers tonight"
          )}
        </span>
        <span className="tabular-nums">{formatClock(settings.endHour, settings.endMinute)}</span>
      </div>
    </div>
  );
}

function MarkerEditor() {
  const markers = useShiftMarkers();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ShiftMarker[]>(markers);

  function openChange(next: boolean) {
    if (next) setDraft(markers);
    setOpen(next);
  }

  function patch(id: string, changes: Partial<ShiftMarker>) {
    setDraft((cur) => cur.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]">
          <Settings2 className="h-3 w-3" aria-hidden />
          Markers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Shift markers</DialogTitle>
          <DialogDescription>
            Add breaks, lunch or milestones to your shift timeline. Saved to this device only.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground">No markers yet.</p>
          )}
          {draft.map((m) => (
            <div key={m.id} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
              <div className="min-w-0">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Label
                </Label>
                <Input
                  value={m.name}
                  onChange={(e) => patch(m.id, { name: e.target.value })}
                  placeholder="Break"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Time
                </Label>
                <Input
                  type="time"
                  className="w-[7.5rem]"
                  value={toTimeValue(m.hour, m.minute)}
                  onChange={(e) => {
                    const parsed = fromTimeValue(e.target.value);
                    if (parsed) patch(m.id, parsed);
                  }}
                />
              </div>
              <Button
                type="button"
                variant={m.milestone ? "default" : "outline"}
                size="icon"
                aria-label={m.milestone ? "Mark as break" : "Mark as milestone"}
                onClick={() => patch(m.id, { milestone: !m.milestone })}
              >
                {m.milestone ? <Star className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${m.name || "marker"}`}
                onClick={() => setDraft((cur) => cur.filter((x) => x.id !== m.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() =>
            setDraft((cur) => [
              ...cur,
              { id: newMarkerId(), name: "Break", hour: 1, minute: 0, milestone: false },
            ])
          }
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add marker
        </Button>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setMarkers(draft.filter((m) => m.name.trim().length > 0));
              setOpen(false);
            }}
          >
            Save markers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
