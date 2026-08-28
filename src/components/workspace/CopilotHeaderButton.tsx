import { Sparkles } from "lucide-react";
import { openCopilot } from "./CopilotSheet";
import { usePortalContext } from "@/hooks/use-portal-context";
import { useInsights, hasHighInsight } from "@/lib/ai/awareness";

/**
 * Native header entry point for Intel Copilot.
 *
 * This is the primary, always-visible way into Copilot. It reads the existing
 * Portal Context Envelope so the chip honestly reflects what Copilot can see
 * right now (the ticket / account in view), and pulses when a high-severity
 * insight is waiting — the same signal the floating launcher used to own.
 *
 * The product name shown here ("Intel Copilot") is presentational only; the
 * underlying architecture stays brand-neutral and configurable.
 */
export function CopilotHeaderButton() {
  const { envelope } = usePortalContext();
  const insights = useInsights();
  const alert = hasHighInsight(insights);

  const active = envelope.active;
  // Short, honest description of the attached context — read straight from the
  // Portal Context Envelope, never fabricated.
  const contextLabel = active.ticket
    ? (active.ticket.label ?? "Ticket")
    : active.account
      ? `Acct ${active.account.name ?? active.account.id}`
      : active.dispatch
        ? "Dispatch"
        : active.knowledgeNote
          ? (active.knowledgeNote.title ?? "Note")
          : undefined;

  return (
    <button
      type="button"
      onClick={openCopilot}
      title={
        contextLabel
          ? `Intel Copilot — has context: ${contextLabel} (⌘/Ctrl+K)`
          : "Intel Copilot (⌘/Ctrl+K → Ask Intel Copilot)"
      }
      aria-label="Open Intel Copilot"
      className="group relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-white/[0.03] px-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} aria-hidden />
      <span className="hidden font-medium sm:inline">Intel Copilot</span>
      {contextLabel && (
        <span
          className="hidden max-w-[9rem] truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium md:inline"
          style={{
            background: "color-mix(in oklab, var(--cyan-glow) 14%, transparent)",
            color: "var(--cyan-glow)",
          }}
        >
          {contextLabel}
        </span>
      )}
      {alert && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
          style={{
            background: "oklch(0.82 0.18 25)",
            boxShadow: "0 0 8px oklch(0.82 0.18 25)",
            animation: "pulse-glow 2.4s ease-in-out infinite",
          }}
        />
      )}
    </button>
  );
}
