import { useEffect } from "react";
import { sanctuary, useSanctuary } from "@/lib/quantum-bloom/sanctuary-store";
import { X } from "lucide-react";

export function SanctuaryShell() {
  const active = useSanctuary();

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") sanctuary.exit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (!active) return null;

  return (
    <button
      type="button"
      onClick={() => sanctuary.exit()}
      className="crystal-glass fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 px-4 py-2 text-xs font-medium text-foreground"
      aria-label="Exit Sanctuary"
    >
      <span className="inline-flex items-center gap-2">
        <X className="h-3.5 w-3.5" />
        Sanctuary · Esc to exit
      </span>
    </button>
  );
}
