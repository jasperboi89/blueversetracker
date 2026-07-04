import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHubIdentity } from "@/lib/auth/role-context";
import { logAuthEventAuthed } from "@/lib/auth/audit.functions";
import { purgeLocalAppData } from "@/lib/purge-local-data";

const ROLE_LABEL = {
  admin: "Admin",
  programmer: "Programmer",
  viewer: "Viewer",
} as const;

function initialsFromEmail(email: string) {
  const name = email.split("@")[0];
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function UserChip({ collapsed }: { collapsed: boolean }) {
  const identity = useHubIdentity();
  const queryClient = useQueryClient();

  async function handleLogout() {
    try { await logAuthEventAuthed({ data: { type: "logout" } }); } catch {}
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    purgeLocalAppData();
    // Full reload (not SPA navigation) so in-memory store state is dropped too.
    window.location.replace("/auth");
  }

  const initials = initialsFromEmail(identity.email);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="grid h-8 w-8 place-items-center rounded-lg text-[11px] font-semibold text-white"
          title={`${identity.email} · ${ROLE_LABEL[identity.role]}`}
          style={{
            background:
              "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.55), oklch(0.7 0.22 295 / 0.55))",
            boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.2)",
          }}
        >
          {initials}
        </div>
        <button
          onClick={handleLogout}
          title="Sign out"
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="glass-pane flex items-center gap-2 rounded-xl border-border/40 px-2 py-2"
    >
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-semibold text-white"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.55), oklch(0.7 0.22 295 / 0.55))",
          boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.2)",
        }}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[12px] text-foreground" title={identity.email}>
          {identity.email}
        </div>
        <div
          className="text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--cyan-glow)" }}
        >
          {ROLE_LABEL[identity.role]}
        </div>
      </div>
      <button
        onClick={handleLogout}
        title="Sign out"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}