/**
 * Phase 9 — shared, restrained visual primitives for cognitive run inspection.
 *
 * Everything here renders TEXT ONLY. No worker output is ever passed through
 * dangerouslySetInnerHTML: worker summaries, claims, evidence labels and
 * account names are untrusted strings and are escaped by React.
 */

import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border/50 text-muted-foreground",
  good: "border-emerald-500/40 text-emerald-300",
  warn: "border-amber-500/40 text-amber-300",
  bad: "border-red-500/40 text-red-300",
  info: "border-sky-500/40 text-sky-300",
};

/** Badges carry a text label as well as colour — never colour-only. */
export function RunBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-xs text-foreground/90">{value}</dd>
    </div>
  );
}

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/40 bg-white/[0.02] p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
      <div className="mt-2 space-y-2 text-xs text-foreground/85">{children}</div>
    </section>
  );
}

export function Bullets({ items, empty }: { items: string[]; empty?: string }) {
  if (!items.length) return empty ? <p className="text-[11px] text-muted-foreground">{empty}</p> : null;
  return (
    <ul className="list-disc space-y-1 pl-4 text-xs">
      {items.map((t, i) => (
        <li key={`${i}-${t.slice(0, 24)}`}>{t}</li>
      ))}
    </ul>
  );
}

export function statusTone(state: string): Tone {
  switch (state) {
    case "completed":
      return "good";
    case "partial":
      return "warn";
    case "blocked":
      return "bad";
    case "failed":
      return "bad";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

export function guardianTone(decision: string): Tone {
  switch (decision) {
    case "ALLOW":
      return "good";
    case "ALLOW_WITH_LIMITS":
      return "info";
    case "REQUIRE_HUMAN_CONFIRMATION":
      return "warn";
    default:
      return "bad";
  }
}

export function workerStatusTone(status: string): Tone {
  switch (status) {
    case "contributed":
      return "good";
    case "unavailable":
    case "failed":
    case "capability_blocked":
      return "bad";
    case "budget_exhausted":
      return "warn";
    default:
      return "neutral";
  }
}

export function fmtWhen(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
