import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, MessageSquareWarning, PhoneOff, Radio } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  DISPATCH_STATUS_LABEL, useDispatch, type DispatchSession,
} from "@/lib/dispatch-store";
import { alphaMix } from "@/lib/visual-style";

type Key = "active" | "waiting-cs" | "waiting-prog" | "not-ready" | "ready";

/** Visual-only mapping of each card to a HoloQuiet spectral tone. */
const TONE: Record<Key, string> = {
  active: "active",
  "waiting-cs": "waiting",
  "waiting-prog": "ai",
  "not-ready": "attention",
  ready: "success",
};

const cards: { key: Key; label: string; icon: typeof Clock; color: string }[] = [
  { key: "active",       label: "Active Testing Sessions", icon: Radio,               color: "var(--electric)" },
  { key: "waiting-cs",   label: "Waiting CS Review",       icon: MessageSquareWarning, color: "var(--gold-glow)" },
  { key: "waiting-prog", label: "Waiting Programming Review", icon: PhoneOff,         color: "var(--violet-glow)" },
  { key: "not-ready",    label: "Not Ready / Still Working", icon: Clock,              color: "oklch(0.85 0.16 30)" },
  { key: "ready",        label: "Ready for Activation",    icon: CheckCircle2,         color: "var(--green-glow)" },
];

function filterFor(key: Key, sessions: DispatchSession[]) {
  if (key === "active") return sessions.filter((s) => s.status !== "ready" && s.status !== "activated");
  if (key === "ready") return sessions.filter((s) => s.status === "ready");
  return sessions.filter((s) => s.status === key);
}

export function MiniDashboard() {
  const { sessions } = useDispatch();
  const [open, setOpen] = useState<Key | null>(null);
  const isMobile = useIsMobile();

  const active = cards.find((c) => c.key === open);
  const items = active ? filterFor(active.key, sessions) : [];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => {
          const list = filterFor(c.key, sessions);
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => setOpen(c.key)}
              className={cn("glass-panel hq-instrument shimmer group p-4 text-left transition")}
              data-hq-tone={TONE[c.key]}
              data-hq-empty={list.length === 0 ? "true" : undefined}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{c.label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{list.length}</div>
                </div>
                <div
                  className="grid h-9 w-9 place-items-center rounded-xl transition group-hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg, ${alphaMix(c.color, 35)}, oklch(0.7 0.22 295 / 0.2))`,
                    boxShadow: `0 0 14px ${c.color}`,
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
          className={cn("glass-panel border-0", isMobile ? "h-[70vh]" : "w-[480px] sm:max-w-[480px]")}
        >
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <active.icon className="h-4 w-4" style={{ color: active.color }} />
                  {active.label}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-3 space-y-2 overflow-y-auto pb-6">
                {items.length === 0 && <div className="text-xs text-muted-foreground">Nothing here.</div>}
                {items.map((s) => (
                  <Link
                    key={s.id}
                    to="/contact-dispatch/$sessionId/work"
                    params={{ sessionId: s.id }}
                    onClick={() => setOpen(null)}
                    className="block rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-foreground">{s.accountName}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Account {s.accountNumber}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.status ? DISPATCH_STATUS_LABEL[s.status] : "In progress"}
                      {s.ticketNumber ? ` · Ticket #${s.ticketNumber}` : ""}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}