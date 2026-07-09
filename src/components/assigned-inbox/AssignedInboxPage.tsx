import { useEffect, useMemo } from "react";
import { RefreshCw, Inbox, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  assignedInboxStore,
  useAssignedInbox,
  useVisibleAssignedTickets,
} from "@/lib/assigned-inbox-store";
import { AssignedInboxRow } from "./AssignedInboxRow";

export function AssignedInboxPage() {
  const state = useAssignedInbox();
  const visible = useVisibleAssignedTickets();

  const seenBefore = useMemo(() => new Set(state.seenIds), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh on first mount if never synced or stale (>2 min).
  useEffect(() => {
    assignedInboxStore.startPolling();
    const stale = !state.lastSyncedAt || Date.now() - state.lastSyncedAt > 2 * 60 * 1000;
    if (stale) void assignedInboxStore.refresh(true);
    return () => {
      assignedInboxStore.markAllSeen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Assigned to Me</h1>
          <p className="text-xs text-muted-foreground">
            Auto-synced from Freshdesk every 3 minutes
            {state.agentName ? ` · ${state.agentName}` : ""}
            {state.lastSyncedAt
              ? ` · last sync ${new Date(state.lastSyncedAt).toLocaleTimeString()}`
              : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void assignedInboxStore.refresh(true)}
          disabled={state.syncing}
        >
          {state.syncing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </header>

      {state.lastError && (
        <div className="glass-panel flex items-start gap-3 p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <div className="font-medium">Couldn't sync from Freshdesk.</div>
            <div className="text-xs text-rose-300/80">{state.lastError}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => assignedInboxStore.clearError()}>
            Dismiss
          </Button>
        </div>
      )}

      {visible.length === 0 && !state.syncing && !state.lastError && (
        <div className="glass-panel flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Inbox className="h-6 w-6 text-cyan-300/70" />
          <div className="font-medium text-foreground">You're clear.</div>
          <div>Nothing new assigned to you right now.</div>
        </div>
      )}

      <div className="grid gap-3">
        {visible.map((row) => (
          <AssignedInboxRow key={row.number} row={row} isNew={!seenBefore.has(row.number)} />
        ))}
      </div>
    </div>
  );
}