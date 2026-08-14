import { Link } from "@tanstack/react-router";
import { Building2, ClipboardList, Inbox, LibraryBig, PhoneOutgoing, Zap } from "lucide-react";
import { useAssignedUnreadCount } from "@/lib/assigned-inbox-store";

const actions = [
  { to: "/assigned-to-me", label: "Assigned to Me", icon: Inbox, accent: "var(--cyan-glow)" },
  { to: "/additional-work", label: "New Additional Work", icon: ClipboardList, accent: "var(--gold-glow)" },
  { to: "/contact-dispatch", label: "Start Dispatch Test", icon: PhoneOutgoing, accent: "var(--violet-glow)" },
  { to: "/knowledge-vault", label: "Search Knowledge", icon: LibraryBig, accent: "oklch(0.8 0.16 190)" },
  { to: "/accounts", label: "Account Lookup", icon: Building2, accent: "var(--electric)" },
] as const;

/** Quick Start — one row of the five things the shift actually begins with. */
export function QuickStart() {
  const assigned = useAssignedUnreadCount();
  return (
    <section className="glass-panel hq-ambient hq-deck p-4" aria-label="Quick start">
      <div className="mb-2.5 flex items-center gap-2">
        <Zap className="h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Quick Start
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="hq-affordance hq-deck-key group flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <a.icon className="h-4 w-4 shrink-0" style={{ color: a.accent }} />
            <span className="truncate">{a.label}</span>
            {a.to === "/assigned-to-me" && assigned > 0 && (
              <span
                className="ml-auto grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold"
                style={{ background: "var(--cyan-glow)", color: "oklch(0.2 0.05 230)" }}
              >
                {assigned}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
