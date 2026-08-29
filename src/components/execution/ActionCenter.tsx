import { useState, type ReactElement } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Power, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmExecutionDialog } from "./ConfirmExecutionDialog";
import { runGovernedExecution } from "@/lib/execution/run-execution";
import { needsAttention, useExecutions, visibleExecutions } from "@/lib/execution/execution-store";
import { executionControl } from "@/lib/execution/kill-switch";
import { useIsAdmin } from "@/lib/auth/role-context";
import type { ConfirmationProof, ExecutionPlan } from "@/lib/execution/execution-contract";

/**
 * Phase 10 — the Action Center.
 *
 * One place where an operator sees every governed change: what is waiting on
 * confirmation, what ran, what was refused, and — crucially — what came back
 * UNCERTAIN and still needs a human to verify. Nothing on this surface applies
 * anything on its own.
 */

const STATUS_ICON: Record<string, ReactElement> = {
  succeeded: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  rejected: <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />,
  uncertain: <HelpCircle className="h-3.5 w-3.5 text-amber-400" />,
  compensation_available: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
};

export function ActionCenter({ operatorRef, role }: { operatorRef: string; role: "admin" | "programmer" | "viewer" | null }) {
  const isAdmin = useIsAdmin();
  const all = useExecutions();
  const entries = visibleExecutions(all, operatorRef, isAdmin);
  const attention = needsAttention(entries);
  const [pending, setPending] = useState<ExecutionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const control = executionControl.get();

  const run = async (plan: ExecutionPlan, proof: ConfirmationProof) => {
    setBusy(true);
    try {
      await runGovernedExecution(plan, { operatorRef, role, confirmation: proof });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-border/40 bg-card/40 p-4">
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Action Center</h2>
        <Badge variant="outline" className="text-[10px]">
          {attention.length} needing you
        </Badge>
        {control.mode !== "enabled" && (
          <Badge variant="destructive" className="text-[10px]">
            <Power className="mr-1 h-3 w-3" /> {control.mode.replace("_", " ")}
          </Badge>
        )}
        {isAdmin && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-xs"
            onClick={() =>
              control.mode === "enabled"
                ? executionControl.disable("switched off by an admin")
                : executionControl.enable()
            }
          >
            {control.mode === "enabled" ? "Switch execution off" : "Switch execution on"}
          </Button>
        )}
      </header>

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No governed changes have been prepared in this session. Changes are always previewed here
          before anything is applied.
        </p>
      )}

      <ul className="space-y-2">
        {entries.map((entry) => {
          const r = entry.receipt;
          return (
            <li key={entry.plan.id} className="rounded-md border border-border/40 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                {r ? STATUS_ICON[r.status] ?? null : <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                <span className="font-medium">{entry.plan.effectSummary}</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {r?.status ?? entry.status.replace("_", " ")}
                </Badge>
              </div>
              <div className="mt-1 text-muted-foreground">
                {entry.plan.capabilityId} · {entry.plan.target.type} {entry.plan.target.id} · risk{" "}
                {entry.plan.riskClass}
              </div>

              {r && <div className="mt-1">{r.message}</div>}
              {r?.verification.status && r.verification.status !== "not_required" && (
                <div className="mt-1 text-muted-foreground">
                  Verification: {r.verification.status}
                  {r.verification.note ? ` — ${r.verification.note}` : ""}
                </div>
              )}
              {r?.recovery.kind && r.recovery.kind !== "none" && (
                <div className="mt-1 text-amber-400">Next step: {r.recovery.label}</div>
              )}

              {entry.status === "awaiting_confirmation" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-xs"
                  disabled={busy}
                  onClick={() => setPending(entry.plan)}
                >
                  Review and apply
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmExecutionDialog
        plan={pending}
        operatorRef={operatorRef}
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        onConfirmed={(proof) => {
          const plan = pending;
          setPending(null);
          if (plan) void run(plan, proof);
        }}
      />
    </section>
  );
}
