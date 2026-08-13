import { useState } from "react";
import { FileText, Loader2, Sparkles, ClipboardCopy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { toast } from "sonner";
import { useNow } from "@/hooks/use-now";
import { getCentralNow } from "@/lib/shift";
import { useNavigate } from "@tanstack/react-router";
import { aiShiftSummary } from "@/lib/ai/ai.functions";
import { aiStyleHint, useAISettings } from "@/lib/settings/ai-settings-store";
import { ticketsStore, isOverdue, STATUS_LABEL } from "@/lib/tickets-store";
import { nightPlanStore } from "@/lib/night-plan-store";

function buildShiftSnapshot(): string {
  const { tickets } = ticketsStore.getState();
  const completed = tickets.filter((t) => t.status === "completed");
  const open = tickets.filter((t) => t.status !== "completed");
  const plan = nightPlanStore.get().items;
  const lines: string[] = [];
  lines.push(`COMPLETED (${completed.length}):`);
  for (const t of completed.slice(0, 40)) {
    lines.push(
      `#${t.number} acct ${t.accountNumber || "?"} [${t.issueClassification ?? "?"}]: ${t.details.subject || ""}`,
    );
  }
  lines.push(`\nSTILL OPEN (${open.length}):`);
  for (const t of open.slice(0, 30)) {
    lines.push(
      `#${t.number} acct ${t.accountNumber || "?"} — ${STATUS_LABEL[t.status]}${isOverdue(t) ? " [OVERDUE]" : ""}`,
    );
  }
  lines.push(
    `\nNIGHT PLAN: ${plan
      .map((i) => `${i.task} (${i.status})`)
      .slice(0, 20)
      .join("; ")}`,
  );
  return lines.join("\n").slice(0, 7500);
}

function computeWindow(now: Date) {
  const p = getCentralNow();
  // Shift = previous 10pm through 6am of same morning if hour < 6,
  // or tonight 10pm through tomorrow 6am if hour >= 22,
  // or "next shift" otherwise (still display tonight 10pm - tomorrow 6am)
  const today = new Date(now);
  const start = new Date(today);
  const end = new Date(today);
  if (p.hour >= 22) {
    start.setHours(22, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(6, 0, 0, 0);
  } else if (p.hour < 6 || p.hour < 10) {
    // assume early-morning -> shift was yesterday 10pm
    start.setDate(start.getDate() - 1);
    start.setHours(22, 0, 0, 0);
    end.setHours(6, 0, 0, 0);
  } else {
    start.setHours(22, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(6, 0, 0, 0);
  }
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  return `${fmt(start)} → ${fmt(end)} Central`;
}

export function ShiftSummaryButton() {
  const [open, setOpen] = useState(false);
  const now = useNow(60_000);
  const win = computeWindow(now);
  const navigate = useNavigate();
  const ai = useAISettings();
  const [aiDraft, setAiDraft] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const draftWithAI = async () => {
    setAiBusy(true);
    setAiDraft("");
    const res = await aiShiftSummary({
      data: { snapshot: buildShiftSnapshot(), style: aiStyleHint(ai) },
    });
    setAiBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "AI failed.");
      return;
    }
    setAiDraft(res.text ?? "");
  };

  const goCurrent = () => {
    setOpen(false);
    navigate({ to: "/reports", search: { r: "prog-email", window: "current" } });
  };
  const goCustom = () => {
    setOpen(false);
    navigate({ to: "/reports", search: { r: "prog-email", window: "custom" } });
  };

  return (
    <div className="flex justify-center pt-2">
      <button
        onClick={() => setOpen(true)}
        className="shimmer relative inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-foreground transition"
        style={{
          background:
            "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))",
          border: "1px solid oklch(0.78 0.18 220 / 0.45)",
          boxShadow: "0 0 20px oklch(0.78 0.18 220 / 0.35), inset 0 1px 0 oklch(1 0 0 / 0.08)",
          animation: "pulse-glow 5s ease-in-out infinite",
        }}
      >
        <span
          className="grid h-7 w-7 place-items-center rounded-lg"
          style={{
            background: "linear-gradient(135deg, var(--cyan-glow), var(--electric))",
            boxShadow: "var(--shadow-glow-cyan)",
          }}
        >
          <FileText className="h-3.5 w-3.5 text-background" />
        </span>
        Generate Shift Summary
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-panel border-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Shift Summary</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <button
              onClick={goCurrent}
              className="w-full rounded-lg border border-border/40 bg-white/[0.03] p-4 text-left transition hover:border-border/70"
            >
              <div className="text-sm font-medium text-foreground">Use Current Shift</div>
              <div className="mt-1 text-xs text-muted-foreground">{win}</div>
            </button>
            <button
              onClick={goCustom}
              className="w-full rounded-lg border border-border/40 bg-white/[0.03] p-4 text-left transition hover:border-border/70"
            >
              <div className="text-sm font-medium text-foreground">
                Choose Custom Date / Time Range
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Pick a custom date/time window.
              </div>
            </button>

            {ai.enabled && (
              <div className="rounded-lg border border-border/40 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">Draft narrative with AI</div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={draftWithAI}
                    disabled={aiBusy}
                  >
                    {aiBusy ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles
                        className="mr-1 h-3.5 w-3.5"
                        style={{ color: "var(--cyan-glow)" }}
                      />
                    )}
                    {aiDraft ? "Redraft" : "Draft"}
                  </Button>
                </div>
                {aiDraft && (
                  <div className="mt-2 space-y-1">
                    <RichTextEditor
                      value={aiDraft}
                      onChange={setAiDraft}
                      minHeight={176}
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => {
                        navigator.clipboard.writeText(aiDraft);
                        toast.success("Copied.");
                      }}
                    >
                      <ClipboardCopy className="mr-1 h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                )}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Draft only — review before sending. Recorded in the Audit Log.
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
