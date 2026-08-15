import { useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  ListChecks,
  OctagonAlert,
  Play,
  SkipForward,
  X,
} from "lucide-react";
import { useGuardedPlan } from "@/lib/plan/use-guarded-plan";
import type { GuardedPlanStep } from "@/lib/plan/plan-contract";

/**
 * Phase 15 — Guarded Plan surface.
 *
 * Shows the derived route, one actionable step at a time, and the verification
 * the operator must complete before the plan advances. This component never
 * mutates anything: a mutating step only ever hands a prepared Safe Action
 * proposal upward for confirmation.
 */

const STATUS_ICON: Record<string, React.ReactNode> = {
  verified: <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />,
  failed: <OctagonAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />,
  blocked: <Ban className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />,
  skipped: <SkipForward className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />,
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-full border border-border/40 p-1 text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function GuardedPlanPanel({
  onPrepare,
}: {
  onPrepare?: (step: GuardedPlanStep) => void;
}) {
  const { plan, start, claimDone, verify, fail, skip, halt, resume, restart } = useGuardedPlan();
  const [open, setOpen] = useState(false);

  const header = (
    <div className="flex items-center gap-1.5">
      <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <ListChecks className="h-3 w-3" /> Guarded plan
      </h3>
      {plan.steps.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );

  if (!plan.steps.length) {
    return (
      <section aria-label="Guarded plan" className="space-y-1">
        {header}
        <p className="text-xs text-muted-foreground">
          {plan.warnings[0]?.message ?? "No grounded plan is available for this work yet."}
        </p>
      </section>
    );
  }

  const current = plan.steps.find((s) => s.fingerprint === plan.currentStepFingerprint);
  const stopped = plan.status === "halted" || plan.status === "abandoned";

  return (
    <section aria-label="Guarded plan" className="space-y-1">
      {header}

      {plan.haltReason && (
        <p className="flex items-start gap-1.5 rounded-md border border-border/40 bg-white/[0.02] p-2 text-[11px] text-muted-foreground">
          <OctagonAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {plan.haltReason}
        </p>
      )}

      {plan.status === "complete" && (
        <p className="text-xs text-muted-foreground">Every step is verified.</p>
      )}

      {current && !stopped && (
        <div className="rounded-md border border-border/40 bg-white/[0.02] p-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-foreground">
              Step {current.index + 1}: {current.label}
            </p>
            <div className="flex shrink-0 gap-1">
              {current.status === "ready" && (
                <IconButton label="Start this step" onClick={() => start(current)}>
                  <Play className="h-3 w-3" />
                </IconButton>
              )}
              {(current.status === "in_progress" || current.status === "ready") && (
                <IconButton label="I've done this — needs verification" onClick={() => claimDone(current)}>
                  <CircleDashed className="h-3 w-3" />
                </IconButton>
              )}
              <IconButton label="Skip this step" onClick={() => skip(current)}>
                <SkipForward className="h-3 w-3" />
              </IconButton>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{current.rationale}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Pill>{current.kind}</Pill>
            <Pill>{current.mutating ? "changes something" : "read only"}</Pill>
            <Pill>risk {current.risk.toLowerCase()}</Pill>
            <Pill>{current.derivation}</Pill>
          </div>

          <div className="mt-1 rounded-md border border-border/30 p-2 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground/80">Verification required</p>
            <p>{current.verification.label}</p>
            <div className="mt-1 flex gap-1">
              <IconButton label="Confirmed — this is verified" onClick={() => verify(current)}>
                <Check className="h-3 w-3" />
              </IconButton>
              <IconButton label="Did not verify — halt the plan" onClick={() => fail(current)}>
                <X className="h-3 w-3" />
              </IconButton>
            </div>
          </div>

          {current.proposedSafeAction && (
            <button
              type="button"
              onClick={() => onPrepare?.(current)}
              className="mt-1 rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              Prepare action (needs your confirmation)
            </button>
          )}
          {current.note && <p className="mt-1 text-[11px] text-muted-foreground">{current.note}</p>}
        </div>
      )}

      {open && (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {plan.steps.map((s) => (
            <li key={s.fingerprint} className="flex items-start gap-1.5">
              {STATUS_ICON[s.status] ?? <CircleDashed className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />}
              <span>
                {s.index + 1}. {s.label} — {s.status.replace(/_/g, " ")}
                {s.blockers.length ? ` (${s.blockers[0].label})` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1">
        {stopped ? (
          <button
            type="button"
            onClick={resume}
            className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Resume plan
          </button>
        ) : (
          <button
            type="button"
            onClick={() => halt("Stopped by the operator.")}
            className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Stop plan
          </button>
        )}
        <button
          type="button"
          onClick={restart}
          className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          Clear progress
        </button>
      </div>

      {plan.warnings.slice(0, 2).map((w) => (
        <p key={w.code} className="text-[11px] text-muted-foreground">
          {w.message}
        </p>
      ))}
    </section>
  );
}