import { type SectionStatus, SECTION_STATUS_LABEL } from "@/lib/dispatch-store";
import { useDropdownLabel } from "@/lib/settings/dropdowns-store";
import { glowMix } from "@/lib/visual-style";

const styles: Record<SectionStatus, { color: string; bg: string }> = {
  "not-tested":   { color: "oklch(0.7 0.04 240)",  bg: "oklch(0.7 0.04 240 / 0.12)" },
  "in-progress":  { color: "var(--cyan-glow)",     bg: "oklch(0.85 0.16 210 / 0.16)" },
  passed:         { color: "var(--green-glow)",    bg: "oklch(0.82 0.18 155 / 0.18)" },
  failed:         { color: "oklch(0.72 0.22 25)",  bg: "oklch(0.72 0.22 25 / 0.16)" },
  "passed-retest":{ color: "var(--green-glow)",    bg: "oklch(0.82 0.18 155 / 0.16)" },
  "still-failed": { color: "oklch(0.72 0.22 25)",  bg: "oklch(0.72 0.22 25 / 0.2)" },
  "waiting-review":{ color: "var(--gold-glow)",    bg: "oklch(0.85 0.16 85 / 0.16)" },
  complete:       { color: "var(--green-glow)",    bg: "oklch(0.82 0.18 155 / 0.14)" },
  na:             { color: "oklch(0.7 0.04 240)",  bg: "oklch(0.7 0.04 240 / 0.1)" },
};

export function StatusChip({ status, className = "" }: { status: SectionStatus; className?: string }) {
  const s = styles[status];
  const label = useDropdownLabel("sectionStatus", status, SECTION_STATUS_LABEL[status]);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${className}`}
      style={{ color: s.color, background: s.bg, borderColor: glowMix(s.color, 45) }}
    >
      {label}
    </span>
  );
}