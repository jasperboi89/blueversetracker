import { useCallback, useEffect, useRef, useState } from "react";
import { BookmarkCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eventSpine } from "@/lib/core/event-spine";
import type { AccEvent, AccEventType } from "@/lib/core/events";
import { ResolutionCaptureDialog, type ResolutionCapturePrefill } from "./ResolutionCaptureDialog";

/** Completion signals worth offering a capture on. */
const TRIGGERS: readonly AccEventType[] = [
  "work.completed",
  "ticket.completed",
  "change.verified",
  "dispatch.completed",
];

/** One offer per source, and never more than one visible at a time. */
const OFFER_TTL_MS = 5 * 60 * 1000;

interface Offer {
  key: string;
  label: string;
  prefill: ResolutionCapturePrefill;
  expiresAt: number;
}

function offerKeyFor(event: AccEvent): string {
  return [
    event.type,
    event.accountId ?? "",
    event.ticketId ?? "",
    event.workItemId ?? "",
    event.dispatchId ?? "",
  ].join("|");
}

/**
 * Quiet, dismissible capture offer. It never blocks a workflow, never
 * auto-saves, and never pre-fills ticket content — the operator writes and
 * confirms every field.
 */
export function ResolutionCaptureWatcher() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [open, setOpen] = useState(false);
  const seen = useRef(new Map<string, number>());

  const dismiss = useCallback(() => setOffer(null), []);

  useEffect(() => {
    return eventSpine.subscribe(
      (event) => {
        const key = offerKeyFor(event);
        const now = Date.now();
        const last = seen.current.get(key);
        if (last && now - last < OFFER_TTL_MS) return;
        seen.current.set(key, now);

        const source = {
          ...(event.ticketId ? { ticketId: event.ticketId } : {}),
          ...(event.workItemId ? { workItemId: event.workItemId } : {}),
          ...(event.dispatchId ? { dispatchId: event.dispatchId } : {}),
        };
        setOffer({
          key,
          label: event.ticketId
            ? `ticket #${event.ticketId}`
            : event.accountId
              ? `account ${event.accountId}`
              : "this work",
          prefill: {
            ...(event.accountId ? { accountNumber: event.accountId } : {}),
            source,
          },
          expiresAt: now + OFFER_TTL_MS,
        });
      },
      { types: TRIGGERS },
    );
  }, []);

  useEffect(() => {
    if (!offer) return;
    const t = window.setTimeout(dismiss, Math.max(0, offer.expiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [offer, dismiss]);

  if (!offer) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 z-40 w-72 rounded-lg border border-border/40 bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-start gap-2">
          <BookmarkCheck className="mt-0.5 size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Capture this resolution?</p>
            <p className="text-[11px] text-muted-foreground">
              Save what fixed {offer.label} so it shows up next time.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => setOpen(true)}>
                Capture
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Not now
              </Button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <ResolutionCaptureDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) dismiss();
        }}
        prefill={offer.prefill}
      />
    </>
  );
}
