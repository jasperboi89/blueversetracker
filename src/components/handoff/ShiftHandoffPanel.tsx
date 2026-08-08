import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Check, Eye, Loader2, Plus, Send, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { cn } from "@/lib/utils";
import { formatCentralLong, getShiftKey } from "@/lib/shift";
import { useTickets } from "@/lib/tickets-store";
import { useAdditionalWork } from "@/lib/additional-work-store";
import {
  deleteShiftHandoff,
  listShiftHandoffs,
  saveShiftHandoff,
  type HandoffItem,
  type ShiftHandoff,
} from "@/lib/handoff/handoff.functions";

function newItem(label: string, source = "", detail = ""): HandoffItem {
  return { id: `hi-${Math.random().toString(36).slice(2, 9)}`, label, detail, source, done: false };
}

/**
 * Structured shift handoff: what the next shift needs to know, plus the
 * "inherited" view of the previous published handoff.
 */
export function ShiftHandoffPanel() {
  const shiftKey = getShiftKey();
  const qc = useQueryClient();
  const list = useServerFn(listShiftHandoffs);
  const save = useServerFn(saveShiftHandoff);
  const remove = useServerFn(deleteShiftHandoff);
  const tickets = useTickets();
  const work = useAdditionalWork();

  const query = useQuery({
    queryKey: ["shift-handoffs"],
    queryFn: () => list({ data: { limit: 20 } }),
  });

  const handoffs = query.data?.handoffs ?? [];
  const current = useMemo(
    () => handoffs.find((h) => h.shiftKey === shiftKey) ?? null,
    [handoffs, shiftKey],
  );
  const inherited = useMemo(
    () => handoffs.find((h) => h.shiftKey !== shiftKey && h.status === "published") ?? null,
    [handoffs, shiftKey],
  );

  const [summary, setSummary] = useState("");
  const [escalations, setEscalations] = useState("");
  const [items, setItems] = useState<HandoffItem[]>([]);
  const [watch, setWatch] = useState<HandoffItem[]>([]);
  const [draftWatch, setDraftWatch] = useState("");
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    if (query.isLoading) return;
    if (hydratedFor === shiftKey) return;
    setSummary(current?.summary ?? "");
    setEscalations(current?.escalations ?? "");
    setItems(current?.openItems ?? []);
    setWatch(current?.watchItems ?? []);
    setHydratedFor(shiftKey);
  }, [current, hydratedFor, query.isLoading, shiftKey]);

  const mutation = useMutation({
    mutationFn: (status: "draft" | "published") =>
      save({
        data: {
          shiftKey,
          summary,
          escalations,
          openItems: items,
          watchItems: watch,
          notes: "",
          status,
        },
      }),
    onSuccess: (_res, status) => {
      void qc.invalidateQueries({ queryKey: ["shift-handoffs"] });
      toast.success(status === "published" ? "Handoff published." : "Handoff saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletion = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["shift-handoffs"] });
      setHydratedFor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pullOpenWork() {
    const seeded: HandoffItem[] = [];
    for (const t of tickets) {
      if (t.status === "completed") continue;
      seeded.push(
        newItem(
          `#${t.number} — ${t.accountName || t.accountNumber || "Unknown account"}`,
          `ticket · ${t.status}`,
        ),
      );
    }
    for (const w of work) {
      if (w.status !== "working") continue;
      seeded.push(newItem(w.title || "Untitled work", "additional work", w.whatNeedsDone ?? ""));
    }
    if (!seeded.length) {
      toast.info("Nothing open to carry over.");
      return;
    }
    setItems((cur) => {
      const existing = new Set(cur.map((i) => i.label));
      return [...cur, ...seeded.filter((s) => !existing.has(s.label))];
    });
    toast.success(`Pulled ${seeded.length} open item${seeded.length === 1 ? "" : "s"}.`);
  }

  return (
    <div className="space-y-4">
      {inherited && <InheritedCard handoff={inherited} />}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-cyan-200" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Handoff for {shiftKey}
          </h3>
          {current?.status === "published" && (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-100">
              Published
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={pullOpenWork}>
              <Wand2 className="mr-1 h-3.5 w-3.5" /> Pull open work
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-[11px]"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("draft")}
            >
              Save draft
            </Button>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("published")}
            >
              {mutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Publish
            </Button>
          </div>
        </div>

        <Field label="Shift summary">
          <RichTextEditor value={summary} onChange={setSummary} placeholder="What happened tonight…" />
        </Field>

        <Field label="Open items carried forward">
          <ItemList items={items} onChange={setItems} emptyHint="Nothing carried forward yet." />
        </Field>

        <Field label="Watch items for the next shift">
          <div className="flex gap-2">
            <Input
              value={draftWatch}
              onChange={(e) => setDraftWatch(e.target.value)}
              placeholder="e.g. Account 4421 on-call change goes live at 6am"
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && draftWatch.trim()) {
                  setWatch((cur) => [...cur, newItem(draftWatch.trim(), "watch")]);
                  setDraftWatch("");
                }
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              onClick={() => {
                if (!draftWatch.trim()) return;
                setWatch((cur) => [...cur, newItem(draftWatch.trim(), "watch")]);
                setDraftWatch("");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-2">
            <ItemList items={watch} onChange={setWatch} emptyHint="No watch items." />
          </div>
        </Field>

        <Field label="Escalations / who was contacted">
          <RichTextEditor
            value={escalations}
            onChange={setEscalations}
            placeholder="Anyone paged, any client comms sent…"
          />
        </Field>

        {current && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-rose-200 hover:text-rose-100"
            onClick={() => deletion.mutate(current.id)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete this handoff
          </Button>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function ItemList({
  items,
  onChange,
  emptyHint,
}: {
  items: HandoffItem[];
  onChange: (next: HandoffItem[]) => void;
  emptyHint: string;
}) {
  if (!items.length) {
    return <p className="text-[11px] text-muted-foreground">{emptyHint}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5"
        >
          <button
            className={cn(
              "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-white/20",
              item.done && "border-emerald-300/50 bg-emerald-300/20",
            )}
            onClick={() =>
              onChange(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
            }
          >
            {item.done && <Check className="h-3 w-3 text-emerald-100" />}
          </button>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[12px] leading-snug text-foreground/90",
                item.done && "text-muted-foreground line-through",
              )}
            >
              {item.label}
            </p>
            {item.source && (
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {item.source}
              </p>
            )}
          </div>
          <button
            className="text-muted-foreground transition hover:text-rose-200"
            onClick={() => onChange(items.filter((i) => i.id !== item.id))}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function InheritedCard({ handoff }: { handoff: ShiftHandoff }) {
  const [open, setOpen] = useState(true);
  const carried = handoff.openItems.filter((i) => !i.done);
  return (
    <section className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-3">
      <div className="flex items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-cyan-100" />
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
          Inherited from {handoff.shiftKey}
        </h4>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-[10px]"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"}
        </Button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {handoff.publishedAt && (
            <p className="text-[10px] text-muted-foreground">
              Published {formatCentralLong(new Date(handoff.publishedAt))}
            </p>
          )}
          {handoff.summary && (
            <div
              className="prose-invert text-[12px] leading-relaxed text-foreground/90"
              dangerouslySetInnerHTML={{ __html: handoff.summary }}
            />
          )}
          {carried.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-[12px] text-foreground/90">
              {carried.map((i) => (
                <li key={i.id}>{i.label}</li>
              ))}
            </ul>
          )}
          {handoff.watchItems.length > 0 && (
            <p className="text-[11px] text-amber-100">
              Watch: {handoff.watchItems.map((i) => i.label).join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}