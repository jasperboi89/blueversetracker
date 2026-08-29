/**
 * Activation 7 — Script Twin presentational components.
 *
 * Pure, model-driven React. Every component renders from the normalized Twin
 * model; none embeds account logic. Classic controls use a deliberately plain,
 * pale "Infinity" grammar (inline styles so the period look is theme-independent);
 * Enhanced overlays and badges use the portal's dark tokens.
 *
 * Honesty: evidence/provenance badges always pair colour with an icon AND text
 * (never colour alone), and `verified` is the only state styled as "true".
 */

import type { CSSProperties, ReactNode } from "react";
import {
  Ban,
  CircleDashed,
  Eye,
  HelpCircle,
  Hourglass,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EVIDENCE_STATE_META, type EvidenceState } from "@/lib/script/twin/evidence-state";
import type { TwinElement, TwinProvenance } from "@/lib/script/twin/twin-model";

/* ---------------------------- evidence + provenance --------------------------- */

const EVIDENCE_ICON: Record<EvidenceState, LucideIcon> = {
  verified: ShieldCheck,
  observed: Eye,
  partial: CircleDashed,
  inferred: Sparkles,
  insufficient_history: Hourglass,
  unknown: HelpCircle,
  unsupported: Ban,
};

const EVIDENCE_CLASS: Record<EvidenceState, string> = {
  verified: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  observed: "text-cyan-300 border-cyan-400/35 bg-cyan-400/10",
  partial: "text-slate-300 border-white/15 bg-white/[0.04]",
  inferred: "text-violet-300 border-violet-400/40 bg-violet-400/10",
  insufficient_history: "text-slate-400 border-dashed border-white/20 bg-transparent",
  unknown: "text-slate-400 border-white/12 bg-transparent",
  unsupported: "text-amber-300 border-amber-400/40 bg-amber-400/10",
};

export function EvidenceBadge({
  state,
  className,
  title,
}: {
  state: EvidenceState;
  className?: string;
  title?: string;
}) {
  const Icon = EVIDENCE_ICON[state];
  const meta = EVIDENCE_STATE_META[state];
  return (
    <span
      title={title ?? meta.help}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        EVIDENCE_CLASS[state],
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {meta.label}
    </span>
  );
}

export function ProvenanceBadge({ provenance }: { provenance: TwinProvenance }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
        {provenance.source.replace(/_/g, " ").toLowerCase()}
      </span>
      <EvidenceBadge state={provenance.evidence} />
    </span>
  );
}

export function DependencyBadge({
  label,
  status,
}: {
  label: string;
  status: "resolved" | "partial" | "unresolved";
}) {
  const map = {
    resolved: "text-emerald-300 border-emerald-400/30",
    partial: "text-slate-300 border-white/15",
    unresolved: "text-amber-300 border-amber-400/35",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide",
        map[status],
      )}
    >
      {label}
    </span>
  );
}

export function SimulationMarker({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-cyan-300">
      {children}
    </span>
  );
}

/**
 * Enhanced-mode overlay for one element: a badge cluster shown only when
 * `enhanced` is true. Kept optional and readable (STEP 4/9).
 */
export function TwinOverlay({ element, enhanced }: { element: TwinElement; enhanced: boolean }) {
  if (!enhanced) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-[128px]">
      <ProvenanceBadge provenance={element.provenance} />
      {element.visibility ? (
        <span className="inline-flex items-center gap-1">
          <span className="font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
            reveal
          </span>
          <EvidenceBadge state={element.visibility.provenance.evidence} />
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------ Classic controls ------------------------------ */
/* Pale, period-accurate Infinity grammar. Inline styles keep the look stable
   regardless of the portal theme. These are display-only in the sandbox. */

const paleLabel: CSSProperties = { flex: "0 0 118px", color: "#333", fontSize: 12 };
const paleInput: CSSProperties = {
  flex: 1,
  fontSize: 13,
  padding: "3px 6px",
  border: "1px solid #8a8a80",
  background: "#fff",
  borderRadius: 2,
  color: "#111",
  fontFamily: "inherit",
};

export function PromptText({ children }: { children: ReactNode }) {
  return <p style={{ fontStyle: "italic", color: "#333", margin: "0 0 4px" }}>{children}</p>;
}

export function InstructionText({ children }: { children: ReactNode }) {
  return <p style={{ color: "#137a2e", fontSize: 12, margin: "0 0 12px" }}>{children}</p>;
}

export function GuidancePanel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "#dfeaf7",
        border: "1px solid #a9c4e4",
        borderRadius: 3,
        padding: "8px 11px",
        color: "#1c3350",
        fontSize: 12,
        margin: "12px 0",
      }}
    >
      {children}
    </div>
  );
}

export function ReviewPanel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "#f3efe0",
        border: "1px solid #cdbf8f",
        borderRadius: 3,
        padding: "10px 12px",
        color: "#4a3f21",
        fontSize: 12.5,
        margin: "6px 0",
      }}
    >
      {children}
    </div>
  );
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "9px 0" }}>
      <label style={paleLabel}>{label}</label>
      {children}
    </div>
  );
}

export function TextField({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      id={id}
      aria-label={placeholder ?? id}
      style={paleInput}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextAreaField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      id={id}
      aria-label={id}
      style={{ ...paleInput, minHeight: 56, resize: "vertical" }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ListField({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      id={id}
      aria-label={id}
      size={Math.min(4, Math.max(2, options.length))}
      style={{ ...paleInput, padding: 0 }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ComboField({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      id={id}
      aria-label={id}
      style={paleInput}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— select —</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ReadOnlyField({ value }: { value: string }) {
  return (
    <span
      style={{
        ...paleInput,
        background: "#efefe8",
        color: "#555",
        display: "inline-block",
      }}
    >
      {value || "—"}
    </span>
  );
}

export function NameFieldPair({
  subLabels,
  values,
  onChange,
}: {
  subLabels: [string, string];
  values: [string, string];
  onChange: (which: 0 | 1, v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flex: 1 }}>
      <input
        aria-label={subLabels[0]}
        placeholder={subLabels[0]}
        style={paleInput}
        value={values[0]}
        onChange={(e) => onChange(0, e.target.value)}
      />
      <input
        aria-label={subLabels[1]}
        placeholder={subLabels[1]}
        style={paleInput}
        value={values[1]}
        onChange={(e) => onChange(1, e.target.value)}
      />
    </div>
  );
}

export function PhoneFieldPair({
  values,
  onChange,
}: {
  values: [string, string];
  onChange: (which: 0 | 1, v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flex: 1 }}>
      <input
        aria-label="Phone"
        placeholder="Phone"
        style={{ ...paleInput, flex: 2 }}
        value={values[0]}
        onChange={(e) => onChange(0, e.target.value)}
      />
      <input
        aria-label="Extension"
        placeholder="Ext"
        style={{ ...paleInput, flex: 1 }}
        value={values[1]}
        onChange={(e) => onChange(1, e.target.value)}
      />
    </div>
  );
}

export function ActionButton({
  label,
  variant = "neutral",
  onClick,
}: {
  label: string;
  variant?: "neutral" | "save" | "back";
  onClick?: () => void;
}) {
  const base: CSSProperties = {
    fontFamily: '"Segoe UI", sans-serif',
    fontSize: 12.5,
    padding: "6px 15px",
    borderRadius: 3,
    cursor: "pointer",
    border: "1px solid #7a7a70",
    background: "linear-gradient(#fbfbf7,#e2e2d8)",
    color: "#222",
  };
  const save: CSSProperties = {
    background: "linear-gradient(#e8595f,#c8323a)",
    borderColor: "#a5252c",
    color: "#fff",
    fontWeight: 600,
  };
  return (
    <button
      type="button"
      style={{ ...base, ...(variant === "save" ? save : {}) }}
      onClick={onClick}
    >
      {variant === "back" ? "◄ " : ""}
      {label}
    </button>
  );
}

export function NavigationControl({ label, onClick }: { label: string; onClick?: () => void }) {
  return <ActionButton label={label} variant="back" onClick={onClick} />;
}
