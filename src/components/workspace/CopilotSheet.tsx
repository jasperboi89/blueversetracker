import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import {
  Loader2,
  Send,
  Sparkles,
  ShieldOff,
  Compass,
  ArrowUpRight,
  Wrench,
  Plus,
  MessageSquare,
  Trash2,
  Check,
  X,
  Square,
  UserCog,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aiFocus, aiOperatorProfile } from "@/lib/ai/ai.functions";
import { aiStyleHint, useAISettings } from "@/lib/settings/ai-settings-store";
import { ticketsStore, isOverdue, STATUS_LABEL } from "@/lib/tickets-store";
import { accountsStore } from "@/lib/accounts-store";
import { nightPlanStore } from "@/lib/night-plan-store";
import { activitySummary } from "@/lib/workspace/activity-store";
import { htmlToPlainText } from "@/lib/rich-text";
import { useInsights, type InsightSeverity } from "@/lib/ai/awareness";
import { streamCopilot, TOOL_LABEL } from "@/lib/ai/copilot-stream";
import { copilotThreads, useCopilotThreads } from "@/lib/ai/copilot-threads-store";
import { describeAction, toProposedAction } from "@/lib/ai/copilot-actions";
import { executeAction } from "@/lib/core/action-executor";
import type { AnyProposedAction } from "@/lib/core/actions";

export const COPILOT_OPEN_EVENT = "intel-copilot:open";
export function openCopilot() {
  window.dispatchEvent(new CustomEvent(COPILOT_OPEN_EVENT));
}

/** Compact, bounded snapshot of local Hub data for the focus prompt. */
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

const SEVERITY_TONE: Record<InsightSeverity, string> = {
  high: "oklch(0.82 0.18 25)",
  warn: "oklch(0.85 0.16 85)",
  info: "var(--cyan-glow)",
};

/** Page-aware suggestions: what you can ask changes with where you are. */
function suggestionsFor(path: string): string[] {
  if (path.startsWith("/freshdesk-tickets"))
    return [
      "What's overdue right now?",
      "Any past tickets like this one?",
      "Classify my open tickets",
    ];
  if (path.startsWith("/accounts"))
    return ["What keeps breaking for this account?", "Show this account's ticket history"];
  if (path.startsWith("/contact-dispatch"))
    return ["Which dispatches are still open?", "Summarize tonight's dispatch results"];
  return [
    "What's overdue right now?",
    "Summarize my shift so far",
    "What should I work next?",
    "Add my top 3 to the night plan",
  ];
}

function pageLabel(path: string): string {
  const seg = path.split("/").filter(Boolean);
  if (seg.length === 0) return "the home deck";
  return `the ${seg.join(" / ").replace(/\$?[0-9a-z-]{12,}/g, "detail")} page`;
}

export function CopilotSheet() {
  const ai = useAISettings();
  const navigate = useNavigate();
  const insights = useInsights();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const threadState = useCopilotThreads();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [proposals, setProposals] = useState<AnyProposedAction[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [showThreads, setShowThreads] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => threadState.threads.find((t) => t.id === threadState.activeId) ?? null,
    [threadState],
  );
  const turns = active?.messages ?? [];

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(COPILOT_OPEN_EVENT, handler);
    return () => window.removeEventListener(COPILOT_OPEN_EVENT, handler);
  }, []);

  const focusInput = useCallback(() => {
    setTimeout(() => {
      const el = inputRef.current?.querySelector<HTMLElement>('[contenteditable="true"]');
      el?.focus();
    }, 60);
  }, []);

  useEffect(() => {
    if (open) {
      copilotThreads.ensureActive();
      focusInput();
    }
  }, [open, focusInput]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy, liveText, activity]);

  /** Streamed multi-turn ask against the tool-using Copilot route. */
  const ask = async (raw: string) => {
    const query = htmlToPlainText(raw).trim();
    if (!query || busy) return;
    const thread = copilotThreads.ensureActive();
    copilotThreads.append(thread.id, { role: "user", content: query, at: Date.now() });
    setQuestion("");
    setBusy(true);
    setLiveText("");
    setActivity([]);
    setProposals([]);

    const controller = new AbortController();
    abortRef.current = controller;
    const history = [
      ...(copilotThreads.get().threads.find((t) => t.id === thread.id)?.messages ?? []),
    ]
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));

    const used: string[] = [];
    const res = await streamCopilot(
      {
        messages: history,
        signals: insights.map((i) => `- ${i.text}`).join("\n") || undefined,
        style: aiStyleHint(ai),
        pageContext: pageLabel(path),
        profile: threadState.profile || undefined,
      },
      {
        onDelta: (t) => setLiveText((prev) => prev + t),
        onToolStart: (name) => {
          used.push(name);
          setLiveText("");
          setActivity((prev) => [...prev, TOOL_LABEL[name] ?? name]);
        },
        onProposal: (action) => {
          const typed = toProposedAction(action);
          if (typed) setProposals((prev) => [...prev, typed]);
        },
      },
      controller.signal,
    );

    abortRef.current = null;
    setBusy(false);
    setLiveText("");
    setActivity([]);
    if (!res.ok) {
      toast.error(res.error ?? "Copilot failed.");
      return;
    }
    copilotThreads.append(thread.id, {
      role: "assistant",
      content: res.text ?? "",
      tools: Array.from(new Set((res.toolsUsed ?? []).map((t) => t.name))),
      at: Date.now(),
    });
    focusInput();
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setLiveText("");
    setActivity([]);
  };

  const askFocus = async () => {
    if (busy) return;
    const thread = copilotThreads.ensureActive();
    setBusy(true);
    const res = await aiFocus({
      data: {
        activity: activitySummary(),
        snapshot: buildHubSnapshot(),
        insights: insights.map((i) => `- ${i.text}`).join("\n"),
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Copilot failed.");
      return;
    }
    copilotThreads.append(thread.id, {
      role: "user",
      content: "What should I focus on?",
      at: Date.now(),
    });
    copilotThreads.append(thread.id, {
      role: "assistant",
      content: res.text ?? "",
      at: Date.now(),
    });
  };

  const refreshProfile = async () => {
    if (profileBusy) return;
    setProfileBusy(true);
    const res = await aiOperatorProfile({ data: {} });
    setProfileBusy(false);
    if (!res.ok || !res.text) {
      toast.error(res.error ?? "Couldn't build your profile.");
      return;
    }
    copilotThreads.setProfile(res.text);
    toast.success("Operator profile updated — answers will be more personal.");
  };

  /**
   * Apply routes through the Safe Action Executor: validate → server-side
   * idempotency claim → execute → durable ledger record. Failures keep the
   * proposal on screen so it can be retried safely.
   */
  const confirm = async (action: AnyProposedAction) => {
    if (applying) return;
    setApplying(action.id);
    const out = await executeAction(action, { confirmed: true });
    setApplying(null);
    if (out.status === "success" || out.status === "duplicate") {
      setProposals((prev) => prev.filter((p) => p.id !== action.id));
      setFailures((prev) => {
        const next = { ...prev };
        delete next[action.id];
        return next;
      });
      if (out.status === "duplicate") toast.info(out.message ?? "Already applied.");
      else toast.success(out.message ?? "Applied.");
      return;
    }
    setFailures((prev) => ({ ...prev, [action.id]: out.message ?? "That action failed." }));
    toast.error(out.message ?? "That action failed.");
  };

  const jump = (to?: string, params?: Record<string, string>) => {
    if (!to) return;
    setOpen(false);
    navigate({ to: to as never, params: (params ?? {}) as never });
  };

  const suggestions = suggestionsFor(path);

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
            <span className="ml-auto flex items-center gap-2 text-[11px] font-normal">
              <button
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => setShowThreads((v) => !v)}
                title="Saved chats"
              >
                <MessageSquare className="h-3 w-3" /> Chats
              </button>
              <button
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  copilotThreads.newThread();
                  setProposals([]);
                  focusInput();
                }}
              >
                <Plus className="h-3 w-3" /> New
              </button>
            </span>
          </SheetTitle>
          <SheetDescription>
            Ask follow-ups — Copilot looks up your tickets, accounts, night plan, dispatches and
            work time itself, and can propose changes you confirm. Chats are saved to your account.
          </SheetDescription>
        </SheetHeader>

        {showThreads && (
          <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-border/30 bg-white/[0.02] p-2">
            {threadState.threads.length === 0 && (
              <div className="text-xs text-muted-foreground">No saved chats yet.</div>
            )}
            {threadState.threads.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
                  t.id === threadState.activeId ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                }`}
              >
                <button
                  className="flex-1 truncate text-left text-foreground/90"
                  onClick={() => {
                    copilotThreads.select(t.id);
                    setShowThreads(false);
                    setProposals([]);
                  }}
                >
                  {t.title}
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => copilotThreads.remove(t.id)}
                  title="Delete chat"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {insights.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Awareness
              </span>
              {ai.enabled && (
                <button
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => void askFocus()}
                >
                  <Compass className="h-3 w-3" /> What should I focus on?
                </button>
              )}
            </div>
            {insights.map((i) => (
              <button
                key={i.id}
                onClick={() => jump(i.to, i.params)}
                disabled={!i.to}
                className="flex w-full items-start gap-2 rounded-md border border-border/30 bg-white/[0.02] p-2 text-left text-xs text-foreground/90 disabled:cursor-default hover:bg-white/[0.04]"
              >
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: SEVERITY_TONE[i.severity] }}
                />
                <span className="flex-1">{i.text}</span>
                {i.to && <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
              </button>
            ))}
          </div>
        )}

        {!ai.enabled ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldOff className="h-4 w-4" /> AI is turned off.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="rounded-full border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => void ask(s)}
                >
                  {s}
                </button>
              ))}
              <button
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => void refreshProfile()}
                title="Rebuild the operator profile the Copilot keeps about your work"
              >
                {profileBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <UserCog className="h-3 w-3" />
                )}
                {threadState.profile ? "Refresh profile" : "Learn my patterns"}
              </button>
            </div>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-2 overflow-auto rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm"
            >
              {turns.length === 0 && !busy && (
                <div className="text-muted-foreground">
                  Ask a question or tap a suggestion to get started.
                </div>
              )}
              {turns.map((t, i) =>
                t.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg border border-border/40 bg-white/[0.05] px-2.5 py-1.5 text-foreground/90">
                      {t.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="space-y-1">
                    {t.tools && t.tools.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
                        <Wrench className="h-3 w-3" />{" "}
                        {t.tools.map((n) => TOOL_LABEL[n] ?? n).join(", ")}
                      </div>
                    )}
                    <div className="copilot-markdown text-foreground/90">
                      <ReactMarkdown>{t.content}</ReactMarkdown>
                    </div>
                  </div>
                ),
              )}

              {busy && (
                <div className="space-y-1">
                  {activity.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80"
                    >
                      <Wrench className="h-3 w-3" /> {a}
                      {i === activity.length - 1 ? "…" : ""}
                    </div>
                  ))}
                  {liveText ? (
                    <div className="copilot-markdown text-foreground/90">
                      <ReactMarkdown>{liveText}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Looking through your Hub…
                    </div>
                  )}
                </div>
              )}

              {proposals.map((p) => (
                <div
                  key={p.id}
                  className="rounded-md border border-border/50 bg-white/[0.04] p-2 text-xs"
                >
                  <div className="text-foreground/90">{describeAction(p)}</div>
                  {p.reason && <div className="mt-0.5 text-muted-foreground">{p.reason}</div>}
                  {failures[p.id] && (
                    <div className="mt-0.5 text-destructive">{failures[p.id]}</div>
                  )}
                  <div className="mt-1.5 flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      disabled={applying === p.id}
                      onClick={() => void confirm(p)}
                    >
                      {applying === p.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="mr-1 h-3 w-3" />
                      )}
                      {failures[p.id] ? "Retry" : "Apply"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setProposals((prev) => prev.filter((x) => x.id !== p.id))}
                    >
                      <X className="mr-1 h-3 w-3" /> Discard
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <RichTextEditor
                ref={inputRef}
                minHeight={72}
                value={question}
                onChange={setQuestion}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask(question);
                }}
                placeholder="Ask about tickets, accounts, your shift… (⌘/Ctrl+Enter)"
                className="text-sm"
              />
              {busy ? (
                <Button variant="secondary" onClick={stop} title="Stop">
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => void ask(question)} disabled={!question.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
