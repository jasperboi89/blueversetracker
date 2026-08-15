import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  FileText,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { extractPdfPages } from "./pdf-extract";
import {
  deleteIsManual,
  explainManualPassage,
  getIsManualUrl,
  listIsManuals,
  MANUAL_CATEGORIES,
  registerIsManual,
  searchIsManuals,
  updateIsManual,
  type IsManual,
  type ManualExplanation,
  type ManualCategory,
  type ManualHit,
} from "@/lib/is-scripts/manuals.functions";
import { ManualExplainPanel } from "./ManualExplainPanel";

const CATEGORY_LABEL: Record<ManualCategory, string> = {
  supervisor: "IS Supervisor",
  directory: "IS Directory",
  other: "Other",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function snippet(text: string, query: string) {
  const index = text.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());
  if (index < 0) return text.slice(0, 240);
  const start = Math.max(0, index - 90);
  return `${start > 0 ? "…" : ""}${text.slice(start, index + 150)}…`;
}

export function IsManualsPane({
  onSaveAsEntry,
  entryContext,
}: {
  onSaveAsEntry: (seed: { title: string; usageHtml: string }) => void;
  /** Plain-text summary of the script entry currently open, if any. */
  entryContext?: string;
}) {
  const [manuals, setManuals] = useState<IsManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ManualHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; name: string; page: number } | null>(null);
  const [explain, setExplain] = useState<{
    title: string;
    loading: boolean;
    error: string | null;
    explanation: ManualExplanation | null;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listIsManuals();
      setManuals(result.manuals);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load manuals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      toast.error("You need to be signed in to upload manuals.");
      return;
    }
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error(`${file.name} is not a PDF.`);
        continue;
      }
      try {
        setUploading(`Reading ${file.name}…`);
        const pages = await extractPdfPages(file, (done, total) =>
          setUploading(`Reading ${file.name} — page ${done} of ${total}`),
        );
        setUploading(`Uploading ${file.name}…`);
        const storagePath = `${userId}/${crypto.randomUUID()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("is-manuals")
          .upload(storagePath, file, { contentType: "application/pdf" });
        if (uploadError) throw new Error(uploadError.message);
        const manual = await registerIsManual({
          data: {
            name: file.name.replace(/\.pdf$/i, ""),
            category: /supervisor/i.test(file.name)
              ? "supervisor"
              : /director/i.test(file.name)
                ? "directory"
                : "other",
            storagePath,
            sizeBytes: file.size,
            pages,
          },
        });
        setManuals((current) => [manual, ...current]);
        toast.success(`${manual.name} indexed — ${manual.pageCount} pages searchable.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not process ${file.name}.`);
      } finally {
        setUploading(null);
      }
    }
  };

  const runSearch = async () => {
    if (query.trim().length < 2) {
      setHits(null);
      return;
    }
    setSearching(true);
    try {
      const result = await searchIsManuals({ data: { query: query.trim() } });
      setHits(result.hits);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const openManual = async (manualId: string, name: string, page: number) => {
    try {
      const { url } = await getIsManualUrl({ data: { id: manualId } });
      setViewer({ url, name, page });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the manual.");
    }
  };

  const runExplain = async (passages: ManualHit[], title: string) => {
    setExplain({ title, loading: true, error: null, explanation: null });
    try {
      const result = await explainManualPassage({
        data: {
          query: query.trim() || title,
          passages: passages.slice(0, 6).map((hit) => ({
            manualName: hit.manualName,
            pageNumber: hit.pageNumber,
            text: hit.text.slice(0, 8000),
          })),
          ...(entryContext ? { entryContext: entryContext.slice(0, 4000) } : {}),
        },
      });
      if (!result.ok) {
        setExplain({ title, loading: false, error: result.error, explanation: null });
        return;
      }
      setExplain({ title, loading: false, error: null, explanation: result.explanation });
    } catch (err) {
      setExplain({
        title,
        loading: false,
        error: err instanceof Error ? err.message : "Could not explain that passage.",
        explanation: null,
      });
    }
  };

  const totalPages = useMemo(
    () => manuals.reduce((sum, manual) => sum + manual.pageCount, 0),
    [manuals],
  );

  return (
    <div
      className={cn(
        "grid min-h-[640px] gap-3 xl:h-[calc(100vh-16rem)]",
        explain ? "xl:grid-cols-[300px_minmax(0,1fr)_360px]" : "xl:grid-cols-[330px_minmax(0,1fr)]",
      )}
    >
      <aside className="glass-panel flex min-h-0 flex-col overflow-hidden p-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Manuals
          </span>
          <Button size="sm" className="h-8" onClick={() => fileRef.current?.click()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> PDF
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              void uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        <div
          className="mt-3 grid place-items-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-3 py-5 text-center text-xs text-muted-foreground"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void uploadFiles(event.dataTransfer.files);
          }}
        >
          <Upload className="mb-1.5 h-4 w-4" />
          Drop IS Supervisor / Directory PDFs here
        </div>

        {uploading && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-2.5 py-2 text-[11px] text-cyan-100">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {uploading}
          </div>
        )}

        <div className="mt-3 text-[10px] text-muted-foreground">
          {manuals.length} manuals · {totalPages} searchable pages
        </div>

        <ScrollArea className="mt-2 min-h-0 flex-1 pr-1">
          <div className="space-y-1.5">
            {loading && <Loader2 className="mx-auto mt-6 h-4 w-4 animate-spin text-cyan-200" />}
            {manuals.map((manual) => (
              <div
                key={manual.id}
                className="rounded-xl border border-white/8 bg-white/[0.02] p-2.5"
              >
                <div className="flex items-center gap-2">
                  <BookMarked className="h-3.5 w-3.5 shrink-0 text-cyan-200" />
                  <Input
                    defaultValue={manual.name}
                    className="h-7 border-transparent bg-transparent px-1 text-sm"
                    onBlur={async (event) => {
                      const name = event.target.value.trim();
                      if (!name || name === manual.name) return;
                      try {
                        const saved = await updateIsManual({ data: { id: manual.id, name } });
                        setManuals((current) =>
                          current.map((item) => (item.id === saved.id ? saved : item)),
                        );
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Rename failed.");
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0 text-rose-300"
                    onClick={async () => {
                      if (!window.confirm(`Delete “${manual.name}” and its search index?`)) return;
                      try {
                        await deleteIsManual({ data: { id: manual.id } });
                        setManuals((current) => current.filter((item) => item.id !== manual.id));
                        setHits((current) =>
                          current ? current.filter((hit) => hit.manualId !== manual.id) : current,
                        );
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Delete failed.");
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Select
                    value={manual.category}
                    onValueChange={async (value) => {
                      try {
                        const saved = await updateIsManual({
                          data: { id: manual.id, category: value as ManualCategory },
                        });
                        setManuals((current) =>
                          current.map((item) => (item.id === saved.id ? saved : item)),
                        );
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Update failed.");
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 w-36 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MANUAL_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {CATEGORY_LABEL[category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-muted-foreground">
                    {manual.pageCount} pages · {formatBytes(manual.sizeBytes)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 px-2 text-[11px]"
                  onClick={() => void openManual(manual.id, manual.name, 1)}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Open
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <section className="glass-panel flex min-h-0 flex-col overflow-hidden p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch();
              }}
              placeholder="Search every manual — e.g. “statement tree”, “A/R aging calculation”"
              className="h-10 pl-8"
            />
          </div>
          <Button className="h-10" onClick={() => void runSearch()} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
          {hits && hits.length > 0 && (
            <Button
              variant="secondary"
              className="h-10"
              onClick={() => void runExplain(hits.slice(0, 4), `“${query.trim()}” — top results`)}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Explain results
            </Button>
          )}
        </div>

        <ScrollArea className="mt-3 min-h-0 flex-1 pr-2">
          {hits === null ? (
            <div className="grid h-full place-items-center py-16 text-center">
              <div>
                <BookMarked className="mx-auto h-9 w-9 text-cyan-200/60" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Upload the IS Supervisor and Directory manuals, then search them by page.
                </p>
              </div>
            </div>
          ) : hits.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No pages matched “{query}”.
            </p>
          ) : (
            <div className="space-y-2">
              {hits.map((hit) => (
                <div
                  key={`${hit.manualId}-${hit.pageNumber}`}
                  className="rounded-xl border border-white/8 bg-white/[0.02] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-cyan-100">{hit.manualName}</span>
                    <span>·</span>
                    <span>{CATEGORY_LABEL[hit.category]}</span>
                    <span>·</span>
                    <span>Page {hit.pageNumber}</span>
                    <div className="ml-auto flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          void openManual(hit.manualId, hit.manualName, hit.pageNumber)
                        }
                      >
                        Open page
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-violet-200"
                        onClick={() =>
                          void runExplain([hit], `${hit.manualName} — page ${hit.pageNumber}`)
                        }
                      >
                        <Sparkles className="mr-1 h-3 w-3" /> Explain for my script
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          onSaveAsEntry({
                            title: `${hit.manualName} — page ${hit.pageNumber}`,
                            usageHtml: `<p><strong>${hit.manualName}</strong>, page ${hit.pageNumber}</p><p>${snippet(hit.text, query)}</p>`,
                          })
                        }
                      >
                        Save as entry
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/85">
                    {snippet(hit.text, query)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </section>

      {explain && (
        <ManualExplainPanel
          title={explain.title}
          loading={explain.loading}
          error={explain.error}
          explanation={explain.explanation}
          onClose={() => setExplain(null)}
          onSaveAsEntry={(explanation) =>
            onSaveAsEntry({
              title: explain.title,
              usageHtml: `<p><strong>${explain.title}</strong></p><p>${explanation.summary}</p>${
                explanation.steps.length
                  ? `<ol>${explanation.steps.map((s) => `<li>${s}</li>`).join("")}</ol>`
                  : ""
              }`,
            })
          }
        />
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6">
          <div className="relative h-full w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-background">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <span className="text-sm font-medium">
                {viewer.name} — page {viewer.page}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setViewer(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <iframe
              title={viewer.name}
              src={`${viewer.url}#page=${viewer.page}`}
              className={cn("h-[calc(100%-2.75rem)] w-full")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
