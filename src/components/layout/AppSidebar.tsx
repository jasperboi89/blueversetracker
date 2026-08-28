import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Ticket,
  PhoneOutgoing,
  ClipboardList,
  Building2,
  FileBarChart,
  ScrollText,
  Settings,
  Sparkles,
  CheckCircle2,
  Inbox,
  LibraryBig,
  Trophy,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { UserChip } from "@/components/auth/UserChip";
import { useIsAdmin } from "@/lib/auth/role-context";
import { isOverdue, useTickets } from "@/lib/tickets-store";
import { alphaMix } from "@/lib/visual-style";
import { useAssignedUnreadCount } from "@/lib/assigned-inbox-store";

interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  accent: string;
}

/*
 * Information architecture is organised by operator job, not by "daily vs
 * history" (Phase 1). Command Center leads as an unlabelled primary; the rest
 * group into Work, Accounts, Dispatch, Knowledge, Intelligence and System so a
 * label maps to a task the operator is trying to do.
 */

/** Primary destination — the operator's home base. */
const commandCenter: NavItem = {
  title: "Command Center",
  url: "/",
  icon: LayoutDashboard,
  accent: "var(--cyan-glow)",
};

/** WORK — the live queues the shift is actively clearing. */
const workItems: NavItem[] = [
  { title: "Assigned to Me", url: "/assigned-to-me", icon: Inbox, accent: "var(--cyan-glow)" },
  { title: "Freshdesk Work", url: "/freshdesk-tickets", icon: Ticket, accent: "var(--cyan-glow)" },
  { title: "Additional Work", url: "/additional-work", icon: ClipboardList, accent: "var(--gold-glow)" },
];

/** ACCOUNTS — the account book of record. */
const accountItems: NavItem[] = [
  { title: "Accounts", url: "/accounts", icon: Building2, accent: "var(--electric)" },
];

/** DISPATCH — outbound contact verification. */
const dispatchItems: NavItem[] = [
  { title: "Contact Dispatch", url: "/contact-dispatch", icon: PhoneOutgoing, accent: "var(--violet-glow)" },
];

/** KNOWLEDGE — runbooks, scripts and notes. */
const knowledgeItems: NavItem[] = [
  { title: "Knowledge Vault", url: "/knowledge-vault", icon: LibraryBig, accent: "oklch(0.8 0.16 190)" },
];

/** INTELLIGENCE — look back, correlate, and report. */
const intelligenceItems: NavItem[] = [
  { title: "Freshdesk Intelligence", url: "/freshdesk-intelligence", icon: Sparkles, accent: "var(--violet-glow)" },
  { title: "Completed Work", url: "/completed-work", icon: CheckCircle2, accent: "var(--green-glow)" },
  { title: "Reports", url: "/reports", icon: FileBarChart, accent: "oklch(0.9 0.06 230)" },
];

/** SYSTEM — secondary and admin surfaces; Achievements lives here so it never
 * competes visually with operational work. */
const systemItems: NavItem[] = [
  { title: "Achievements", url: "/achievements", icon: Trophy, accent: "oklch(0.85 0.15 90)" },
];

const adminItems: NavItem[] = [
  { title: "Audit Log", url: "/audit-log", icon: ScrollText, accent: "oklch(0.65 0.12 295)" },
  { title: "Settings", url: "/settings", icon: Settings, accent: "oklch(0.75 0.09 210)" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isAdmin = useIsAdmin();
  const groups: Array<{ label: string; items: NavItem[] }> = [
    { label: "", items: [commandCenter] },
    { label: "Work", items: workItems },
    { label: "Accounts", items: accountItems },
    { label: "Dispatch", items: dispatchItems },
    { label: "Knowledge", items: knowledgeItems },
    { label: "Intelligence", items: intelligenceItems },
    {
      label: "System",
      items: isAdmin ? [...systemItems, ...adminItems] : systemItems,
    },
  ];
  const { tickets } = useTickets();
  const overdueCount = tickets.filter((t) => t.status !== "completed" && isOverdue(t)).length;
  const assignedUnread = useAssignedUnreadCount();

  return (
    <Sidebar
      collapsible="icon"
      className="border-r-0"
      style={{
        boxShadow: "inset -18px 0 40px -32px color-mix(in oklab, var(--cyan-glow) 30%, transparent)",
      }}
    >
      <SidebarHeader className="px-3 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div
            className="relative grid h-10 w-10 place-items-center rounded-xl"
            title={overdueCount > 0 ? `${overdueCount} overdue ticket${overdueCount === 1 ? "" : "s"}` : undefined}
            style={{
              background:
                "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.4))",
              boxShadow:
                overdueCount > 0
                  ? "var(--shadow-glow-gold), inset 0 1px 0 oklch(1 0 0 / 0.2)"
                  : "var(--shadow-glow-cyan), inset 0 1px 0 oklch(1 0 0 / 0.2)",
              animation: overdueCount > 0 ? "pulse-gold 2.6s ease-in-out infinite" : undefined,
            }}
          >
            <Sparkles className="h-5 w-5 text-white" />
            {overdueCount > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold"
                style={{
                  background: "var(--gold-glow)",
                  color: "oklch(0.2 0.05 85)",
                  boxShadow: "0 0 10px var(--gold-glow)",
                }}
              >
                {overdueCount}
              </span>
            )}
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide text-foreground">
                Account Intel Hub
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                AnSer Ops
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {groups.map((group) => (
        <SidebarGroup key={group.label || "primary"}>
          {!collapsed && group.label && (
            <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {group.items.map((item) => {
                const active =
                  item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                const badge = item.url === "/assigned-to-me" ? assignedUnread : 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={
                        active
                          ? "shimmer relative rounded-xl text-foreground"
                          : "rounded-xl text-muted-foreground/80 transition-colors hover:text-foreground"
                      }
                      style={
                        active
                          ? {
                              background: `linear-gradient(110deg, ${alphaMix(item.accent, 22)}, oklch(0.4 0.18 290 / 0.35))`,
                              boxShadow: `0 0 18px ${alphaMix(item.accent, 30)}, inset 0 0 0 1px ${alphaMix(item.accent, 28)}, inset 0 1px 0 oklch(1 0 0 / 0.08)`,
                            }
                          : undefined
                      }
                    >
                      <Link to={item.url}>
                        <item.icon
                          className="h-4 w-4"
                          style={
                            active
                              ? { color: item.accent, filter: `drop-shadow(0 0 6px ${item.accent})` }
                              : { color: alphaMix(item.accent, 60) }
                          }
                        />
                        <span>{item.title}</span>
                        {badge > 0 && (
                          <span
                            className="ml-auto grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold"
                            style={{
                              background: "var(--cyan-glow)",
                              color: "oklch(0.2 0.05 230)",
                              boxShadow: "0 0 8px var(--cyan-glow)",
                            }}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-3 py-4">
        <UserChip collapsed={collapsed} />
        {!collapsed && (
          <div className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            HIPAA-Safeguarded
            <br />
            Internal Use
            <span className="mt-1 block font-mono text-muted-foreground">
              ⌘K / Ctrl+K — Quick Command
            </span>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}