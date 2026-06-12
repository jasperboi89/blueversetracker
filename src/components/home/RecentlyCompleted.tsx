import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, PhoneOutgoing, Ticket } from "lucide-react";
type CompletedKind = "freshdesk" | "dispatch" | "additional";
interface CompletedItem {
  id: string;
  kind: CompletedKind;
  title: string;
  reference: string;
  completedAt: Date;
}
import { formatCentralShort } from "@/lib/shift";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTickets } from "@/lib/tickets-store";
import { useDispatch } from "@/lib/dispatch-store";
import { useAdditionalWork } from "@/lib/additional-work-store";

const kindMeta: Record<CompletedKind, { label: string; icon: typeof Ticket; color: string }> = {
  freshdesk: { label: "Freshdesk", icon: Ticket, color: "var(--cyan-glow)" },
  dispatch: { label: "Dispatch", icon: PhoneOutgoing, color: "var(--violet-glow)" },
  additional: { label: "Additional", icon: ClipboardList, color: "var(--gold-glow)" },
};

export function RecentlyCompleted() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const { tickets } = useTickets();
  const { sessions } = useDispatch();
  const { items: workItems } = useAdditionalWork();
  // Lock the base time after mount so SSR (which uses 0) and client agree initially,
  // then re-render once with the real "now" anchor.
  const [baseMs, setBaseMs] = useState<number>(0);
  useEffect(() => setBaseMs(Date.now()), []);
  // baseMs is referenced only so future time-derived logic re-renders after mount.
  void baseMs;
  const ticketCompleted: CompletedItem[] = tickets
    .filter((t) => t.status === "completed" && t.completedAt)
    .map((t) => ({
      id: t.id,
      kind: "freshdesk" as CompletedKind,
      title: t.details.subject || `Ticket #${t.number}`,
      reference: `Ticket #${t.number} · Account ${t.accountNumber}`,
      completedAt: new Date(t.completedAt!),
    }));
  const dispatchReady: CompletedItem[] = sessions
    .filter((s) => s.status === "ready" && s.completedAt)
    .map((s) => ({
      id: `ds-${s.id}`,
      kind: "dispatch" as CompletedKind,
      title: "Ready for Activation",
      reference: `${s.accountName} · Account ${s.accountNumber}`,
      completedAt: new Date(s.completedAt!),
    }));
  const addWorkCompleted: CompletedItem[] = workItems
    .filter((w) => w.status === "completed" && w.completedAt)
    .map((w) => ({
      id: `aw-${w.id}`,
      kind: "additional" as CompletedKind,
      title: w.title,
      reference: w.accountNumber ? `${w.accountName} · Account ${w.accountNumber}` : "No account linked",
      completedAt: new Date(w.completedAt!),
    }));
  const combined = [...ticketCompleted, ...dispatchReady, ...addWorkCompleted];
  const top5 = [...combined].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime()).slice(0, 5);

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" style={{ color: "var(--green-glow)" }} />
          <h2 className="text-sm font-semibold text-foreground">Recently Completed Work</h2>
        </div>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setOpen(true)}>
          View All Completed Work
        </Button>
      </div>
      <div className="mt-3 divide-y divide-border/30">
        {top5.map((i) => <Row key={i.id} item={i} />)}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn("glass-panel border-0", isMobile ? "h-[70vh]" : "w-[460px] sm:max-w-[460px]")}
        >
          <SheetHeader>
            <SheetTitle>All Completed Work</SheetTitle>
          </SheetHeader>
          <Tabs defaultValue="all" className="mt-3">
            <TabsList className="grid w-full grid-cols-4 bg-white/5">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="freshdesk">Freshdesk</TabsTrigger>
              <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
              <TabsTrigger value="additional">Additional</TabsTrigger>
            </TabsList>
            {(["all", "freshdesk", "dispatch", "additional"] as const).map((k) => (
              <TabsContent key={k} value={k} className="mt-3 divide-y divide-border/30">
                {combined
                  .filter((i) => k === "all" || i.kind === k)
                  .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
                  .map((i) => <Row key={i.id} item={i} />)}
              </TabsContent>
            ))}
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ item }: { item: CompletedItem }) {
  const m = kindMeta[item.kind];
  const Icon = m.icon;
  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className="grid h-9 w-9 place-items-center rounded-lg"
        style={{
          background: `linear-gradient(135deg, ${m.color.replace(")", " / 0.3)")} , oklch(0.7 0.22 295 / 0.2))`,
          boxShadow: `0 0 12px ${m.color}`,
        }}
      >
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{item.title}</div>
        <div className="text-xs text-muted-foreground">{m.label} · {item.reference} · {formatCentralShort(item.completedAt)}</div>
      </div>
      <Button variant="ghost" size="sm" className="text-xs">Open Record</Button>
    </div>
  );
}