import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { subscribeCelebrations, type CelebrationEvent } from "@/lib/quantum-bloom/celebration-bus";

export function DiscoveryToast() {
  const [toast, setToast] = useState<CelebrationEvent | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeCelebrations((e) => {
      if (document.hidden) return;
      setToast(e);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setToast(null), 3000);
    });
    return () => {
      unsub();
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-[95] max-w-xs"
      style={{ animation: "qb-discovery-toast-in 320ms ease-out" }}
    >
      <div className="crystal-glass flex items-center gap-2 px-3 py-2 text-xs text-foreground">
        <Sparkles
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--qb-phase-accent, var(--cyan-glow))" }}
        />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Discovery unlocked
          </div>
          <div className="font-medium">{toast.label}</div>
        </div>
      </div>
    </div>
  );
}
