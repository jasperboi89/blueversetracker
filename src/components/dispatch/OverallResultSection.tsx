import { dispatchStore, DISPATCH_STATUS_LABEL, type DispatchSession, type DispatchStatus } from "@/lib/dispatch-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const STATUSES: DispatchStatus[] = ["ready", "waiting-cs", "waiting-prog", "not-ready"];

export function OverallResultSection({ session }: { session: DispatchSession }) {
  const set = (status: DispatchStatus | null) =>
    dispatchStore.setOverallStatus(session.id, status, session.statusReason);
  const setReason = (v: string) =>
    dispatchStore.setOverallStatus(session.id, session.status, v);

  const needsReason =
    session.status === "waiting-cs" || session.status === "waiting-prog" || session.status === "not-ready";
  const reasonLabel =
    session.status === "not-ready"
      ? "Not Ready / Still Working Reason *"
      : "Review Needed Reason *";

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Overall Status</label>
        <Select value={session.status ?? ""} onValueChange={(v) => set((v || null) as DispatchStatus)}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Select overall status" /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} disabled={s === "ready"}>
                {DISPATCH_STATUS_LABEL[s]}{s === "ready" ? " — use Mark Ready" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Ready for Activation is set through the Mark Ready for Activation button — not picked here.
        </div>
      </div>
      {needsReason && (
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">{reasonLabel}</label>
          <Textarea
            rows={3}
            className="mt-1"
            value={session.statusReason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required for this status."
          />
        </div>
      )}
    </div>
  );
}