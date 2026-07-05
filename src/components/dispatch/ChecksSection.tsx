import { useState } from "react";
import { Check, ImagePlus, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  dispatchStore,
  type CheckSection, type DispatchSession, type SectionStatus,
} from "@/lib/dispatch-store";
import { useDropdownGroup } from "@/lib/settings/dropdowns-store";
import { AddSnipModal } from "./AddSnipModal";
import { RetestModal, } from "./RetestModal";
import { RetestList } from "./ReasonFlowSection";
import { cn } from "@/lib/utils";
import { alphaMix } from "@/lib/visual-style";

export function ChecksSection({
  session, sectionKey, checks, allowNA = false,
}: {
  session: DispatchSession;
  sectionKey: "phone" | "repeat" | "saveSummary";
  checks: readonly { id: string; label: string }[];
  allowNA?: boolean;
}) {
  const sec: CheckSection = session[sectionKey];
  const [snipOpen, setSnipOpen] = useState(false);
  const [retestOpen, setRetestOpen] = useState(false);

  const update = (patch: Partial<CheckSection>) =>
    dispatchStore.updateSection(session.id, sectionKey, patch);

  const allStatuses = useDropdownGroup("sectionStatus");
  const statusOptions = allStatuses.filter((s) =>
    allowNA ? s.id !== "waiting-review" && s.id !== "complete"
            : s.id !== "waiting-review" && s.id !== "complete" && s.id !== "na"
  );

  const sectionSnips = session.snips.filter((s) => sec.snipIds.includes(s.id));

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {checks.map((c) => {
          const v = sec.checks[c.id];
          return (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/30 bg-white/[0.02] px-3 py-2 text-sm"
            >
              <span className="text-foreground/90">{c.label}</span>
              <div className="flex gap-1">
                <TriBtn active={v === true} onClick={() => dispatchStore.setCheck(session.id, sectionKey, c.id, v === true ? null : true)} kind="pass">
                  <Check className="h-3 w-3" />
                </TriBtn>
                <TriBtn active={v === false} onClick={() => dispatchStore.setCheck(session.id, sectionKey, c.id, v === false ? null : false)} kind="fail">
                  <X className="h-3 w-3" />
                </TriBtn>
                <TriBtn active={v === null} onClick={() => dispatchStore.setCheck(session.id, sectionKey, c.id, null)} kind="neutral">
                  <Minus className="h-3 w-3" />
                </TriBtn>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Section Status</label>
          <Select value={sec.status} onValueChange={(v) => update({ status: v as SectionStatus })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {(sec.status === "failed" || sec.status === "still-failed") && (
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Failure Reason *</label>
            <Input value={sec.failureReason} onChange={(e) => update({ failureReason: e.target.value })} className="mt-1" placeholder="Required when Failed" />
          </div>
        )}
      </div>

      {(sec.status === "failed" || sec.status === "still-failed" || sec.retests.length > 0) && (
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Changes Made</label>
          <Textarea rows={2} value={sec.changesMade} onChange={(e) => update({ changesMade: e.target.value })} className="mt-1" />
        </div>
      )}

      <RetestList sessionId={session.id} retests={sec.retests} onAdd={() => setRetestOpen(true)} />

      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</label>
        <Textarea rows={2} value={sec.notes} onChange={(e) => update({ notes: e.target.value })} className="mt-1" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Snips ({sectionSnips.length})</div>
          <Button size="sm" variant="ghost" onClick={() => setSnipOpen(true)}>
            <ImagePlus className="mr-1 h-3 w-3" /> Add Snip
          </Button>
        </div>
        {sectionSnips.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-3">
            {sectionSnips.map((s) => (
              <div key={s.id} className="rounded-md border border-border/30 bg-white/[0.02] p-2 text-[11px]">
                {s.dataUrl && s.isImage ? (
                  <img src={s.dataUrl} alt={s.name} className="mb-1 h-20 w-full rounded object-cover" />
                ) : (
                  <div className="mb-1 grid h-20 place-items-center rounded bg-white/[0.04] text-muted-foreground">file</div>
                )}
                <div className="truncate text-foreground">{s.name}</div>
                <div className="text-muted-foreground">{s.category}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddSnipModal sessionId={session.id} open={snipOpen} onOpenChange={setSnipOpen} attach={{ kind: "section", key: sectionKey }} />
      <RetestModal sessionId={session.id} open={retestOpen} onOpenChange={setRetestOpen} target={{ kind: "section", key: sectionKey }} />
    </div>
  );
}

function TriBtn({ children, active, onClick, kind }: { children: React.ReactNode; active: boolean; onClick: () => void; kind: "pass" | "fail" | "neutral" }) {
  const color = kind === "pass" ? "var(--green-glow)" : kind === "fail" ? "oklch(0.72 0.22 25)" : "oklch(0.7 0.04 240)";
  return (
    <button
      onClick={onClick}
      className={cn("grid h-6 w-6 place-items-center rounded-md border text-foreground/80 transition")}
      style={active
        ? { borderColor: color, color, background: alphaMix(color, 16), boxShadow: `0 0 8px ${color}` }
        : { borderColor: "oklch(1 0 0 / 0.08)" }}
    >
      {children}
    </button>
  );
}