import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, ScrollText, ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  adminListAuthEvents,
  adminListTicketAccess,
  type AuthEventRow,
  type TicketAccessRow,
} from "@/lib/auth/audit-log.functions";
import { useIsAdmin } from "@/lib/auth/role-context";

export const Route = createFileRoute("/_authenticated/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log — Account Intel Hub" },
      {
        name: "description",
        content: "HIPAA access audit trail: ticket access and authentication events.",
      },
    ],
  }),
  component: AuditLogPage,
});

const PAGE_SIZE = 100;

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ACTION_LABEL: Record<string, string> = {
  pull: "Pulled ticket",
  sync: "Synced ticket",
  search: "Searched",
  conversations: "Fetched conversations",
  coverage: "Coverage scan",
};

const EVENT_LABEL: Record<string, string> = {
  login_success: "Login",
  login_failed: "Login failed",
  logout: "Logout",
  access_denied: "Access denied",
  session_timeout: "Session timeout",
  role_check_failed: "Role check failed",
};

const EVENT_TONE: Record<string, string> = {
  login_success: "text-emerald-400",
  logout: "text-muted-foreground",
  session_timeout: "text-amber-400",
  login_failed: "text-red-400",
  access_denied: "text-red-400",
  role_check_failed: "text-red-400",
};

function Header() {
  return (
    <div className="glass-panel flex items-center gap-4 p-5">
      <div
        className="grid h-12 w-12 place-items-center rounded-2xl"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.4))",
          boxShadow: "var(--shadow-glow-cyan)",
        }}
      >
        <ScrollText className="h-5 w-5 text-white" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Who accessed what, and when — ticket/PHI access and sign-in activity.
        </p>
      </div>
    </div>
  );
}

function AdminOnly() {
  return (
    <div className="glass-panel flex items-center gap-3 p-5 text-sm text-muted-foreground">
      <ShieldAlert className="h-5 w-5 text-amber-400" />
      The audit log is only visible to admins.
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function TicketAccessTable() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit", "ticket-access", limit],
    queryFn: () => adminListTicketAccess({ data: { limit, offset: 0 } }),
    staleTime: 30_000,
  });

  if (isLoading) return <LoadingRow />;
  if (isError || !data?.ok) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Could not load the ticket access log{data && !data.ok ? ` — ${data.error}` : ""}. If the log
        table hasn't been created yet, apply the latest database migration.
      </p>
    );
  }
  if (data.rows.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No ticket access recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Who</th>
            <th className="py-2 pr-4 font-medium">Action</th>
            <th className="py-2 pr-4 font-medium">Ticket</th>
            <th className="py-2 pr-4 font-medium">Query</th>
            <th className="py-2 font-medium">IP</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r: TicketAccessRow) => (
            <tr key={r.id} className="border-b border-border/20 text-foreground/90">
              <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                {fmtWhen(r.created_at)}
              </td>
              <td className="py-2 pr-4">{r.email ?? "—"}</td>
              <td className="whitespace-nowrap py-2 pr-4">
                <Badge variant="secondary" className="font-normal">
                  {ACTION_LABEL[r.action] ?? r.action}
                </Badge>
              </td>
              <td className="whitespace-nowrap py-2 pr-4">
                {r.ticket_number ? `#${r.ticket_number}` : "—"}
              </td>
              <td
                className="max-w-[320px] truncate py-2 pr-4 text-muted-foreground"
                title={r.query ?? undefined}
              >
                {r.query ?? "—"}
              </td>
              <td className="whitespace-nowrap py-2 text-muted-foreground">{r.ip ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <FooterCount
        shown={data.rows.length}
        total={data.total}
        onMore={() => setLimit((l) => l + PAGE_SIZE)}
      />
    </div>
  );
}

function AuthEventsTable() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit", "auth-events", limit],
    queryFn: () => adminListAuthEvents({ data: { limit, offset: 0 } }),
    staleTime: 30_000,
  });

  if (isLoading) return <LoadingRow />;
  if (isError || !data?.ok) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Could not load auth events{data && !data.ok ? ` — ${data.error}` : ""}.
      </p>
    );
  }
  if (data.rows.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No auth events recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Who</th>
            <th className="py-2 pr-4 font-medium">Event</th>
            <th className="py-2 pr-4 font-medium">Role</th>
            <th className="py-2 font-medium">IP</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r: AuthEventRow) => (
            <tr key={r.id} className="border-b border-border/20 text-foreground/90">
              <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                {fmtWhen(r.created_at)}
              </td>
              <td className="py-2 pr-4">{r.email ?? "—"}</td>
              <td className={`whitespace-nowrap py-2 pr-4 ${EVENT_TONE[r.event_type] ?? ""}`}>
                {EVENT_LABEL[r.event_type] ?? r.event_type}
              </td>
              <td className="whitespace-nowrap py-2 pr-4 capitalize text-muted-foreground">
                {r.role ?? "—"}
              </td>
              <td className="whitespace-nowrap py-2 text-muted-foreground">{r.ip ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <FooterCount
        shown={data.rows.length}
        total={data.total}
        onMore={() => setLimit((l) => l + PAGE_SIZE)}
      />
    </div>
  );
}

function FooterCount({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-xs text-muted-foreground">
        Showing {shown} of {total}
      </span>
      {shown < total && (
        <Button variant="outline" size="sm" onClick={onMore}>
          Load more
        </Button>
      )}
    </div>
  );
}

function AuditLogPage() {
  const isAdmin = useIsAdmin();

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <Header />
      {!isAdmin ? (
        <AdminOnly />
      ) : (
        <div className="glass-panel p-5">
          <Tabs defaultValue="access">
            <TabsList>
              <TabsTrigger value="access">Ticket Access</TabsTrigger>
              <TabsTrigger value="auth">Sign-in Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="access" className="mt-4">
              <TicketAccessTable />
            </TabsContent>
            <TabsContent value="auth" className="mt-4">
              <AuthEventsTable />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
