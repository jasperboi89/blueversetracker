import { useState, type ReactElement } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  Power,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmExecutionDialog } from "./ConfirmExecutionDialog";
import { runGovernedExecution } from "@/lib/execution/run-execution";
import {
  needsAttention,
  queueStatus,
  useExecutions,
  visibleExecutions,
  executionStore,
  type ExecutionEntry,
  type QueueStatus,
} from "@/lib/execution/execution-store";
import { describePlan } from "@/lib/execution/execution-plan";
import { executionControl } from "@/lib/execution/kill-switch";
import { proposeSevenZeroTwoTwoDemo } from "@/lib/governed/demo-actions";
import { useIsAdmin } from "@/lib/auth/role-context";
import type { ConfirmationProof, ExecutionPlan } from "@/lib/execution/execution-contract";

/**
 * Phase 10 / Governed Actions — the Action Center.
 *
 * One place where an operator sees every governed change: why it was proposed,
 * exactly what it will change, its risk, and how the effect will be verified —
 * then confirms or cancels it. The lifecycle PROPOSED → CONFIRMED → EXECUTED →
 * VERIFIED (with CANCELLED / FAILED as honest terminals) is always visible, so a
 * proposal can never be mistaken for a completed change. Nothing on this surface
 * applies anything on its own, and VERIFIED appears only when verification
 * actually proved the effect.
 */

/** The full lifecycle, in order; CANCELLED/FAILED are shown only when reached. */
const LIFECYCLE: QueueStatus[] = ["proposed", "confirmed", "executed", "verified"];

const STATUS_META: Record<QueueStatus, { label: string; icon: ReactElement; tone: string }> = {
  proposed: {
    label: "Proposed",
    icon: <CircleDashed className="h-3.5 w-3.5" />,
    tone: "text-cyan-300 border-cyan-400/40 bg-cyan-400/10",
  },
  confirmed: {
    label: "Confirmed",
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
    tone: "text-blue-300 border-blue-400/40 bg-blue-400/10",
  },
  executed: {
    label: "Executed",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    tone: "text-violet-300 border-violet-400/40 bg-violet-400/10",
  },
  verified: {
    label: "Verified",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    tone: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  },
  cancelled: {
    label: "Cancelled",
    icon: <Ban className="h-3.5 w-3.5" />,
    tone: "text-slate-300 border-white/15 bg-white/[0.04]",
  },
  failed: {
    label: "Failed",
    icon: <XCircle className="h-3.5 w-3.5" />,
    tone: "text-rose-300 border-rose-400/40 bg-rose-400/10",
  },
};

function StatusBadge({ status }: { status: QueueStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${m.tone}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

/** Horizontal lifecycle tracker. Shows how far a change has actually got. */
function LifecycleTimeline({ status }: { status: QueueStatus }) {
  if (status === "cancelled" || status === "failed") {
    // Terminal off-path outcome: show where it stopped, honestly.
    const reached = status === "failed" ? LIFECYCLE.indexOf("executed") : 0;
    return (
      <div className="mt-2 flex items-center gap-1.5">
        {LIFECYCLE.slice(0, Math.max(1, reached + 1)).map((s) => (
          <span
            key={s}
            className="font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground/70"
          >
            {STATUS_META[s].label}
          </span>
        ))}
        <span className="mx-1 text-muted-foreground/40">→</span>
        <StatusBadge status={status} />
      </div>
    );
  }
  const activeIdx = LIFECYCLE.indexOf(status);
  return (
    <ol className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Lifecycle">
      {LIFECYCLE.map((s, i) => {
        const done = i <= activeIdx;
        return (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-wide ${
                done ? STATUS_META[s].tone.split(" ")[0] : "text-muted-foreground/45"
              }`}
            >
              {done ? STATUS_META[s].icon : <CircleDashed className="h-3 w-3" />}
              {STATUS_META[s].label}
            </span>
            {i < LIFECYCLE.length - 1 && <span className="text-muted-foreground/30">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function EntryCard({
  entry,
  busy,
  onReview,
  onCancel,
}: {
  entry: ExecutionEntry;
  busy: boolean;
  onReview: (plan: ExecutionPlan) => void;
  onCancel: (planId: string) => void;
}) {
  const status = queueStatus(entry);
  const r = entry.receipt;
  const isProposed = status === "proposed";
  return (
    <li className="rounded-md border border-border/40 p-3 text-xs">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 font-medium">{entry.plan.effectSummary}</span>
        <span className="ml-auto shrink-0">
          <StatusBadge status={status} />
        </span>
      </div>

      {/* why — the operator's reason */}
      {entry.reason && (
        <p className="mt-1.5 text-muted-foreground">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Why{" "}
          </span>
          {entry.reason}
        </p>
      )}

      {/* preview + risk */}
      <div className="mt-1.5 rounded border border-white/5 bg-white/[0.02] p-2">
        <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Preview
        </div>
        <ul className="mt-1 space-y-0.5">
          {describePlan(entry.plan).map((line, i) => (
            <li key={i} className="text-muted-foreground">
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/* evidence / verification */}
      {r && r.verification.status !== "not_required" && (
        <p className="mt-1.5 text-muted-foreground">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Evidence{" "}
          </span>
          verification {r.verification.status}
          {r.verification.authority ? ` · ${r.verification.authority}` : ""}
          {r.verification.note ? ` — ${r.verification.note}` : ""}
        </p>
      )}
      {r && <p className="mt-1 text-muted-foreground">{r.message}</p>}
      {r && r.recovery.kind !== "none" && (
        <p className="mt-1 text-amber-400">Next step: {r.recovery.label}</p>
      )}

      <LifecycleTimeline status={status} />

      {isProposed && (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => onReview(entry.plan)}
          >
            Review and apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            disabled={busy}
            onClick={() => onCancel(entry.plan.id)}
          >
            Cancel
          </Button>
        </div>
      )}
    </li>
  );
}

export function ActionCenter({
  operatorRef,
  role,
}: {
  operatorRef: string;
  role: "admin" | "programmer" | "viewer" | null;
}) {
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
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">Action Center</h2>
        <Badge variant="outline" className="text-[10px]">
          {attention.length} needing you
        </Badge>
        {control.mode !== "enabled" && (
          <Badge variant="destructive" className="text-[10px]">
            <Power className="mr-1 h-3 w-3" /> {control.mode.replace("_", " ")}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => proposeSevenZeroTwoTwoDemo({ operatorRef, includeKnowledgeNote: true })}
            title="Prepare (not apply) the governed actions for tonight's 7022 fix"
          >
            Prepare 7022 fix demo
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() =>
                control.mode === "enabled"
                  ? executionControl.disable("switched off by an admin")
                  : executionControl.enable()
              }
            >
              {control.mode === "enabled" ? "Switch execution off" : "Switch execution on"}
            </Button>
          )}
        </div>
      </header>

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No governed changes have been prepared in this session. Changes are always previewed here
          — with their reason, exact effect, risk and verification — before anything is applied.
        </p>
      )}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <EntryCard
            key={entry.plan.id}
            entry={entry}
            busy={busy}
            onReview={(plan) => setPending(plan)}
            onCancel={(planId) => executionStore.cancel(planId)}
          />
        ))}
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
