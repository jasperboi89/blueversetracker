import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Download, LifeBuoy, Power, ShieldAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { executionControl, type ExecutionMode } from "@/lib/execution/kill-switch";
import { overallSyncLabel, useSyncHealth } from "@/lib/cloud-sync/sync-health";
import {
  backupFilename,
  createBackup,
  restoreBackup,
  serializeBackup,
  verifyBackup,
} from "@/lib/backup/snapshot";
import { useIsAdmin } from "@/lib/auth/role-context";

/**
 * Activation 8 — the one place an operator can prove the workspace can be
 * backed up, restored, paused and stopped. Reuses the existing kill switch and
 * cloud-sync mechanisms rather than introducing parallel ones.
 */
export function ResilienceSection() {
  return (
    <section id="resilience" className="scroll-mt-24 rounded-lg border border-border/40 bg-card/40 p-4">
      <header className="mb-3 flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">Backup, Recovery &amp; Emergency Controls</h2>
      </header>
      <div className="space-y-5">
        <SyncHealthBlock />
        <BackupBlock />
        <ExecutionControlBlock />
      </div>
    </section>
  );
}

/* ---------------- sync health ---------------- */

function SyncHealthBlock() {
  const entries = useSyncHealth();
  const overall = overallSyncLabel(entries);
  const problems = entries.filter((e) => e.status !== "synced");
  const Icon = overall.tone === "ok" ? CheckCircle2 : overall.tone === "warn" ? CloudOff : AlertTriangle;
  const tone =
    overall.tone === "ok" ? "text-emerald-400" : overall.tone === "warn" ? "text-amber-400" : "text-destructive";

  return (
    <div className="rounded-md border border-border/30 p-3">
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium">Cloud save status</p>
          <p className="text-xs text-muted-foreground">{overall.text}</p>
        </div>
      </div>
      {problems.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          {problems.map((p) => (
            <li key={p.storeKey} className="flex items-center justify-between gap-2">
              <span className="truncate">{p.storeKey}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {p.status === "sync_failed" ? "not saved to cloud" : p.status.replace("_", " ")}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- backup / restore ---------------- */

function BackupBlock() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<{ raw: string; keys: number; createdAt: string } | null>(null);

  const download = () => {
    const file = createBackup({ takenBy: "operator" });
    if (file.keyCount === 0) {
      toast.error("There is nothing saved on this device to back up yet.");
      return;
    }
    const blob = new Blob([serializeBackup(file)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFilename(file);
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Backup saved — ${file.keyCount} areas of work included.`);
  };

  const pick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const raw = await f.text();
    const verified = verifyBackup(raw);
    if (!verified.ok) {
      toast.error(verified.reason);
      return;
    }
    setPending({ raw, keys: verified.keyCount, createdAt: verified.createdAt });
  };

  const confirmRestore = () => {
    if (!pending) return;
    const result = restoreBackup(pending.raw, { mode: "replace" });
    setPending(null);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    toast.success(`Restored ${result.summary.restored} areas of work. Reloading…`);
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div className="rounded-md border border-border/30 p-3">
      <p className="text-sm font-medium">Workspace backup</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Saves a single file containing every area of work stored on this device. Restoring checks the
        file first and refuses anything damaged or incomplete — it never restores part of a workspace.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Download backup
        </Button>
        <Button size="sm" variant="outline" onClick={pick}>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> Restore from backup
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      </div>

      <ConfirmModal
        open={pending !== null}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        title="Restore this backup?"
        description={
          pending
            ? `This replaces everything currently on this device with the backup taken ${new Date(pending.createdAt).toLocaleString()} (${pending.keys} areas of work). A safety copy of the current state is taken first, and the restore is undone automatically if it cannot finish.`
            : ""
        }
        confirmLabel="Restore"
        onConfirm={confirmRestore}
      />
    </div>
  );
}

/* ---------------- kill switch / safe mode ---------------- */

const MODE_LABEL: Record<ExecutionMode, string> = {
  enabled: "Normal — changes can be applied after confirmation",
  safe_mode: "Safe mode — only low-risk, reversible changes",
  disabled: "Stopped — no changes can be applied",
};

function ExecutionControlBlock() {
  const isAdmin = useIsAdmin();
  const [, force] = useState(0);
  const control = executionControl.get();
  const history = executionControl.history().slice(0, 5);

  const setMode = (fn: () => void, note: string) => {
    fn();
    force((n) => n + 1);
    toast.success(note);
  };

  return (
    <div className="rounded-md border border-border/30 p-3">
      <div className="flex items-center gap-2">
        <Power className={`h-4 w-4 ${control.mode === "enabled" ? "text-emerald-400" : "text-destructive"}`} />
        <p className="text-sm font-medium">Emergency stop</p>
        <Badge variant={control.mode === "enabled" ? "outline" : "destructive"} className="ml-auto text-[10px]">
          {control.mode.replace("_", " ")}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{MODE_LABEL[control.mode]}</p>
      {control.reason && <p className="mt-1 text-[11px] text-muted-foreground">Reason: {control.reason}</p>}
      <p className="mt-1 text-[11px] text-muted-foreground">
        This setting stays in force after a reload or a crash. Preparing and previewing changes keeps
        working while it is on, so you can still see exactly what would have happened.
      </p>

      {isAdmin ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={control.mode === "enabled"}
            onClick={() => setMode(() => executionControl.enable(), "Changes can be applied again.")}
          >
            Resume normal
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={control.mode === "safe_mode"}
            onClick={() => setMode(() => executionControl.safeMode("switched to safe mode by an admin"), "Safe mode is on.")}
          >
            <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Safe mode
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={control.mode === "disabled"}
            onClick={() => setMode(() => executionControl.disable("emergency stop by an admin"), "All changes are stopped.")}
          >
            <Power className="mr-1.5 h-3.5 w-3.5" /> Stop everything
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-muted-foreground">Only an admin can change this.</p>
      )}

      {history.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border/20 pt-2 text-[11px] text-muted-foreground">
          {history.map((h, i) => (
            <li key={`${h.at}-${i}`}>
              {new Date(h.at).toLocaleString()} — {h.mode.replace("_", " ")} by {h.actor || "unknown"}
              {h.reason ? ` (${h.reason})` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
