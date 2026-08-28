import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ShieldCheck, Search } from "lucide-react";
import {
  intelligenceFeedback,
  useIntelligenceFeedback,
  FEEDBACK_LABEL,
  type FeedbackKind,
  type FeedbackTargetType,
} from "@/lib/core/intelligence-feedback";

/**
 * Claim Inspector (Phase 3, Part 9) — a reusable, evidence-aware card for
 * intelligence claims (pattern observations, radar items, resolution matches).
 *
 * Shows STATUS (confidence class), BASIS (a concise reasoning summary — never
 * hidden chain-of-thought), SOURCES (linked evidence), and last-observed, with
 * an expandable evidence list and an optional feedback row. Design: quiet by
 * default; evidence only when asked for.
 */

export interface ClaimSource {
  label: string;
  to?: string;
  params?: Record<string, string>;
}

export interface ClaimInspectorProps {
  title: string;
  /** Confidence class or status, e.g. "SUPPORTED", "INFERRED", "VERIFIED". */
  status: string;
  /** Concise reasoning summary — what the claim is based on. No chain-of-thought. */
  basis: string;
  sources?: ClaimSource[];
  lastObserved?: string;
  tone?: "info" | "notice" | "elevated";
  /** Enables the feedback row when provided. */
  feedback?: {
    targetType: FeedbackTargetType;
    targetId: string;
    accountId?: string;
    patternType?: string;
  };
}

const TONE_COLOR: Record<NonNullable<ClaimInspectorProps["tone"]>, string> = {
  info: "var(--status-info)",
  notice: "var(--status-warning)",
  elevated: "var(--status-critical)",
};

const FEEDBACK_CHOICES: FeedbackKind[] = [
  "useful",
  "not_relevant",
  "outdated",
  "incorrect",
  "resolved",
];

export function ClaimInspector({
  title,
  status,
  basis,
  sources = [],
  lastObserved,
  tone = "info",
  feedback,
}: ClaimInspectorProps) {
  const [open, setOpen] = useState(false);
  const fbState = useIntelligenceFeedback();
  const recorded = feedback ? fbState.byTarget[feedback.targetId] : undefined;
  const accent = TONE_COLOR[tone];

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: "var(--surface-border)",
        background: "var(--surface-1)",
        boxShadow: `inset 3px 0 0 ${accent}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} aria-hidden />
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span
              className="rounded-full px-1.5 py-0.5 font-medium uppercase tracking-wide"
              style={{
                background: "color-mix(in oklab, " + accent + " 14%, transparent)",
                color: accent,
              }}
            >
              {status}
            </span>
            <span>{basis}</span>
            {lastObserved && (
              <span>· last observed {new Date(lastObserved).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        {sources.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            <Search className="h-3 w-3" aria-hidden /> Evidence
            <ChevronDown
              className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        )}
      </div>

      {open && sources.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border/30 pt-2">
          {sources.map((s, i) => (
            <li key={`${s.label}-${i}`} className="text-[11px]">
              {s.to ? (
                <Link
                  to={s.to as never}
                  params={(s.params ?? {}) as never}
                  className="text-[color:var(--intel-accent)] underline-offset-2 hover:underline"
                >
                  {s.label}
                </Link>
              ) : (
                <span className="text-muted-foreground">{s.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {feedback && (
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border/30 pt-2">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Feedback
          </span>
          {FEEDBACK_CHOICES.map((kind) => {
            const active = recorded?.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() =>
                  intelligenceFeedback.record({
                    targetType: feedback.targetType,
                    targetId: feedback.targetId,
                    kind,
                    ...(feedback.accountId ? { accountId: feedback.accountId } : {}),
                    ...(feedback.patternType ? { patternType: feedback.patternType } : {}),
                  })
                }
                className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                  active
                    ? "border-transparent text-foreground"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
                }`}
                style={
                  active
                    ? { background: "color-mix(in oklab, var(--intel-accent) 18%, transparent)" }
                    : undefined
                }
              >
                {FEEDBACK_LABEL[kind]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
