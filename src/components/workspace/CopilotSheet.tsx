import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, ShieldOff } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aiCopilot } from "@/lib/ai/ai.functions";
import { useAISettings } from "@/lib/settings/ai-settings-store";
import { ticketsStore, isOverdue, STATUS_LABEL } from "@/lib/tickets-store";
import { accountsStore } from "@/lib/accounts-store";
import { nightPlanStore } from "@/lib/night-plan-store";

export const COPILOT_OPEN_EVENT = "intel-copilot:open";
export function openCopilot() {
  window.dispatchEvent(new CustomEvent(COPILOT_OPEN_EVENT));
}

/** Compact, bounded snapshot of local Hub data for the model (no full DB dump). */
function buildHubSnapshot(): string {
  const { tickets } = ticketsStore.getState();
  const active = tickets.filter((t) => t.status !== "completed");
  const completed = tickets.filter((t) => t.status === "completed");
  const accounts = accountsStore.getState().accounts;
  const plan = nightPlanStore
    .get()
    .items.filter((i) => i.status === "todo" || i.status === "in-progress");

  const lines: string[] = [];
  lines.push(`ACTIVE TICKETS (${active.length}):`);
  for (const t of active.slice(0, 40)) {
    lines.push(
      `#${t.number} acct ${t.accountNumber || "?"} (${t.accountName || "?"}) — ${STATUS_LABEL[t.status]}${isOverdue(t) ? " [OVERDUE]" : ""}: ${t.details.subject || ""}`,
    );
  }
  lines.push(`\nRECENTLY COMPLETED (${completed.length}):`);
  for (const t of completed.slice(0, 12)) {
    lines.push(`#${t.number} acct ${t.accountNumber || "?"} — ${t.details.subject || ""}`);
  }
  lines.push(
    `\nACCOUNTS (${accounts.length}): ${accounts
      .slice(0, 25)
      .map((a) => `${a.number} ${a.name}`)
      .join("; ")}`,
  );
  lines.push(
    `\nNIGHT PLAN (open ${plan.length}): ${plan
      .slice(0, 15)
      .map((i) => `${i.task} (${i.priority})`)
      .join("; ")}`,
  );

  return lines.join("\n").slice(0, 7500);
}

const SUGGESTIONS = [
  "What's overdue right now?",
  "Summarize my shift so far",
  "Which accounts have the most open tickets?",
  "What should I work next?",
];

export function CopilotSheet() {
  const ai = useAISettings();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(COPILOT_OPEN_EVENT, handler);
    return () => window.removeEventListener(COPILOT_OPEN_EVENT, handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  const ask = async (q: string) => {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    setAnswer("");
    const res = await aiCopilot({ data: { question: query, snapshot: buildHubSnapshot() } });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Copilot failed.");
      return;
    }
    setAnswer(res.text ?? "");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="glass-panel flex w-full flex-col gap-3 border-0 sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--cyan-glow)" }} />
            Intel Copilot
          </SheetTitle>
          <SheetDescription>
            Answers from your Hub data. Every request is recorded in the Audit Log.
          </SheetDescription>
        </SheetHeader>

        {!ai.enabled ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldOff className="h-4 w-4" /> AI is turned off.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="rounded-full border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setQuestion(s);
                    void ask(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask(question);
                }}
                placeholder="Ask about tickets, accounts, your shift… (⌘/Ctrl+Enter)"
                className="text-sm"
              />
              <Button onClick={() => void ask(question)} disabled={busy || !question.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm">
              {busy && !answer ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </div>
              ) : answer ? (
                <div className="whitespace-pre-wrap text-foreground/90">{answer}</div>
              ) : (
                <div className="text-muted-foreground">
                  Ask a question or tap a suggestion to get started.
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
