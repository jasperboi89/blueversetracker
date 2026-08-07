import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SUBJECT_STARTERS, useRecentSubjects } from "@/lib/settings/subject-presets-store";
import { aiSuggestSubject } from "@/lib/ai/ai.functions";

/**
 * Starter chips, recent subjects and an AI suggestion for a work subject line —
 * so documenting a new item never starts from a blank box.
 */
export function SubjectBuilder({
  value,
  onChange,
  accountNumber,
  accountName,
  describeText,
}: {
  value: string;
  onChange: (v: string) => void;
  accountNumber?: string;
  accountName?: string;
  /** Plain text used by "Suggest subject". */
  describeText?: string;
}) {
  const recents = useRecentSubjects(accountNumber);
  const [busy, setBusy] = useState(false);

  const suggest = async () => {
    const raw = (describeText ?? "").trim();
    if (!raw) {
      toast.error("Add a description first so AI has something to work with.");
      return;
    }
    setBusy(true);
    try {
      const res = await aiSuggestSubject({ data: { text: raw, accountName: accountName || undefined } });
      if (res.ok && res.subject) onChange(res.subject);
      else toast.error(("error" in res && res.error) || "Could not suggest a subject.");
    } catch {
      toast.error("Could not suggest a subject.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {SUBJECT_STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(value.startsWith(s) ? value : s + value.replace(/^.*?— /, ""))}
            className="rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            {s.replace(/[—\s]+$/, "")}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={suggest}
          className="inline-flex items-center gap-1 rounded-full border border-border/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" /> {busy ? "Thinking…" : "Suggest subject"}
        </button>
      </div>
      {recents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent</span>
          {recents.map((r) => (
            <button
              key={`${r.subject}-${r.usedAt}`}
              type="button"
              onClick={() => onChange(r.subject)}
              className="max-w-[220px] truncate rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {r.subject}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}