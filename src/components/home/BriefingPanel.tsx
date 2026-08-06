import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, Sunrise, Sunset, CalendarRange, ClipboardCopy, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aiBriefing } from "@/lib/ai/ai.functions";
import { aiStyleHint, useAISettings } from "@/lib/settings/ai-settings-store";
import { useInsights } from "@/lib/ai/awareness";

type Kind = "shift-start" | "shift-end" | "weekly-digest";

const KINDS: Array<{ kind: Kind; label: string; icon: typeof Sunrise; blurb: string }> = [
  { kind: "shift-start", label: "Shift briefing", icon: Sunrise, blurb: "Where to start tonight" },
  { kind: "shift-end", label: "Handoff note", icon: Sunset, blurb: "Copy-ready for next operator" },
  { kind: "weekly-digest", label: "Weekly patterns", icon: CalendarRange, blurb: "Recurring account issues" },
];

/** Proactive AI briefings — the model pulls live Hub data through its tools. */
export function BriefingPanel() {
  const ai = useAISettings();
  const insights = useInsights();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [active, setActive] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const [tools, setTools] = useState<string[]>([]);

  const run = async (kind: Kind) => {
    if (busy) return;
    setBusy(kind);
    setActive(kind);
    setText("");
    setTools([]);
    const res = await aiBriefing({
      data: {
        kind,
        signals: insights.map((i) => `- ${i.text}`).join("\n") || undefined,
        style: aiStyleHint(ai),
        nowIso: new Date().toISOString(),
      },
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error ?? "Briefing failed.");
      return;
    }
    setText(res.text ?? "");
    setTools(Array.from(new Set((res.toolsUsed ?? []).map((t) => t.name))));
  };

  if (!ai.enabled) return null;

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">AI briefings</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => void run(k.kind)}
              disabled={busy !== null}
              title={k.blurb}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition disabled:opacity-60 ${
                active === k.kind
                  ? "border-border/70 bg-white/[0.06] text-foreground"
                  : "border-border/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {busy === k.kind ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <k.icon className="h-3 w-3" />
              )}
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {busy && (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your Hub…
        </div>
      )}

      {!busy && text && (
        <div className="mt-3 space-y-2">
          {tools.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
              <Wrench className="h-3 w-3" /> {tools.join(", ")}
            </div>
          )}
          <div className="copilot-markdown rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm text-foreground/90">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(text);
                toast.success("Briefing copied.");
              }}
            >
              <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}