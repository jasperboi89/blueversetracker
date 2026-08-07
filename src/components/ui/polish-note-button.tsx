import { useState } from "react";
import { Sparkles, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { aiPolishNote } from "@/lib/ai/ai.functions";
import { htmlToPlainText, plainTextToHtml } from "@/lib/rich-text";

/**
 * Rewrites the operator's own text in place (grammar/structure only) and keeps
 * one level of undo so a bad polish is never destructive.
 */
export function PolishNoteButton({
  value,
  onChange,
  kind = "general",
  label = "Polish",
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  kind?: "work-note" | "retest" | "dispatch" | "general";
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);

  const run = async () => {
    const plain = htmlToPlainText(value).trim();
    if (!plain) {
      toast.error("Nothing to polish yet.");
      return;
    }
    setBusy(true);
    try {
      const res = await aiPolishNote({ data: { text: plain, kind } });
      if (!res.ok || !res.text) {
        toast.error(res.ok ? "Polish returned nothing." : res.error);
        return;
      }
      setPrevious(value);
      onChange(plainTextToHtml(res.text));
      toast.success("Note polished.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Polish failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={className}>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={run}>
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
        {label}
      </Button>
      {previous !== null && !busy && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            onChange(previous);
            setPrevious(null);
          }}
        >
          <Undo2 className="mr-1 h-3.5 w-3.5" />
          Undo
        </Button>
      )}
    </span>
  );
}