import { Loader2, Sparkles, X, Copy, AlertTriangle, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ManualExplanation } from "@/lib/is-scripts/manuals.functions";

/**
 * Side panel that shows the AI's plain-language read of manual passages and,
 * visually, how to fold them into an IS script.
 */
export function ManualExplainPanel({
  title,
  loading,
  error,
  explanation,
  onClose,
  onSaveAsEntry,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  explanation: ManualExplanation | null;
  onClose: () => void;
  onSaveAsEntry?: (explanation: ManualExplanation) => void;
}) {
  return (
    <aside className="glass-panel flex min-h-0 w-full flex-col overflow-hidden p-3 xl:w-[360px]">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-3.5 w-3.5 text-violet-200" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Script guidance
        </span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">{title}</p>

      <ScrollArea className="mt-3 min-h-0 flex-1 pr-2">
        {loading && (
          <div className="grid place-items-center py-12 text-center text-xs text-muted-foreground">
            <Loader2 className="mb-2 h-5 w-5 animate-spin text-violet-200" />
            Reading the manual pages…
          </div>
        )}

        {!loading && error && (
          <p className="rounded-lg border border-rose-400/25 bg-rose-400/5 p-3 text-xs text-rose-100">
            {error}
          </p>
        )}

        {!loading && explanation && (
          <div className="space-y-3">
            <section className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                In plain language
              </h4>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/90">
                {explanation.summary || "No summary returned."}
              </p>
            </section>

            {explanation.steps.length > 0 && (
              <section className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-3">
                <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  <ListOrdered className="h-3.5 w-3.5" /> Add it to your script
                </h4>
                <ol className="mt-2 space-y-2">
                  {explanation.steps.map((step, index) => (
                    <li key={index} className="flex gap-2 text-[12.5px] leading-relaxed">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-cyan-300/30 text-[10px] text-cyan-100">
                        {index + 1}
                      </span>
                      <span className="text-foreground/90">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {explanation.snippet && (
              <section className="rounded-xl border border-white/8 bg-black/30 p-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Script snippet
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2 text-[10px]"
                    onClick={() => {
                      void navigator.clipboard.writeText(explanation.snippet);
                      toast.success("Snippet copied.");
                    }}
                  >
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </Button>
                </div>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-emerald-100/90">
                  {explanation.snippet}
                </pre>
              </section>
            )}

            {explanation.cautions.length > 0 && (
              <section className="rounded-xl border border-amber-300/25 bg-amber-300/[0.04] p-3">
                <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                  <AlertTriangle className="h-3.5 w-3.5" /> Watch out for
                </h4>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] text-foreground/90">
                  {explanation.cautions.map((caution, index) => (
                    <li key={index}>{caution}</li>
                  ))}
                </ul>
              </section>
            )}

            {explanation.sources.length > 0 && (
              <p className="px-1 text-[10.5px] text-muted-foreground">
                Sources: {explanation.sources.join(" · ")}
              </p>
            )}

            {onSaveAsEntry && (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => onSaveAsEntry(explanation)}
              >
                Save as script entry
              </Button>
            )}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
