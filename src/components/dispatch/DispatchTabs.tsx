import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Archive, Radio } from "lucide-react";

export function DispatchTabs({ archivedCount }: { archivedCount: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onArchive = pathname.startsWith("/contact-dispatch/archive");
  const tab = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
      active
        ? "border-transparent text-foreground"
        : "border-border/30 text-muted-foreground hover:text-foreground",
    );
  const activeStyle = {
    background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))",
    border: "1px solid oklch(0.78 0.18 220 / 0.45)",
    boxShadow: "0 0 14px var(--cyan-glow)",
  } as const;

  return (
    <div className="flex items-center gap-2">
      <Link to="/contact-dispatch" className={tab(!onArchive)} style={!onArchive ? activeStyle : undefined}>
        <Radio className="h-3.5 w-3.5" /> Active
      </Link>
      <Link to="/contact-dispatch/archive" className={tab(onArchive)} style={onArchive ? activeStyle : undefined}>
        <Archive className="h-3.5 w-3.5" /> Archive
        {archivedCount > 0 && (
          <span className="ml-1 rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums">{archivedCount}</span>
        )}
      </Link>
    </div>
  );
}