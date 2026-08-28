import { useEffect } from "react";
import { startEventLedger } from "@/lib/core/event-ledger";

/**
 * Starts the Durable Operational Event Ledger (Layer 2) once, inside the
 * authenticated shell. `startEventLedger` is idempotent and seeds from the
 * Event Spine's current buffer, so mounting here captures this shift's events
 * and every future one without a second event bus.
 */
export function EventLedgerWatcher() {
  useEffect(() => {
    startEventLedger();
  }, []);
  return null;
}
