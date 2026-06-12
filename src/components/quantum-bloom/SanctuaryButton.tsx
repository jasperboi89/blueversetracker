import { Moon } from "lucide-react";
import { sanctuary } from "@/lib/quantum-bloom/sanctuary-store";
import { useTheme } from "@/lib/settings/theme-store";

export function SanctuaryButton() {
  const theme = useTheme();
  if (theme !== "quantum-bloom") return null;
  return (
    <button
      type="button"
      onClick={() => sanctuary.enter()}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
      title="Enter Sanctuary"
    >
      <Moon className="h-3 w-3" />
      Sanctuary
    </button>
  );
}
