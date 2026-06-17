import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  dispatchStore, reasonCardStatus,
  type DispatchSession, type ReasonCard, type ReasonType,
} from "@/lib/dispatch-store";
import { useDropdownGroup, useDropdownLabel } from "@/lib/settings/dropdowns-store";
import { useGlobalReasonTemplates } from "@/lib/settings/reason-templates-store";
import { accountsStore, useAccounts } from "@/lib/accounts-store";
import type { AccountTemplateType } from "@/lib/accounts-store";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { StatusChip } from "./StatusChip";
import { AddSnipModal } from "./AddSnipModal";
import { RetestModal } from "./RetestModal";
import { formatCentralShort } from "@/lib/shift";
import { cn } from "@/lib/utils";

export function ReasonFlowSection({ session }: { session: DispatchSession }) {
  // Reactively re-render when accounts/templates change.
  useAccounts();
  const globalReasonTemplates = useGlobalReasonTemplates();
  const accountTemplates = accountsStore
    .templatesFor(session.accountNumber)
    .map((t) => ({
      id: t.id,
      text: t.name,
      type: mapAccountTemplateType(t.type),
      expectedFlow: t.expectedFlow,
    }));

  // Track which reason cards are expanded. Only the most recent (or manually
  // re-opened) cards are open; adding a new reason auto-collapses the rest.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const last = session.reasons[session.reasons.length - 1];
    return new Set(last ? [last.id] : []);
  });
  const prevCountRef = useRef(session.reasons.length);

  useEffect(() => {
    const count = session.reasons.length;
    if (count > prevCountRef.current) {
      const last = session.reasons[count - 1];
      if (last) setExpanded(new Set([last.id]));
    }
    prevCountRef.current = count;
  }, [session.reasons]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addManual = () => dispatchStore.addReason(session.id, "manual");
  const addFromTemplate = (
    source: "global" | "account",
    t: { text: string; type: ReasonType; expectedFlow: string },
  ) =>
    dispatchStore.addReason(session.id, source, {
      text: t.text, type: t.type, expectedFlow: t.expectedFlow,
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {session.reasons.length} reason{session.reasons.length === 1 ? "" : "s"} tested
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm"
              style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Reason
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-panel border-0">
            <DropdownMenuLabel>Add Reason From</DropdownMenuLabel>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Global Template</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="glass-panel border-0">
                {globalReasonTemplates.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => addFromTemplate("global", t)}>
                    {t.text}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={accountTemplates.length === 0}>
                Account Template {accountTemplates.length === 0 ? "(none)" : `(${accountTemplates.length})`}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="glass-panel border-0">
                {accountTemplates.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => addFromTemplate("account", t)}>
                    {t.text}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={addManual}>Type Manually</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {session.reasons.length === 0 && (
        <div className="rounded-md border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
          No reasons tested yet. Add one to start the script flow check.
        </div>
      )}
      <div className="space-y-3">
        {session.reasons.map((r) => (
          <ReasonCardView
            key={r.id}
            session={session}
            reason={r}
            open={expanded.has(r.id)}
            onToggle={() => toggle(r.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ReasonCardView({
  session, reason, open, onToggle,
}: {
  session: DispatchSession;
  reason: ReasonCard;
  open: boolean;
  onToggle: () => void;
}) {
  const status = reasonCardStatus(reason);
  const [snipOpen, setSnipOpen] = useState(false);
  const [retestOpen, setRetestOpen] = useState(false);
  const reasonTypeOptions = useDropdownGroup("reasonType");
  const checkResultOptions = useDropdownGroup("checkResult");
  const reasonTypeLabel = useDropdownLabel("reasonType", reason.type ?? undefined);
  const update = (patch: Partial<ReasonCard>) =>
    dispatchStore.updateReason(session.id, reason.id, patch);

  const showUrgent = reason.type === "urgent";
  const showRoutineRequired = reason.type === "routine";
  const needRoutine =
    showRoutineRequired && reason.result === "passed" &&
    (!reason.expectedFlow.trim() || !reason.actualFlow.trim());
  const needFailReason = reason.result === "failed" && !reason.failureReason.trim();

  const cardSnips = session.snips.filter((s) => reason.snipIds.includes(s.id));

  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
          />
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{reason.source === "global" ? "Global" : reason.source === "account" ? "Account" : "Manual"}</span>
            {reason.type && <span>· {reasonTypeLabel}</span>}
          </span>
          {!open && (
            <span className="ml-2 truncate text-xs text-foreground/80 normal-case tracking-normal">
              {reason.text.trim() || <span className="text-muted-foreground italic">Untitled reason</span>}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <StatusChip status={status} />
          <Button size="sm" variant="ghost" onClick={() => dispatchStore.duplicateReason(session.id, reason.id)}>
            <Copy className="mr-1 h-3 w-3" /> Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dispatchStore.removeReason(session.id, reason.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Collapsible open={open}>
        <CollapsibleContent className="space-y-3 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
          <Input value={reason.text} onChange={(e) => update({ text: e.target.value })} placeholder="Reason for Call" />
          <Select value={reason.type ?? ""} onValueChange={(v) => update({ type: v as ReasonType })}>
            <SelectTrigger><SelectValue placeholder="Type (optional)" /></SelectTrigger>
            <SelectContent>
              {reasonTypeOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Expected Flow</label>
            <Textarea rows={2} value={reason.expectedFlow} onChange={(e) => update({ expectedFlow: e.target.value })} className="mt-1" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Actual Flow</label>
            <Textarea rows={2} value={reason.actualFlow} onChange={(e) => update({ actualFlow: e.target.value })} className="mt-1" />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Result</label>
            <Select value={reason.result ?? ""} onValueChange={(v) => update({ result: (v || null) as ReasonCard["result"] })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {checkResultOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {reason.result === "failed" && (
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Failure Reason *</label>
              <Input value={reason.failureReason} onChange={(e) => update({ failureReason: e.target.value })} className="mt-1" placeholder="Required for Failed" />
            </div>
          )}
        </div>

        {(reason.result === "failed" || reason.retests.length > 0) && (
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Changes Made</label>
            <Textarea rows={2} value={reason.changesMade} onChange={(e) => update({ changesMade: e.target.value })} className="mt-1" />
          </div>
        )}

        {showUrgent && <UrgentRoutingFields reason={reason} sessionId={session.id} />}

        {(needRoutine || needFailReason) && (
          <div
            className="rounded-md border p-2 text-[11px]"
            style={{ borderColor: "oklch(0.85 0.16 85 / 0.45)", background: "oklch(0.85 0.16 85 / 0.1)", color: "var(--gold-glow)" }}
          >
            {needRoutine && "Routine + Passed requires Expected Flow and Actual Flow. "}
            {needFailReason && "Failed status requires a Failure Reason."}
          </div>
        )}

        <RetestList sessionId={session.id} retests={reason.retests} onAdd={() => setRetestOpen(true)} />

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</label>
          <Textarea rows={2} value={reason.notes} onChange={(e) => update({ notes: e.target.value })} className="mt-1" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Snips ({cardSnips.length})</div>
            <Button size="sm" variant="ghost" onClick={() => setSnipOpen(true)}>
              <ImagePlus className="mr-1 h-3 w-3" /> Add Snip
            </Button>
          </div>
          {cardSnips.length > 0 && <SnipGrid snips={cardSnips} onRemove={(id) => dispatchStore.removeSnip(session.id, id)} />}
        </div>
        </CollapsibleContent>
      </Collapsible>

      <AddSnipModal
        sessionId={session.id}
        open={snipOpen}
        onOpenChange={setSnipOpen}
        attach={{ kind: "reason", reasonId: reason.id }}
      />
      <RetestModal
        sessionId={session.id}
        open={retestOpen}
        onOpenChange={setRetestOpen}
        target={{ kind: "reason", reasonId: reason.id }}
      />
    </div>
  );
}

function UrgentRoutingFields({ reason, sessionId }: { reason: ReasonCard; sessionId: string }) {
  const u = reason.urgent ?? {
    expectedContact: "", actualContact: "",
    contactCorrect: null, instructionsMatch: null, savedMessageOk: null,
  };
  const set = (patch: Partial<typeof u>) =>
    dispatchStore.updateReason(sessionId, reason.id, { urgent: { ...u, ...patch } });

  return (
    <div className="rounded-lg border border-border/40 bg-white/[0.03] p-3">
      <div className="mb-2 text-xs uppercase tracking-wider text-[color:var(--gold-glow)]">Urgent Routing Check</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Expected on-call / contact</label>
          <Input className="mt-1" value={u.expectedContact} onChange={(e) => set({ expectedContact: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Actual on-call / contact pulled</label>
          <Input className="mt-1" value={u.actualContact} onChange={(e) => set({ actualContact: e.target.value })} />
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <YesNoSelect label="Correct on-call?" value={u.contactCorrect} onChange={(v) => set({ contactCorrect: v as "passed" | "failed" | null })} options={[["passed","Passed"],["failed","Failed"]]} />
        <YesNoSelect label="Instructions match?" value={u.instructionsMatch} onChange={(v) => set({ instructionsMatch: v as "yes" | "no" | null })} options={[["yes","Yes"],["no","No"]]} />
        <YesNoSelect label="Saved message shows urgent?" value={u.savedMessageOk} onChange={(v) => set({ savedMessageOk: v as "passed" | "failed" | null })} options={[["passed","Passed"],["failed","Failed"]]} />
      </div>
      {(u.contactCorrect === "failed" || u.savedMessageOk === "failed") && (
        <div className="mt-2 text-[11px]" style={{ color: "var(--gold-glow)" }}>
          Urgent routing failed — mark this reason Failed and capture a Failure Reason. Add Changes Made or a Retest before it can be Passed After Retest.
        </div>
      )}
    </div>
  );
}

function YesNoSelect({ label, value, onChange, options }: { label: string; value: string | null; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RetestList({ retests, onAdd }: { sessionId: string; retests: ReasonCard["retests"]; onAdd: () => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Retest History ({retests.length})</div>
        <Button size="sm" variant="ghost" onClick={onAdd}>+ Retest</Button>
      </div>
      {retests.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">No retests yet.</div>
      ) : (
        <div className="space-y-1.5">
          {retests.map((rt) => (
            <div key={rt.id} className="rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className={cn(rt.result === "passed" ? "text-[color:var(--green-glow)]" : "text-[color:oklch(0.72_0.22_25)]")}>
                  {rt.result === "passed" ? "Passed" : "Still Failed"}
                </span>
                <span>{formatCentralShort(new Date(rt.at))} · LTP</span>
              </div>
              {rt.notes && <div className="mt-1 text-foreground/90">{rt.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SnipGrid({ snips, onRemove }: { snips: { id: string; name: string; category: string; label?: string; dataUrl?: string; isImage: boolean }[]; onRemove: (id: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {snips.map((s) => (
        <div key={s.id} className="rounded-md border border-border/30 bg-white/[0.02] p-2 text-[11px]">
          {s.dataUrl && s.isImage ? (
            <img src={s.dataUrl} alt={s.name} className="mb-1 h-20 w-full rounded object-cover" />
          ) : (
            <div className="mb-1 grid h-20 place-items-center rounded bg-white/[0.04] text-muted-foreground">file</div>
          )}
          <div className="truncate text-foreground">{s.name}</div>
          <div className="text-muted-foreground">{s.category}</div>
          <div className="mt-1 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => onRemove(s.id)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}