import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, RotateCcw, Sparkles, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ShiftWindow } from "@/lib/reports/shift-window";
import {
  collectConciseItems,
  allItems,
  type ConciseCollection,
  type ConciseItem,
} from "@/lib/reports/concise-collect";
import {
  buildConciseHtml,
  buildConciseText,
  countSnips,
  fallbackSummary,
  summarizeItems,
  type ConciseSummary,
  type SummaryMap,
} from "@/lib/reports/concise-email";
import { progEmailStore, useProgEmail } from "@/lib/reports/programming-email-store";
import { useTickets } from "@/lib/tickets-store";
import { useDispatch } from "@/lib/dispatch-store";
import { useAdditionalWork } from "@/lib/additional-work-store";
import { aiStyleHint, useAISettings } from "@/lib/settings/ai-settings-store";
import { copyRich } from "@/lib/summary/rich-copy";

const SECTION_TITLES: Record<ConciseItem["kind"], string> = {
  freshdesk: "Freshdesk Tickets Worked",
  additional: "Additional Work Completed",
  dispatch: "Contact Dispatch",
};

export function ConciseEmailPanel({
  windows,
  draftId,
  headerLabel,
  headerTime,
}: {
  windows: ShiftWindow[];
  draftId: string | null;
  headerLabel: string;
  headerTime: string;
}) {
  useProgEmail();
  useTickets();
  useDispatch();
  useAdditionalWork();
  const ai = useAISettings();

  const draft = draftId ? progEmailStore.get(draftId) : undefined;
  const collection: ConciseCollection = useMemo(
    () => collectConciseItems(windows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windows.map((w) => `${w.start.getTime()}-${w.end.getTime()}`).join("|")],
  );
  const items = useMemo(() => allItems(collection), [collection]);
  const excluded = draft?.conciseExcluded ?? [];
  const stored = draft?.conciseSummaries ?? {};

  const [busyAll, setBusyAll] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const summaries: SummaryMap = useMemo(() => {
    const map: SummaryMap = {};
    items.forEach((i) => { map[i.key] = stored[i.key] ?? fallbackSummary(i); });
    return map;
  }, [items, stored]);

  // First open with no stored summaries: draft them automatically.
  useEffect(() => {
    if (!draftId || busyAll) return;
    if (items.length === 0) return;
    if (Object.keys(stored).length > 0) return;
    void regenerateAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, items.length]);

  const render = () => ({
    collection,
    summaries,
    excludedKeys: excluded,
    headerLabel,
    headerTime,
  });

  const text = buildConciseText(render());

  async function regenerateAll(silent = false) {
    if (!draftId || items.length === 0) return;
    setBusyAll(true);
    const res = await summarizeItems(items, {
      style: aiStyleHint(ai),
      useAI: ai.enabled !== false,
    });
    setBusyAll(false);
    progEmailStore.setConciseSummaries(draftId, { ...stored, ...res.summaries });
    if (res.error && !silent) toast.error(res.error);
    else if (!silent) toast.success(res.aiUsed ? "Summaries regenerated." : "Summaries rebuilt from your notes.");
  }

  async function regenerateOne(item: ConciseItem) {
    if (!draftId) return;
    setBusyKey(item.key);
    const res = await summarizeItems([item], {
      style: aiStyleHint(ai),
      useAI: ai.enabled !== false,
    });
    setBusyKey(null);
    progEmailStore.setConciseSummary(draftId, item.key, res.summaries[item.key]);
    if (res.error) toast.error(res.error);
  }

  function update(item: ConciseItem, patch: Partial<ConciseSummary>) {
    if (!draftId) return;
    progEmailStore.setConciseSummary(draftId, item.key, { ...summaries[item.key], ...patch });
  }

  const copyPlain = () => {
    navigator.clipboard.writeText(text.body).then(() => toast.success("Email copied."));
  };
  const copyRichEmail = async () => {
    const r = buildConciseHtml(render());
    const ok = await copyRich(r.html, text.body);
    if (!ok) { toast.error("Rich copy failed. Try Copy Plain Text."); return; }
    toast.success(
      r.imageCount || r.fileCount
        ? `Copied with ${r.imageCount} image${r.imageCount === 1 ? "" : "s"}, ${r.fileCount} file${r.fileCount === 1 ? "" : "s"}.`
        : "Copied.",
    );
  };

  const grouped: { kind: ConciseItem["kind"]; rows: ConciseItem[] }[] = [
    { kind: "freshdesk", rows: collection.freshdesk },
    { kind: "additional", rows: collection.additional },
    { kind: "dispatch", rows: collection.dispatch },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Work items ({items.length - excluded.length} included)
          </div>
          <Button size="sm" variant="ghost" onClick={() => regenerateAll()} disabled={busyAll || items.length === 0}>
            {busyAll ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
            Regenerate All
          </Button>
        </div>

        {items.length === 0 && (
          <div className="rounded-md border border-border/30 bg-white/[0.02] p-4 text-xs text-muted-foreground">
            No work was recorded in this window, so the email would be empty.
          </div>
        )}

        <div className="max-h-[620px] space-y-4 overflow-y-auto pr-1">
          {grouped.map((g) => (
            <div key={g.kind} className="space-y-2">
              <div className="text-xs font-semibold text-foreground">{SECTION_TITLES[g.kind]}</div>
              {g.rows.map((item, idx) => {
                const s = summaries[item.key];
                const off = excluded.includes(item.key);
                return (
                  <div
                    key={item.key}
                    className="rounded-md border border-border/30 bg-white/[0.02] p-3"
                    style={off ? { opacity: 0.45 } : undefined}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 text-xs font-medium text-foreground">
                        {idx + 1}) {item.title}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        title={off ? "Include in email" : "Remove from email"}
                        onClick={() => draftId && progEmailStore.toggleConciseExcluded(draftId, item.key)}
                      >
                        {off ? <Undo2 className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        title="Regenerate this summary"
                        disabled={busyKey === item.key}
                        onClick={() => regenerateOne(item)}
                      >
                        {busyKey === item.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} />
                        )}
                      </Button>
                    </div>

                    {!off && (
                      <div className="mt-2 space-y-2">
                        {item.kind === "freshdesk" && (
                          <Field label="Issue" value={s.issue} onChange={(v) => update(item, { issue: v })} />
                        )}
                        <Field
                          label={item.kind === "freshdesk" ? "Changes Made" : "Summary"}
                          value={s.changes}
                          onChange={(v) => update(item, { changes: v })}
                        />
                        <Field
                          label="Other Notes (optional — omitted when blank)"
                          value={s.notes}
                          onChange={(v) => update(item, { notes: v })}
                        />
                        {item.snips.length > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            {item.snips.length} snip{item.snips.length === 1 ? "" : "s"} attach with Rich Copy.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Preview</div>
        <pre className="max-h-[560px] min-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-input bg-background px-4 py-3 font-sans text-[14px] leading-7 text-foreground">
{text.empty ? "No qualifying work in this window." : text.body}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={copyRichEmail}
            disabled={text.empty}
            style={{ background: "linear-gradient(110deg, oklch(0.45 0.16 200 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.5)" }}
          >
            <Copy className="mr-1 h-3.5 w-3.5" />Copy Email with Snips (Rich)
          </Button>
          <Button size="sm" variant="ghost" onClick={copyPlain} disabled={text.empty}>
            <Copy className="mr-1 h-3.5 w-3.5" />Copy Plain Text
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!draftId) return;
              progEmailStore.saveVersion(draftId, "User Edited", text.body);
              toast.success("Draft saved.");
            }}
            disabled={text.empty}
          >
            Save Draft in Hub
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!draftId) return;
              progEmailStore.markSent(draftId, text.body);
              toast.success("Marked sent.");
            }}
            disabled={text.empty}
          >
            Mark Sent Manually
          </Button>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {countSnips(collection, excluded)} snip(s) available · Full details stay in the portal, Freshdesk tickets, and work records.
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="min-h-[52px] text-xs"
      />
    </div>
  );
}
