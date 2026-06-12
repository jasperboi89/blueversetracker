import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Ticket,
  PhoneOutgoing,
  ClipboardList,
  Building2,
  FileBarChart,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { UserChip } from "@/components/auth/UserChip";
import { useIsAdmin } from "@/lib/auth/role-context";

const baseItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Freshdesk Tickets", url: "/freshdesk-tickets", icon: Ticket },
  { title: "Contact Dispatch", url: "/contact-dispatch", icon: PhoneOutgoing },
  { title: "Additional Work", url: "/additional-work", icon: ClipboardList },
  { title: "Accounts", url: "/accounts", icon: Building2 },
  { title: "Reports", url: "/reports", icon: FileBarChart },
] as const;

const adminItems = [
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isAdmin = useIsAdmin();
  const items = isAdmin ? [...baseItems, ...adminItems] : baseItems;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <div
            className="relative grid h-10 w-10 place-items-center rounded-xl"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.4))",
              boxShadow: "var(--shadow-glow-cyan), inset 0 1px 0 oklch(1 0 0 / 0.2)",
            }}
          >
            <Sparkles className="h-5 w-5 text-white" />
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((item) => {
                const active =
                  item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={
                        active
                          ? "shimmer relative rounded-xl text-foreground"
                          : "shimmer rounded-xl text-muted-foreground hover:text-foreground"
                      }
                      style={
                        active
                          ? {
                              background:
                                "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.55), oklch(0.4 0.18 290 / 0.4))",
                              boxShadow:
                                "0 0 18px oklch(0.78 0.18 220 / 0.35), inset 0 1px 0 oklch(1 0 0 / 0.08)",
                            }
                          : undefined
                      }
                    >
                      <Link to={item.url}>
                        <item.icon
                          className="h-4 w-4"
                          style={
                            active
                              ? { color: "var(--cyan-glow)", filter: "drop-shadow(0 0 6px var(--cyan-glow))" }
                              : undefined
                          }
                        />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-4">
        <UserChip collapsed={collapsed} />
        {!collapsed && (
          <div className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">
            HIPAA-Safeguarded
            <br />
            Internal Use
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}