import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  PhoneOutgoing,
  Sparkles,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isOverdue, useTickets } from "@/lib/tickets-store";
import { isActive, priorityRank, useNightPlan } from "@/lib/night-plan-store";
import { useDispatch } from "@/lib/dispatch-store";
import { useAdditionalWork } from "@/lib/additional-work-store";
import { alphaMix, moduleAccents } from "@/lib/visual-style";

interface Recommendation {
  title: string;
  detail: string;
  href: "/" | "/freshdesk-tickets" | "/contact-dispatch" | "/additional-work";
  accent: string;
  icon: typeof Sparkles;
}

export function NextBestActionStrip() {
  const { tickets } = useTickets();
  const plan = useNightPlan();
  const { sessions } = useDispatch();
  const { items } = useAdditionalWork();

  const activeTickets = tickets.filter((t) => t.status !== "completed");
  const overdueTickets = activeTickets.filter((t) => isOverdue(t));
  const activeNightItems = plan.items.filter((i) => isActive(i.status));
  const mustNightItems = activeNightItems
    .filter((i) => i.priority === "must")
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  const activeDispatchSessions = sessions.filter((s) => !s.completedAt);
  const activeAdditionalWork = items.filter((i) => i.status !== "completed");

  const rec: Recommendation =
    overdueTickets.length > 0
      ? {
          title: "Review overdue Freshdesk",
          detail: "Overdue tickets need eyes before new work opens.",
          href: "/freshdesk-tickets",
          accent: moduleAccents.alert.color,
          icon: AlertTriangle,
        }
      : mustNightItems.length > 0
        ? {
            title: "Work must-do Night Plan",
            detail: `Must-do: ${mustNightItems[0].task}`,
            href: "/",
            accent: moduleAccents.additional.color,
            icon: ClipboardList,
          }
        : activeDispatchSessions.length > 0
          ? {
              title: "Review Contact Dispatch",
              detail: "Active dispatch testing is waiting in the field.",
              href: "/contact-dispatch",
              accent: moduleAccents.dispatch.color,
              icon: PhoneOutgoing,
            }
          : activeTickets.length > 0
            ? {
                title: "Continue Freshdesk tickets",
                detail: "Active tickets are open and ready.",
                href: "/freshdesk-tickets",
                accent: moduleAccents.freshdesk.color,
                icon: Ticket,
              }
            : activeAdditionalWork.length > 0
              ? {
                  title: "Continue Additional Work",
                  detail: "Programming-side work is still in motion.",
                  href: "/additional-work",
                  accent: moduleAccents.additional.color,
                  icon: ClipboardList,
                }
              : activeNightItems.length > 0
                ? {
                    title: "Clear next Night Plan item",
                    detail: `Next up: ${activeNightItems[0].task}`,
                    href: "/",
                    accent: moduleAccents.completed.color,
                    icon: CheckCircle2,
                  }
                : {
                    title: "Command deck stable",
                    detail: "Shift field is clear. Keep the systems warm.",
                    href: "/",
                    accent: moduleAccents.completed.color,
                    icon: CheckCircle2,
                  };

  const Icon = rec.icon;

  const chips = [
    {
      label: moduleAccents.freshdesk.label,
      color: moduleAccents.freshdesk.color,
      count: activeTickets.length,
      alert: overdueTickets.length > 0,
    },
    {
      label: "Night Plan",
      color: moduleAccents.additional.color,
      count: activeNightItems.length,
      alert: mustNightItems.length > 0,
    },
    {
      label: moduleAccents.dispatch.label,
      color: moduleAccents.dispatch.color,
      count: activeDispatchSessions.length,
      alert: false,
    },
    {
      label: moduleAccents.additional.label,
      color: moduleAccents.additional.color,
      count: activeAdditionalWork.length,
      alert: false,
    },
  ];

  const coreState: "idle" | "working" | "attention" | "ready" =
    overdueTickets.length > 0
      ? "attention"
      : activeDispatchSessions.length > 0 || activeNightItems.length > 0
        ? "working"
        : "ready";

  return (
    <section
      className="glass-panel hq-command holo-card holo-scan active-breathe relative overflow-hidden p-4 sm:p-5"
      data-surface="command-core"
      data-core-state={coreState}
      aria-label="Liam Command Core — suggested next action"
    >
      {/* Accent wash keyed to the current recommendation */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(90% 130% at 0% 50%, ${alphaMix(rec.accent, 10)}, transparent 60%)`,
        }}
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Liam core orb */}
        <div className="flex items-center gap-3 sm:items-start">
          <div className="relative grid h-12 w-12 shrink-0 place-items-center">
            <div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle at 35% 30%, ${alphaMix(rec.accent, 55)}, ${alphaMix("var(--violet-glow)", 25)} 60%, transparent 75%)`,
                boxShadow: `0 0 24px ${alphaMix(rec.accent, 45)}, inset 0 1px 0 oklch(1 0 0 / 0.25)`,
              }}
            />
            <div
              aria-hidden
              className="absolute inset-[3px] rounded-full border"
              style={{ borderColor: alphaMix(rec.accent, 35) }}
            />
            <Sparkles
              className="relative h-5 w-5 text-white"
              style={{ filter: `drop-shadow(0 0 6px ${rec.accent})` }}
            />
          </div>
          <div className="sm:hidden">
            <CoreLabel />
          </div>
        </div>

        {/* Read + suggestion */}
        <div className="min-w-0 flex-1">
          <div className="hidden sm:block">
            <CoreLabel />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 whitespace-nowrap uppercase tracking-[0.16em] text-muted-foreground/70">
              Current read
            </span>
            <span className="truncate">{rec.detail}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" style={{ color: rec.accent }} />
            <span className="shrink-0 whitespace-nowrap text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              Suggested move
            </span>
            <span className="truncate text-sm font-medium text-foreground">{rec.title}</span>
          </div>
        </div>

        {/* Status chips + action */}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {chips.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground/85"
              style={{
                borderColor: alphaMix(c.color, c.alert ? 45 : 25),
                background: alphaMix(c.color, c.alert ? 16 : 8),
              }}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: c.color,
                  boxShadow: c.alert ? `0 0 8px ${c.color}` : undefined,
                }}
              />
              {c.label}
              <span className="tabular-nums text-muted-foreground">{c.count}</span>
            </span>
          ))}
          {rec.href !== "/" && (
            <Link
              to={rec.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
                "text-foreground transition hover:brightness-110",
              )}
              style={{
                borderColor: alphaMix(rec.accent, 40),
                background: alphaMix(rec.accent, 14),
                boxShadow: `0 0 16px ${alphaMix(rec.accent, 25)}`,
              }}
            >
              Open
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function CoreLabel() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Liam Command Core
      </span>
      <span
        aria-hidden
        className="h-px w-8"
        style={{ background: "linear-gradient(90deg, var(--cyan-glow), transparent)" }}
      />
    </div>
  );
}
