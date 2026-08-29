import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, CircleDashed, HelpCircle, ShieldCheck } from "lucide-react";
import { useExecutions } from "@/lib/execution/execution-store";
import { executionControl } from "@/lib/execution/kill-switch";

/**
 * Governed action lifecycle summary.
 *
 * Read-only. It counts what the session's governed-execution store actually
 * holds and shows the progression PROPOSED → CONFIRMED → EXECUTED → VERIFIED
 * as visually distinct stages, so a proposal can never be mistaken for a
 * completed change. Applying anything still happens in the Action Center.
 */
export function GovernedActionsBand() {
  const entries = useExecutions();
  const control = executionControl.get();

  const proposed = entries.filter((e) => e.status === "awaiting_confirmation").length;
  const confirmed = entries.filter((e) => e.status === "running").length;
  const executed = entries.filter((e) => e.status === "done" && e.receipt?.status === "succeeded").length;
  const verified = entries.filter((e) => e.receipt?.verification.status === "verified").length;
  const uncertain = entries.filter(
    (e) => e.receipt?.status === "uncertain" || e.receipt?.status === "compensation_available",
  ).length;

  const stages = [
    { key: "PROPOSED", value: proposed, icon: CircleDashed, accent: "var(--cyan-glow)" },
    { key: "CONFIRMED", value: confirmed, icon: ShieldCheck, accent: "var(--electric)" },
    { key: "EXECUTED", value: executed, icon: CheckCircle2, accent: "var(--violet-glow)" },
    { key: "VERIFIED", value: verified, icon: CheckCircle2, accent: "var(--green-glow)" },
  ];

  return (
    <div className="cc-surface cc-surface--interactive p-4 sm:p-5" style={{ ["--cc-accent" as string]: "var(--green-glow)" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">
          Governed action lifecycle
        </h3>
        {control.mode !== "enabled" && (
          <span className="cc-pill" data-tone="warn">
            Execution {control.mode.replace("_", " ")}
          </span>
        )}
        {uncertain > 0 && (
          <span className="cc-pill" data-tone="warn">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            {uncertain} need a human decision
          </span>
        )}
        <Link
          to="/cognitive-runs"
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open Action Center <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ol className="flex flex-wrap gap-2">
        {stages.map((s) => (
          <li
            key={s.key}
            className="cc-stage"
            data-active={s.value > 0}
            style={{ ["--cc-accent" as string]: s.accent }}
          >
            <div className="flex items-center gap-1.5">
              <s.icon
                className="h-3.5 w-3.5"
                aria-hidden
                style={{ color: s.value > 0 ? s.accent : "var(--muted-foreground)" }}
              />
              <span className="cc-stage__label">{s.key}</span>
            </div>
            <div className="cc-stage__value">{s.value}</div>
          </li>
        ))}
      </ol>

      {entries.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          No governed changes prepared in this session. Every change is previewed and confirmed
          before anything is applied.
        </p>
      )}
    </div>
  );
}
