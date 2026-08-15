import { useState } from "react";
import { BookMarked, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { IsScriptEntriesPane } from "./IsScriptEntriesPane";
import { IsManualsPane } from "./IsManualsPane";

type Pane = "entries" | "manuals";

export function IsScriptWorkspace() {
  const [pane, setPane] = useState<Pane>("entries");
  const [seed, setSeed] = useState<{ title: string; usageHtml: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PaneTab
          active={pane === "entries"}
          icon={Terminal}
          label="Entries"
          onClick={() => setPane("entries")}
        />
        <PaneTab
          active={pane === "manuals"}
          icon={BookMarked}
          label="Manuals"
          onClick={() => setPane("manuals")}
        />
      </div>

      {pane === "entries" ? (
        <IsScriptEntriesPane seed={seed} onSeedConsumed={() => setSeed(null)} />
      ) : (
        <IsManualsPane
          onSaveAsEntry={(next) => {
            setSeed(next);
            setPane("entries");
          }}
        />
      )}
    </div>
  );
}

function PaneTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Terminal;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground transition hover:border-cyan-300/30 hover:text-foreground",
        active && "border-cyan-300/45 bg-cyan-300/10 text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
