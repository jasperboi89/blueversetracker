import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Braces,
  Calculator,
  Check,
  Copy,
  Heart,
  ListTree,
  Loader2,
  Paperclip,
  Pin,
  Plus,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { htmlToPlainText } from "@/lib/rich-text";
import {
  createIsScriptEntry,
  deleteIsScriptEntry,
  listIsScriptEntries,
  updateIsScriptEntry,
  type IsScriptAttachment,
  type IsScriptEntry,
  type IsScriptKind,
} from "@/lib/is-scripts/is-scripts.functions";

export const KIND_META: Array<{
  value: IsScriptKind;
  label: string;
  icon: typeof Terminal;
  color: string;
}> = [
  { value: "prompt", label: "Prompt", icon: Sparkles, color: "oklch(0.78 0.15 300)" },
  { value: "tree-help", label: "Tree help", icon: ListTree, color: "oklch(0.78 0.15 165)" },
  { value: "calculation", label: "Calculation", icon: Calculator, color: "oklch(0.8 0.15 85)" },
  { value: "snippet", label: "Snippet", icon: Braces, color: "oklch(0.78 0.14 235)" },
  { value: "other", label: "Other", icon: Terminal, color: "oklch(0.75 0.05 260)" },
];

function kindMeta(kind: IsScriptKind) {
  return KIND_META.find((item) => item.value === kind) ?? KIND_META[4];
}

type SortMode = "updated" | "title" | "kind";

export function IsScriptEntriesPane({
  seed,
  onSeedConsumed,
}: {
  seed?: { title: string; usageHtml: string } | null;
  onSeedConsumed?: () => void;
}) {
  const [entries, setEntries] = useState<IsScriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<IsScriptKind | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [draft, setDraft] = useState<IsScriptEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listIsScriptEntries();
      setEntries(result.entries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load IS script entries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  useEffect(() => {
    setDraft(selected ? { ...selected } : null);
  }, [selected]);

  const createEntry = useCallback(
    async (preset?: { title?: string; usageHtml?: string; kind?: IsScriptKind }) => {
      setCreating(true);
      try {
        const entry = await createIsScriptEntry({
          data: {
            kind: preset?.kind ?? (kindFilter === "all" ? "prompt" : kindFilter),
            title: preset?.title ?? "Untitled entry",
            usageHtml: preset?.usageHtml ?? "",
          },
        });
        setEntries((current) => [entry, ...current]);
        setSelectedId(entry.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create the entry.");
      } finally {
        setCreating(false);
      }
    },
    [kindFilter],
  );

  useEffect(() => {
    if (!seed) return;
    void createEntry({ title: seed.title, usageHtml: seed.usageHtml });
    onSeedConsumed?.();
  }, [seed, createEntry, onSeedConsumed]);

  const dirty = useMemo(() => {
    if (!draft || !selected) return false;
    return (
      draft.title !== selected.title ||
      draft.kind !== selected.kind ||
      draft.scriptBody !== selected.scriptBody ||
      draft.usageHtml !== selected.usageHtml ||
      draft.reasonHtml !== selected.reasonHtml ||
      draft.exampleHtml !== selected.exampleHtml ||
      draft.tags.join(",") !== selected.tags.join(",") ||
      JSON.stringify(draft.attachments) !== JSON.stringify(selected.attachments)
    );
  }, [draft, selected]);

  const persist = useCallback(
    async (next: IsScriptEntry) => {
      setSaving(true);
      try {
        const saved = await updateIsScriptEntry({
          data: {
            id: next.id,
            kind: next.kind,
            title: next.title.trim() || "Untitled entry",
            scriptBody: next.scriptBody,
            usageHtml: next.usageHtml,
            reasonHtml: next.reasonHtml,
            exampleHtml: next.exampleHtml,
            tags: next.tags,
            attachments: next.attachments,
          },
        });
        setEntries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setSavedAt(Date.now());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the entry.");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  // Autosave shortly after edits settle.
  useEffect(() => {
    if (!draft || !dirty) return;
    const timer = window.setTimeout(() => void persist(draft), 900);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, persist]);

  const toggleFlag = async (entry: IsScriptEntry, key: "isPinned" | "isFavorite") => {
    try {
      const saved = await updateIsScriptEntry({
        data: { id: entry.id, [key]: !entry[key] },
      });
      setEntries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the entry.");
    }
  };

  const removeEntry = async (entry: IsScriptEntry) => {
    if (!window.confirm(`Delete “${entry.title}”? This cannot be undone.`)) return;
    try {
      await deleteIsScriptEntry({ data: { id: entry.id } });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (selectedId === entry.id) setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the entry.");
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entries
      .filter((entry) => !entry.isArchived)
      .filter((entry) => kindFilter === "all" || entry.kind === kindFilter)
      .filter((entry) => {
        if (!needle) return true;
        return [
          entry.title,
          entry.scriptBody,
          htmlToPlainText(entry.usageHtml),
          htmlToPlainText(entry.reasonHtml),
          entry.tags.join(" "),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        switch (sortMode) {
          case "title":
            return a.title.localeCompare(b.title);
          case "kind":
            return a.kind.localeCompare(b.kind) || b.updatedAt.localeCompare(a.updatedAt);
          default:
            return b.updatedAt.localeCompare(a.updatedAt);
        }
      });
  }, [entries, kindFilter, query, sortMode]);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!draft || !files) return;
    const list = Array.from(files).slice(0, 10);
    const added: IsScriptAttachment[] = [];
    for (const file of list) {
      if (file.size > 5_000_000) {
        toast.error(`${file.name} is larger than 5 MB.`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the file."));
        reader.readAsDataURL(file);
      });
      added.push({
        id: crypto.randomUUID(),
        name: file.name || "snip.png",
        mimeType: file.type || "application/octet-stream",
        isImage: (file.type || "").startsWith("image/"),
        dataUrl,
        sizeBytes: file.size,
        createdAt: new Date().toISOString(),
      });
    }
    if (added.length) {
      setDraft((current) =>
        current ? { ...current, attachments: [...current.attachments, ...added] } : current,
      );
    }
  };

  if (loading) {
    return (
      <div className="glass-panel flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel p-8 text-center">
        <p className="text-sm text-rose-200">{error}</p>
        <Button className="mt-4" variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="grid min-h-[640px] gap-3 xl:h-[calc(100vh-16rem)] xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="glass-panel flex min-h-0 flex-col overflow-hidden p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search scripts, usage, tags…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Button
            size="sm"
            className="h-9"
            disabled={creating}
            onClick={() => void createEntry()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          <FilterChip
            label={`All (${entries.filter((e) => !e.isArchived).length})`}
            active={kindFilter === "all"}
            onClick={() => setKindFilter("all")}
          />
          {KIND_META.map((item) => {
            const count = entries.filter((e) => !e.isArchived && e.kind === item.value).length;
            return (
              <FilterChip
                key={item.value}
                label={`${item.label} (${count})`}
                color={item.color}
                active={kindFilter === item.value}
                onClick={() => setKindFilter(item.value)}
              />
            );
          })}
        </div>

        <div className="mt-2">
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Recently updated</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
              <SelectItem value="kind">Kind</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="mt-3 min-h-0 flex-1 pr-1">
          <div className="space-y-1.5">
            {visible.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                No entries yet. Create your first IS script entry.
              </p>
            )}
            {visible.map((entry) => {
              const meta = kindMeta(entry.kind);
              const Icon = meta.icon;
              return (
                <button
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={cn(
                    "w-full rounded-xl border border-white/8 bg-white/[0.02] p-2.5 text-left transition hover:border-cyan-300/25 hover:bg-white/[0.05]",
                    selectedId === entry.id && "border-cyan-300/40 bg-cyan-300/[0.07]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
                    <span className="truncate text-sm font-medium text-foreground">
                      {entry.title}
                    </span>
                    {entry.isPinned && <Pin className="ml-auto h-3 w-3 text-cyan-200" />}
                  </div>
                  <p className="mt-1 line-clamp-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                    {entry.scriptBody || htmlToPlainText(entry.usageHtml) || "Empty entry"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                    <span>{meta.label}</span>
                    <span>·</span>
                    <span>
                      {formatDistanceToNow(new Date(entry.updatedAt), { addSuffix: true })}
                    </span>
                    {entry.attachments.length > 0 && (
                      <span className="ml-auto flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {entry.attachments.length}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      <section className="glass-panel flex min-h-0 flex-col overflow-hidden p-4">
        {!draft ? (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <Terminal className="mx-auto h-9 w-9 text-cyan-200/60" />
              <p className="mt-3 text-sm text-muted-foreground">
                Pick an entry, or create one for a prompt, tree help, or calculation.
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 pr-2">
            <div className="flex items-center gap-2">
              <Input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, title: event.target.value } : current))
                }
                className="h-10 border-white/10 bg-transparent text-lg font-semibold"
                placeholder="Entry title"
              />
              <Select
                value={draft.kind}
                onValueChange={(value) =>
                  setDraft((current) => (current ? { ...current, kind: value as IsScriptKind } : current))
                }
              >
                <SelectTrigger className="h-10 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_META.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => void toggleFlag(draft, "isPinned")}
              >
                <Pin className={cn("h-4 w-4", draft.isPinned && "text-cyan-200")} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => void toggleFlag(draft, "isFavorite")}
              >
                <Heart className={cn("h-4 w-4", draft.isFavorite && "text-rose-300")} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-rose-300"
                onClick={() => void removeEntry(draft)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-1 flex h-5 items-center gap-2 text-[10px] text-muted-foreground">
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </>
              ) : dirty ? (
                "Unsaved changes"
              ) : savedAt ? (
                <>
                  <Check className="h-3 w-3 text-emerald-300" /> Saved
                </>
              ) : null}
            </div>

            <FieldLabel>Script</FieldLabel>
            <div className="relative">
              <Textarea
                value={draft.scriptBody}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, scriptBody: event.target.value } : current,
                  )
                }
                spellCheck={false}
                placeholder="Paste the prompt, tree help text, or calculation here…"
                className="min-h-[220px] whitespace-pre font-mono text-[12.5px] leading-relaxed"
              />
              <Button
                variant="secondary"
                size="sm"
                className="absolute right-2 top-2 h-7 px-2 text-[11px]"
                onClick={() => {
                  void navigator.clipboard.writeText(draft.scriptBody);
                  toast.success("Script copied");
                }}
              >
                <Copy className="mr-1.5 h-3 w-3" /> Copy script
              </Button>
            </div>

            <FieldLabel>What it&apos;s used for and where</FieldLabel>
            <RichTextEditor
              value={draft.usageHtml}
              onChange={(html) =>
                setDraft((current) => (current ? { ...current, usageHtml: html } : current))
              }
              minHeight={90}
              placeholder="The screen, tree, report, or client area this applies to…"
            />

            <FieldLabel>Why we use it</FieldLabel>
            <RichTextEditor
              value={draft.reasonHtml}
              onChange={(html) =>
                setDraft((current) => (current ? { ...current, reasonHtml: html } : current))
              }
              minHeight={90}
              placeholder="The problem it solves and the reasoning behind it…"
            />

            <FieldLabel>Example values / expected result</FieldLabel>
            <RichTextEditor
              value={draft.exampleHtml}
              onChange={(html) =>
                setDraft((current) => (current ? { ...current, exampleHtml: html } : current))
              }
              minHeight={80}
              placeholder="Optional — sample input and what you should get back."
            />

            <FieldLabel>Tags</FieldLabel>
            <Input
              value={draft.tags.join(", ")}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        tags: event.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean)
                          .slice(0, 12),
                      }
                    : current,
                )
              }
              placeholder="billing, statement tree, hcfa"
              className="h-9 text-sm"
            />

            <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" /> Attachments
                  <span className="font-mono text-[10px]">{draft.attachments.length}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>
              {draft.attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Upload or paste snips that go with this script.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {draft.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="group relative w-28 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
                    >
                      {attachment.isImage ? (
                        <img
                          src={attachment.dataUrl}
                          alt={attachment.label || attachment.name}
                          className="h-20 w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-20 place-items-center text-[10px] text-muted-foreground">
                          File
                        </div>
                      )}
                      <div className="truncate px-1.5 py-1 text-[10px]">{attachment.name}</div>
                      <button
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 opacity-0 transition group-hover:opacity-100"
                        onClick={() =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  attachments: current.attachments.filter(
                                    (item) => item.id !== attachment.id,
                                  ),
                                }
                              : current,
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </section>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border border-white/10 px-2 py-0.5 text-[10.5px] text-muted-foreground transition hover:border-cyan-300/30 hover:text-foreground",
        active && "border-cyan-300/45 bg-cyan-300/10 text-foreground",
      )}
      style={active && color ? { borderColor: color, color } : undefined}
    >
      {label}
    </button>
  );
}
