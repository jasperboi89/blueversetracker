import { Sparkles } from "lucide-react";
import { openCopilot } from "./CopilotSheet";
import { useInsights, hasHighInsight } from "@/lib/ai/awareness";

/**
 * Persistent Copilot launcher (bottom-right). Pulses with a dot when a
 * high-severity insight is present, so the assistant signals when it's worth
 * a look without interrupting with a toast.
 */
export function CopilotLauncher() {
  const insights = useInsights();
  const alert = hasHighInsight(insights);

  return (
    <button
      onClick={openCopilot}
      title="Intel Copilot (⌘/Ctrl+K → Ask Intel Copilot)"
      className="glass-panel fixed bottom-4 right-4 z-[115] grid h-11 w-11 place-items-center rounded-full"
      style={{ boxShadow: "0 0 20px oklch(0.78 0.18 220 / 0.35)" }}
    >
      <Sparkles className="h-5 w-5" style={{ color: "var(--cyan-glow)" }} />
      {alert && (
        <span
          className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold"
          style={{
            background: "oklch(0.82 0.18 25)",
            color: "white",
            boxShadow: "0 0 10px oklch(0.82 0.18 25)",
            animation: "pulse-glow 2.4s ease-in-out infinite",
          }}
        >
          !
        </span>
      )}
    </button>
  );
}
