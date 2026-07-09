import { useEffect } from "react";
import { assignedInboxStore } from "@/lib/assigned-inbox-store";
import { useFreshdeskConfig } from "@/lib/settings/freshdesk-config-store";

/**
 * Mounted once inside the authenticated shell. Starts the 3-minute background
 * poller for tickets assigned to the current Freshdesk agent. Waits until
 * Freshdesk is connected before doing anything.
 */
export function AssignedInboxPoller() {
  const cfg = useFreshdeskConfig();
  useEffect(() => {
    if (cfg.status !== "connected") return;
    assignedInboxStore.startPolling();
  }, [cfg.status]);
  return null;
}