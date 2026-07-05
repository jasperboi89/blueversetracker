import { useState } from "react";
import { Calendar, FolderOpen, MessageSquare } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useDispatch } from "@/lib/dispatch-store";
import { useAdditionalWork } from "@/lib/additional-work-store";
import { alphaMix } from "@/lib/visual-style";

type CardKey = "due" | "open" | "review";
interface OverviewItem { id: string; type: string; title: string; reference: string }
const dueTodayItems: OverviewItem[] = [];
const openItemsList: OverviewItem[] = [];
const inReviewList: OverviewItem[] = [];
const overviewCounts = { due: 0, open: 0, review: 0 };

const cards: {
  key: CardKey;
  label: string;
  icon: typeof Calendar;
  color: string;
  zero: string;
  items: OverviewItem[];
}[] = [
  {
    key: "due",
    label: "Due Today",
    icon: Calendar,
    color: "var(--cyan-glow)",
    zero: "All clear",
    items: dueTodayItems,
  },
  {
    key: "open",
    label: "Open Items",
    icon: FolderOpen,
    color: "var(--electric)",
    zero: "All clear",
    items: openItemsList,
  },
  {
    key: "review",
    label: "In Review",
    icon: MessageSquare,
    color: "var(--gold-glow)",
    zero: "Nothing waiting",
    items: inReviewList,
  },
];

export function OverviewCards() {
  const [open, setOpen] = useState<CardKey | null>(null);
  const isMobile = useIsMobile();
  const { sessions } = useDispatch();
  const { items: workItems } = useAdditionalWork();

  const dispatchOpen = sessions
    .filter((s) => s.status === "not-ready")
    .map((s) => ({ id: `ds-${s.id}`, type: "Contact Dispatch", title: "Not Ready, Still Working on Ticket", reference: `${s.accountName} (Account ${s.accountNumber})` }));
  const addWorkOpen = workItems
    .filter((w) => w.status === "working")
    .map((w) => ({ id: `aw-${w.id}`, type: "Additional Work", title: w.title, reference: w.accountNumber ? `${w.accountName} (Account ${w.accountNumber})` : "No account linked" }));
  const dispatchReview = sessions
    .filter((s) => s.status === "waiting-cs" || s.status === "waiting-prog")
    .map((s) => ({ id: `ds-${s.id}`, type: "Contact Dispatch", title: s.status === "waiting-cs" ? "Waiting on CS review" : "Waiting on Programming review", reference: `${s.accountName} (Account ${s.accountNumber})` }));

  const merged: Record<CardKey, OverviewItem[]> = {
    due: dueTodayItems,
    open: [...openItemsList, ...dispatchOpen, ...addWorkOpen],
    review: [...inReviewList, ...dispatchReview],
  };
  const counts: Record<CardKey, number> = {
    due: overviewCounts.due,
    open: merged.open.length,
    review: merged.review.length,
  };

  const active = cards.find((c) => c.key === open);
  const activeItems = active ? merged[active.key] : [];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        {cards.map((c) => {
          const count = counts[c.key];
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => setOpen(c.key)}
              className={cn(
                "glass-panel shimmer group relative p-5 text-left transition",
                c.key === "due" ? "md:col-span-2" : "md:col-span-1",
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {c.label}
                  </div>
                  <div className="mt-2 text-4xl font-semibold tabular-nums text-foreground">
                    {count}
                  </div>
                  {count === 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">{c.zero}</div>
                  )}
                </div>
                <div
                  className="grid h-10 w-10 place-items-center rounded-xl transition group-hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg, ${alphaMix(c.color, 35)}, oklch(0.7 0.22 295 / 0.25))`,
                    boxShadow: `0 0 18px ${c.color}`,
                  }}
                >
                  <Icon className="h-4 w-4 text-white" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn("glass-panel border-0", isMobile ? "h-[60vh]" : "w-[460px] sm:max-w-[460px]")}
        >
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <active.icon className="h-4 w-4" style={{ color: active.color }} />
                  {active.label}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                {groupByType(activeItems).map((g) => (
                  <div key={g.type}>
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {g.type}
                    </div>
                    <div className="space-y-1.5">
                      {g.list.map((it) => (
                        <div
                          key={it.id}
                          className="rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm"
                        >
                          <div className="text-foreground">{it.title}</div>
                          <div className="text-xs text-muted-foreground">{it.reference}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {activeItems.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nothing here.</div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function groupByType<T extends { type: string }>(arr: T[]) {
  const m = new Map<string, T[]>();
  for (const i of arr) {
    if (!m.has(i.type)) m.set(i.type, []);
    m.get(i.type)!.push(i);
  }
  return [...m.entries()].map(([type, list]) => ({ type, list }));
}