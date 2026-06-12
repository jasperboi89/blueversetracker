import { ChevronDown, ChevronRight } from "lucide-react";
import type { SectionStatus } from "@/lib/dispatch-store";
import { StatusChip } from "./StatusChip";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  status,
  open,
  onToggle,
  badge,
  required,
  children,
}: {
  title: string;
  status: SectionStatus;
  open: boolean;
  onToggle: () => void;
  badge?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("glass-panel")}>
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {required && <span className="text-[10px] uppercase tracking-wider text-[color:var(--gold-glow)]">Required</span>}
        </div>
        <div className="flex items-center gap-2">
          {badge && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{badge}</span>}
          <StatusChip status={status} />
        </div>
      </button>
      {open && <div className="border-t border-border/30 p-4">{children}</div>}
    </div>
  );
}