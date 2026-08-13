import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Archive, BookmarkCheck, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCentralShort } from "@/lib/shift";
import { eventSpine } from "@/lib/core/event-spine";
import { findResolutionMemories, resolutionService } from "@/lib/resolution/resolution-service";
import {
  CONFIDENCE_LABEL,
  type ResolutionConfidence,
  type ResolutionMemory,
} from "@/lib/resolution/resolution-types";
import { ResolutionCaptureDialog } from "./ResolutionCaptureDialog";

const CONFIDENCE_COLOR: Record<ResolutionConfidence, string> = {
  verified: "var(--green-glow)",
  probable: "var(--gold-glow)",
  unknown: "var(--muted-foreground)",
};

/** Compact "Known Resolutions" surface for the account context area. */
export function ResolutionsPanel({
  accountNumber,
  accountName,
}: {
  accountNumber: string;
  accountName?: string;
}) {
  const [rows, setRows] = useState<ResolutionMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [capture, setCapture] = useState(false);
  const [supersede, setSupersede] = useState<ResolutionMemory | null>(null);
  const [viewing, setViewing] = useState<ResolutionMemory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await findResolutionMemories({ accountNumber, includeInactive: showHistory }));
      setError(null);
    } catch (err) {
      // Fail soft — the account page must still render.
      setError(err instanceof Error ? err.message : "Could not load resolutions.");
    } finally {
      setLoading(false);
    }
  }, [accountNumber, showHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => eventSpine.subscribe(() => void load(), {
      accountId: accountNumber,
      types: [
        "resolution.created",
        "resolution.updated",
        "resolution.superseded",
        "resolution.archived",
      ],
    }),
    [accountNumber, load],
  );

  const archive = async (memory: ResolutionMemory) => {
    try {
      await resolutionService.archive(memory.id);
      toast.success("Resolution archived.");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookmarkCheck className="size-4" /> Known Resolutions
        </h2>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHistory((v) => !v)}
            title="Include superseded and archived resolutions"
          >
            {showHistory ? "Current only" : "History"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCapture(true)}>
            <Plus className="mr-1 size-3.5" /> Capture
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-muted-foreground">
          Resolutions unavailable right now — {error}
        </p>
      ) : loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No captured resolutions for this account yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-border/30 bg-white/[0.02] p-3 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: CONFIDENCE_COLOR[r.confidence] }}
                  >
                    <ShieldCheck className="size-3" />
                    {CONFIDENCE_LABEL[r.confidence]}
                    {r.status !== "active" ? (
                      <span className="text-muted-foreground"> · {r.status}</span>
                    ) : null}
                  </div>
                  <p className="truncate font-medium text-foreground">{r.problem}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Resolved {formatCentralShort(new Date(r.updatedAt))}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setViewing(r)}>
                  View
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ResolutionCaptureDialog
        open={capture || Boolean(supersede)}
        onOpenChange={(open) => {
          if (!open) {
            setCapture(false);
            setSupersede(null);
          }
        }}
        prefill={{ accountNumber, ...(accountName ? { accountName } : {}) }}
        supersedes={supersede}
        onSaved={() => void load()}
      />

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Resolution</DialogTitle>
          </DialogHeader>
          {viewing ? (
            <div className="space-y-3 text-sm">
              <Detail label="Problem" value={viewing.problem} />
              <Detail label="Root cause" value={viewing.rootCause} />
              <Detail label="Resolution" value={viewing.resolution} />
              <Detail label="Testing" value={viewing.testing} />
              <Detail label="Rollback" value={viewing.rollback} />
              <Detail label="Affected area" value={viewing.affectedArea} />
              <Detail label="Confidence" value={CONFIDENCE_LABEL[viewing.confidence]} />
              <Detail
                label="Status"
                value={
                  viewing.status === "superseded"
                    ? "Superseded by a newer resolution"
                    : viewing.status
                }
              />
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Source
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {viewing.source.ticketId ? (
                    <Link
                      to="/freshdesk-tickets"
                      className="text-primary underline underline-offset-2"
                    >
                      Ticket #{viewing.source.ticketId}
                    </Link>
                  ) : null}
                  {viewing.source.changeRecordId ? (
                    <span className="text-muted-foreground">
                      Change record {viewing.source.changeRecordId.slice(0, 8)}
                    </span>
                  ) : null}
                  {viewing.source.workItemId ? (
                    <span className="text-muted-foreground">
                      Work item {viewing.source.workItemId.slice(0, 8)}
                    </span>
                  ) : null}
                  {viewing.source.dispatchId ? (
                    <Link
                      to="/contact-dispatch"
                      className="text-primary underline underline-offset-2"
                    >
                      Dispatch session
                    </Link>
                  ) : null}
                  {Object.keys(viewing.source).length === 0 ? (
                    <span className="text-muted-foreground">Captured manually</span>
                  ) : null}
                </div>
              </div>
              {viewing.status === "active" ? (
                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => void archive(viewing)}>
                    <Archive className="mr-1 size-3.5" /> Archive
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSupersede(viewing);
                      setViewing(null);
                    }}
                  >
                    <RefreshCw className="mr-1 size-3.5" /> Replace
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-foreground">{value}</p>
    </div>
  );
}
