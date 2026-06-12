import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  ListChecks,
  Pin,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  nightPlanStore,
  priorityRank,
  useNightPlan,
  isActive,
  type NightPlanItem,
  type Priority,
  type Status,
} from "@/lib/night-plan-store";
import { formatCentralShort, getShiftKey, getShiftStatus } from "@/lib/shift";
import { CelebrationOverlay } from "./CelebrationOverlay";
import { useTheme } from "@/lib/settings/theme-store";
import { triggerCelebration } from "@/lib/quantum-bloom/celebration-bus";
import { useNow } from "@/hooks/use-now";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConvertFromNightPlanModal } from "@/components/additional-work/ConvertFromNightPlanModal";

const priorityMeta: Record<Priority, { label: string; color: string; icon: typeof Star }> = {
  must: { label: "Must Do Tonight", color: "var(--gold-glow)", icon: Star },
  important: { label: "Important", color: "var(--electric)", icon: Pin },
  normal: { label: "Normal", color: "var(--cyan-glow)", icon: CircleDot },
};

const statusLabel: Record<Status, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
  carried: "Carried Over",
  dismissed: "Dismissed",
  converted: "Converted",
};

export function NightPlan() {
  const { items } = useNightPlan();
  const now = useNow(30_000);
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"active" | "completed" | "dismissed" | "converted">("active");
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<{ id: string; from: typeof drawerTab } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const celebKey = useRef<string>("");

  const active = items.filter((i) => isActive(i.status));
  const done = items.filter((i) => i.status === "done");
  const dismissed = items.filter((i) => i.status === "dismissed");
  const converted = items.filter((i) => i.status === "converted");

  // counted denominator: items not converted
  const counted = items.filter((i) => i.status !== "converted");
  const totalForProgress = counted.length;
  const doneCount = done.length;
  const pct = totalForProgress === 0 ? 0 : Math.round((doneCount / totalForProgress) * 100);

  const breakdown = (() => {
    const m: Record<Priority, number> = { must: 0, important: 0, normal: 0 };
    active.forEach((i) => (m[i.priority] += 1));
    return m;
  })();

  const sortedActive = useMemo(
    () =>
      [...active].sort(
        (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.createdAt - b.createdAt,
      ),
    [active],
  );

  // celebration trigger
  useEffect(() => {
    const sk = getShiftKey();
    const shiftEnded = getShiftStatus() === "complete";
    if (
      totalForProgress > 0 &&
      doneCount === totalForProgress &&
      !shiftEnded &&
      celebKey.current !== `${sk}:${totalForProgress}:${doneCount}`
    ) {
      celebKey.current = `${sk}:${totalForProgress}:${doneCount}`;
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 5000);
      return () => clearTimeout(t);
    }
  }, [doneCount, totalForProgress]);

  const isEmpty = items.length === 0;
  const allDone = totalForProgress > 0 && doneCount === totalForProgress;

  return (
    <div className="glass-panel relative overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <NightPlanRing pct={pct} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Night Plan</h2>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Personal Shift Planner
              </span>
            </div>
            {isEmpty ? (
              <p className="mt-1 text-sm text-muted-foreground">No plan items yet</p>
            ) : allDone ? (
              <p className="mt-1 text-sm text-foreground">All planned items completed</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-foreground">
                  {doneCount} of {totalForProgress} done
                  {dismissed.length > 0 && ` · ${dismissed.length} dismissed`}
                  {converted.length > 0 && ` · ${converted.length} converted`}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {breakdown.must} Must Do Tonight · {breakdown.important} Important · {breakdown.normal} Normal
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <Button variant="ghost" onClick={() => setExpanded((s) => !s)} className="text-foreground">
              <ListChecks className="mr-1.5 h-4 w-4" /> {expanded ? "Hide" : "Open Night Plan"}
            </Button>
          )}
          <BlueverseButton onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Item
          </BlueverseButton>
        </div>
      </div>

      {expanded && !isEmpty && (
        <div className="mt-5 space-y-2">
          {sortedActive.slice(0, 5).map((i) => (
            <PlanRow key={i.id} item={i} onClick={() => setDetail({ id: i.id, from: "active" })} />
          ))}
          {sortedActive.length === 0 && (
            <div className="text-sm text-muted-foreground">No active items.</div>
          )}
          {sortedActive.length > 5 && (
            <Button
              variant="ghost"
              className="w-full text-cyan-glow"
              style={{ color: "var(--cyan-glow)" }}
              onClick={() => {
                setDrawerTab("active");
                setDrawerOpen(true);
              }}
            >
              View More ({sortedActive.length - 5} more)
            </Button>
          )}
          <div className="pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setDrawerOpen(true)}
            >
              Open full drawer
            </Button>
          </div>
        </div>
      )}

      {/* Add Item modal */}
      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Drawer */}
      <NightPlanDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        tab={drawerTab}
        onTabChange={setDrawerTab}
        items={items}
        onOpenItem={(id) => setDetail({ id, from: drawerTab })}
        isMobile={isMobile}
      />

      {/* Detail */}
      {detail && (
        <ItemDetailDialog
          item={items.find((i) => i.id === detail.id)!}
          onClose={() => setDetail(null)}
        />
      )}

      {celebrate && (
        <CelebrationOverlay
          variant="nightplan"
          title="Night Plan Complete"
          subtitle={`Tonight's plan is cleared.\nBlueVerse focus restored.\nNice work, Luke.`}
        />
      )}
    </div>
  );
}

function NightPlanRing({ pct }: { pct: number }) {
  const size = 78;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="oklch(0.7 0.12 235 / 0.18)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--cyan-glow)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ filter: "drop-shadow(0 0 6px var(--cyan-glow))", transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-sm font-semibold tabular-nums">{pct}%</div>
      </div>
    </div>
  );
}

function PlanRow({ item, onClick }: { item: NightPlanItem; onClick: () => void }) {
  const meta = priorityMeta[item.priority];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-lg border border-border/30 bg-white/[0.02] p-3 text-left transition hover:border-border/60 hover:bg-white/[0.05]"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: meta.color, filter: `drop-shadow(0 0 4px ${meta.color})` }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium text-foreground">{item.task}</div>
          <span className="shrink-0 rounded-full border border-border/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {statusLabel[item.status]}
          </span>
        </div>
        {item.notes && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.notes}</div>}
      </div>
    </button>
  );
}

function BlueverseButton({ children, onClick, variant = "primary" }: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "subtle";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shimmer relative inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium text-foreground transition",
      )}
      style={
        variant === "primary"
          ? {
              background:
                "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))",
              border: "1px solid oklch(0.78 0.18 220 / 0.45)",
              boxShadow: "0 0 16px oklch(0.78 0.18 220 / 0.3), inset 0 1px 0 oklch(1 0 0 / 0.08)",
            }
          : {
              background: "oklch(0.22 0.06 270 / 0.6)",
              border: "1px solid oklch(0.7 0.12 235 / 0.2)",
            }
      }
    >
      {children}
    </button>
  );
}

function AddItemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [task, setTask] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);
  const taskRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTask("");
    setNotes("");
    setPriority("normal");
    setTimeout(() => taskRef.current?.focus(), 50);
  };
  const hasUnsaved = task.trim().length > 0 || notes.trim().length > 0;

  const handleAdd = () => {
    if (!task.trim()) return;
    nightPlanStore.add(task.trim(), notes.trim(), priority);
    toast.success("Added to Night Plan.", { duration: 2000 });
    reset();
  };

  const tryClose = (after: () => void) => {
    if (hasUnsaved) {
      setConfirmDiscard(() => after);
    } else {
      after();
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) tryClose(() => onOpenChange(false));
          else onOpenChange(v);
        }}
      >
        <DialogContent className="glass-panel border-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Night Plan Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Task / Reminder</label>
              <Input
                ref={taskRef}
                autoFocus
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="What needs attention tonight?"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                rows={3}
                placeholder="Optional context"
                className="mt-1"
              />
              <div className="mt-1 text-[10px] text-muted-foreground/70">Enter to add · Ctrl+Enter from Notes</div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Priority</label>
              <div className="mt-1 flex gap-2">
                {(Object.keys(priorityMeta) as Priority[]).map((p) => {
                  const m = priorityMeta[p];
                  const Icon = m.icon;
                  const active = priority === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition",
                        active ? "border-transparent text-foreground" : "border-border/40 text-muted-foreground hover:text-foreground",
                      )}
                      style={
                        active
                          ? { background: `${m.color.replace(")", " / 0.18)")}`, boxShadow: `0 0 12px ${m.color}` }
                          : undefined
                      }
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: m.color }} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => tryClose(() => onOpenChange(false))}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={() => tryClose(() => onOpenChange(false))}>
              Done Adding
            </Button>
            <BlueverseButton onClick={handleAdd}>Add Item</BlueverseButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDiscard} onOpenChange={(v) => !v && setConfirmDiscard(null)}>
        <DialogContent className="glass-panel border-0 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Unsaved Night Plan Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">You have text entered that has not been added yet.</p>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirmDiscard(null)}>Go Back</Button>
            <Button
              variant="ghost"
              onClick={() => {
                const after = confirmDiscard!;
                setConfirmDiscard(null);
                reset();
                after();
              }}
            >
              Discard & Close
            </Button>
            <BlueverseButton
              onClick={() => {
                handleAdd();
                const after = confirmDiscard!;
                setConfirmDiscard(null);
                after();
              }}
            >
              Add Item & Close
            </BlueverseButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NightPlanDrawer({
  open,
  onOpenChange,
  tab,
  onTabChange,
  items,
  onOpenItem,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tab: "active" | "completed" | "dismissed" | "converted";
  onTabChange: (t: any) => void;
  items: NightPlanItem[];
  onOpenItem: (id: string) => void;
  isMobile: boolean;
}) {
  const active = items.filter((i) => isActive(i.status));
  const done = items.filter((i) => i.status === "done");
  const dismissed = items.filter((i) => i.status === "dismissed");
  const converted = items.filter((i) => i.status === "converted");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("glass-panel border-0", isMobile ? "h-[75vh]" : "w-[460px] sm:max-w-[460px]")}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--cyan-glow)" }} />
            Night Plan
          </SheetTitle>
        </SheetHeader>
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as any)} className="mt-3">
          <TabsList className="grid w-full grid-cols-4 bg-white/5">
            <TabsTrigger value="active">Active {active.length}</TabsTrigger>
            <TabsTrigger value="completed">Done {done.length}</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed {dismissed.length}</TabsTrigger>
            <TabsTrigger value="converted">Converted {converted.length}</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-3 space-y-3">
            {(["must", "important", "normal"] as Priority[]).map((p) => {
              const list = active
                .filter((i) => i.priority === p)
                .sort((a, b) => a.createdAt - b.createdAt);
              if (!list.length) return null;
              const m = priorityMeta[p];
              return (
                <div key={p}>
                  <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: m.color }}>
                    {m.label}
                  </div>
                  <div className="space-y-2">
                    {list.map((i) => (
                      <PlanRow key={i.id} item={i} onClick={() => onOpenItem(i.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
            {active.length === 0 && <Empty text="No active items." />}
          </TabsContent>
          <TabsContent value="completed" className="mt-3 space-y-2">
            {done.length === 0 && <Empty text="Nothing completed this shift yet." />}
            {done
              .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
              .map((i) => (
                <div key={i.id}>
                  <PlanRow item={i} onClick={() => onOpenItem(i.id)} />
                  <div className="px-3 pt-1 text-[10px] text-muted-foreground">
                    Created {formatCentralShort(new Date(i.createdAt))}
                    {i.completedAt && ` · Completed ${formatCentralShort(new Date(i.completedAt))}`}
                  </div>
                </div>
              ))}
          </TabsContent>
          <TabsContent value="dismissed" className="mt-3 space-y-2">
            {dismissed.length === 0 && <Empty text="No dismissed items." />}
            {dismissed
              .sort((a, b) => a.createdAt - b.createdAt)
              .map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <PlanRow item={i} onClick={() => onOpenItem(i.id)} />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => nightPlanStore.setStatus(i.id, "todo")}
                    className="text-xs"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" /> Restore
                  </Button>
                </div>
              ))}
          </TabsContent>
          <TabsContent value="converted" className="mt-3 space-y-2">
            {converted.length === 0 && <Empty text="No converted items." />}
            {converted.map((i) => (
              <ConvertedRow key={i.id} item={i} onOpen={() => onOpenItem(i.id)} />
            ))}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border/40 p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function ConvertedRow({ item, onOpen }: { item: NightPlanItem; onOpen: () => void }) {
  const nav = useNavigate();
  return (
    <div>
      <PlanRow item={item} onClick={onOpen} />
      <div className="mt-1 px-3">
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          disabled={!item.additionalWorkId}
          onClick={() =>
            item.additionalWorkId &&
            nav({ to: "/additional-work/$workId/work", params: { workId: item.additionalWorkId } })
          }
        >
          Open Additional Work
        </Button>
      </div>
    </div>
  );
}

function ItemDetailDialog({ item, onClose }: { item: NightPlanItem; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [task, setTask] = useState(item.task);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [confirm, setConfirm] = useState<null | "done" | "carry" | "dismiss">(null);
  const [convertOpen, setConvertOpen] = useState(false);

  useEffect(() => {
    setTask(item.task);
    setNotes(item.notes ?? "");
    setPriority(item.priority);
  }, [item.id]);

  const meta = priorityMeta[item.priority];
  const Icon = meta.icon;

  const save = () => {
    nightPlanStore.update(item.id, { task: task.trim() || item.task, notes: notes.trim() || undefined, priority });
    setEditing(false);
    toast.success("Item updated.");
  };

  const confirmMeta: Record<NonNullable<typeof confirm>, { label: string; color: string; action: () => void }> = {
    done: { label: "Mark Done", color: "var(--green-glow)", action: () => nightPlanStore.setStatus(item.id, "done") },
    carry: { label: "Carry Over", color: "var(--cyan-glow)", action: () => nightPlanStore.setStatus(item.id, "carried") },
    dismiss: { label: "Dismiss", color: "var(--gold-glow)", action: () => nightPlanStore.setStatus(item.id, "dismissed") },
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="glass-panel border-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <button onClick={onClose} className="rounded-md p-1 hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
              Item Detail
            </DialogTitle>
          </DialogHeader>
          {!editing ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4" style={{ color: meta.color }} />
                <div>
                  <div className="text-base font-medium text-foreground">{item.task}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{meta.label} · {statusLabel[item.status]}</div>
                </div>
              </div>
              {item.notes && <p className="rounded-lg bg-white/5 p-3 text-sm text-foreground/90">{item.notes}</p>}
              <div className="text-[11px] text-muted-foreground">
                Created {formatCentralShort(new Date(item.createdAt))}
                {item.completedAt && ` · Completed ${formatCentralShort(new Date(item.completedAt))}`}
              </div>
              <div className="flex flex-wrap gap-2">
                {item.status !== "done" && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirm("done")}>
                    <CheckCircle2 className="mr-1 h-4 w-4" style={{ color: "var(--green-glow)" }} /> Mark Done
                  </Button>
                )}
                {isActive(item.status) && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirm("carry")}>
                    <RotateCcw className="mr-1 h-4 w-4" /> Carry Over
                  </Button>
                )}
                {item.status !== "dismissed" && item.status !== "converted" && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirm("dismiss")}>
                    <Trash2 className="mr-1 h-4 w-4" /> Dismiss
                  </Button>
                )}
                {item.status !== "converted" && (
                  <Button size="sm" variant="ghost" onClick={() => setConvertOpen(true)}>
                    <Wand2 className="mr-1 h-4 w-4" style={{ color: "var(--violet-glow)" }} /> Convert to Additional Work
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Input value={task} onChange={(e) => setTask(e.target.value)} />
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              <div className="flex gap-2">
                {(Object.keys(priorityMeta) as Priority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      priority === p ? "border-transparent text-foreground" : "border-border/40 text-muted-foreground",
                    )}
                    style={priority === p ? { background: `${priorityMeta[p].color.replace(")", " / 0.18)")}` } : undefined}
                  >
                    {priorityMeta[p].label}
                  </button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <BlueverseButton onClick={save}>Save</BlueverseButton>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {confirm && (
        <Dialog open onOpenChange={(v) => !v && setConfirm(null)}>
          <DialogContent className="glass-panel border-0 sm:max-w-sm" style={{ boxShadow: `0 0 28px ${confirmMeta[confirm].color}` }}>
            <DialogHeader>
              <DialogTitle>{confirmMeta[confirm].label}?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">"{item.task}"</p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              <BlueverseButton
                onClick={() => {
                  confirmMeta[confirm].action();
                  setConfirm(null);
                  onClose();
                }}
              >
                Confirm
              </BlueverseButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConvertFromNightPlanModal
        item={item}
        open={convertOpen}
        onOpenChange={setConvertOpen}
        onConverted={onClose}
      />
    </>
  );
}