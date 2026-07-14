import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Archive,
  BookOpen,
  Boxes,
  FileText,
  Folder,
  FolderOpen,
  GraduationCap,
  Heart,
  LibraryBig,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  ArrowUpDown,
  Check,
  FolderInput,
  PinOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
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
  createKnowledgeFolder,
  createKnowledgeNote,
  deleteKnowledgeFolder,
  deleteKnowledgeNote,
  listKnowledgeVault,
  updateKnowledgeFolder,
  updateKnowledgeNote,
  type KnowledgeFolder,
  type KnowledgeNote,
  type KnowledgeNoteType,
} from "@/lib/knowledge/knowledge.functions";

const NOTE_TYPES: Array<{
  value: KnowledgeNoteType;
  label: string;
  singular: string;
  icon: typeof FileText;
  color: string;
}> = [
  {
    value: "work-note",
    label: "Work notes",
    singular: "Work note",
    icon: FileText,
    color: "var(--cyan-glow)",
  },
  {
    value: "training",
    label: "Training",
    singular: "Training guide",
    icon: GraduationCap,
    color: "var(--violet-glow)",
  },
  {
    value: "prompt",
    label: "Prompts",
    singular: "Reusable prompt",
    icon: Sparkles,
    color: "oklch(0.82 0.16 315)",
  },
  {
    value: "procedure",
    label: "Procedures",
    singular: "Procedure",
    icon: ListChecks,
    color: "var(--gold-glow)",
  },
  {
    value: "reference",
    label: "References",
    singular: "Reference",
    icon: BookOpen,
    color: "var(--green-glow)",
  },
];

const FOLDER_COLORS = ["#22d3ee", "#818cf8", "#c084fc", "#f472b6", "#fbbf24", "#34d399"];
type VaultView =
  "all" | "pinned" | "favorites" | "archived" | `type:${KnowledgeNoteType}` | `folder:${string}`;

type SortMode = "updated" | "created" | "title" | "type" | "folder";

const SORT_LABELS: Record<SortMode, string> = {
  updated: "Recently updated",
  created: "Recently created",
  title: "Title A–Z",
  type: "Type",
  folder: "Folder",
};

function typeConfig(type: KnowledgeNoteType) {
  return NOTE_TYPES.find((item) => item.value === type) ?? NOTE_TYPES[0];
}

function noteFieldsEqual(a: KnowledgeNote | null, b: KnowledgeNote | null) {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    a.folderId === b.folderId &&
    a.title === b.title &&
    a.contentHtml === b.contentHtml &&
    a.noteType === b.noteType &&
    a.isPinned === b.isPinned &&
    a.isFavorite === b.isFavorite &&
    a.isArchived === b.isArchived &&
    a.tags.join("\u0000") === b.tags.join("\u0000")
  );
}

export function KnowledgeVault() {
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<VaultView>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KnowledgeNote | null>(null);
  const draftRef = useRef<KnowledgeNote | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [newType, setNewType] = useState<KnowledgeNoteType>("work-note");
  const [tagInput, setTagInput] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<KnowledgeFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderDescription, setFolderDescription] = useState("");
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]);
  const [folderSaving, setFolderSaving] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await listKnowledgeVault();
      setFolders(result.folders);
      setNotes(result.notes);
      setSelectedId((current) => current ?? result.notes[0]?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not open the Knowledge Vault.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const selected = notes.find((note) => note.id === selectedId) ?? null;
    setDraft(selected);
    draftRef.current = selected;
    setDirty(false);
    setLastSaved(null);
    setTagInput("");
    // Note list updates are handled explicitly so an autosave never overwrites an active draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const activeNotes = useMemo(() => notes.filter((note) => !note.isArchived), [notes]);

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return notes
      .filter((note) => {
        if (view === "archived") {
          if (!note.isArchived) return false;
        } else if (note.isArchived) return false;
        if (view === "pinned" && !note.isPinned) return false;
        if (view === "favorites" && !note.isFavorite) return false;
        if (view.startsWith("type:") && note.noteType !== view.slice(5)) return false;
        if (view.startsWith("folder:") && note.folderId !== view.slice(7)) return false;
        if (!needle) return true;
        const searchable = [
          note.title,
          htmlToPlainText(note.contentHtml),
          note.tags.join(" "),
          folderById.get(note.folderId ?? "")?.name ?? "",
          typeConfig(note.noteType).label,
        ]
          .join(" ")
          .toLocaleLowerCase();
        return searchable.includes(needle);
      })
      .sort((a, b) => {
        const pinDelta = Number(b.isPinned) - Number(a.isPinned);
        if (pinDelta !== 0) return pinDelta;
        switch (sortMode) {
          case "created":
            return b.createdAt.localeCompare(a.createdAt);
          case "title":
            return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
          case "type":
            return (
              a.noteType.localeCompare(b.noteType) || b.updatedAt.localeCompare(a.updatedAt)
            );
          case "folder": {
            const af = folderById.get(a.folderId ?? "")?.name ?? "\uffff";
            const bf = folderById.get(b.folderId ?? "")?.name ?? "\uffff";
            return (
              af.localeCompare(bf, undefined, { sensitivity: "base" }) ||
              b.updatedAt.localeCompare(a.updatedAt)
            );
          }
          case "updated":
          default:
            return b.updatedAt.localeCompare(a.updatedAt);
        }
      });
  }, [folderById, notes, query, view, sortMode]);

  const changeDraft = (changes: Partial<KnowledgeNote>) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...changes };
      draftRef.current = next;
      return next;
    });
    setDirty(true);
  };

  const persistDraft = useCallback(async (snapshot: KnowledgeNote) => {
    setSaving(true);
    try {
      const saved = await updateKnowledgeNote({
        data: {
          id: snapshot.id,
          folderId: snapshot.folderId,
          title: snapshot.title.trim() || "Untitled note",
          contentHtml: snapshot.contentHtml,
          noteType: snapshot.noteType,
          tags: snapshot.tags,
          isPinned: snapshot.isPinned,
          isFavorite: snapshot.isFavorite,
          isArchived: snapshot.isArchived,
        },
      });
      setNotes((current) => current.map((note) => (note.id === saved.id ? saved : note)));
      if (noteFieldsEqual(draftRef.current, snapshot)) {
        setDraft(saved);
        draftRef.current = saved;
        setDirty(false);
      }
      setLastSaved(new Date());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!dirty || !draft) return;
    const timer = window.setTimeout(() => void persistDraft(draft), 900);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, persistDraft]);

  const selectNote = (id: string) => {
    if (dirty && draft) void persistDraft(draft);
    setSelectedId(id);
  };

  const createNote = async () => {
    try {
      if (dirty && draft) await persistDraft(draft);
      const folderId = view.startsWith("folder:") ? view.slice(7) : null;
      const config = typeConfig(newType);
      const note = await createKnowledgeNote({
        data: { folderId, noteType: newType, title: `New ${config.singular}` },
      });
      setNotes((current) => [note, ...current]);
      setSelectedId(note.id);
      toast.success(`${config.singular} created.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create note.");
    }
  };

  const toggleNote = async (changes: Partial<KnowledgeNote>) => {
    if (!draft) return;
    const next = { ...draft, ...changes };
    setDraft(next);
    draftRef.current = next;
    setDirty(true);
    await persistDraft(next);
  };

  const removeNote = async () => {
    if (!draft || !window.confirm(`Delete “${draft.title}”? This cannot be undone.`)) return;
    try {
      await deleteKnowledgeNote({ data: { id: draft.id } });
      const remaining = notes.filter((note) => note.id !== draft.id);
      setNotes(remaining);
      setSelectedId(remaining.find((note) => !note.isArchived)?.id ?? remaining[0]?.id ?? null);
      toast.success("Note deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete note.");
    }
  };

  const openFolderDialog = (folder?: KnowledgeFolder) => {
    setEditingFolder(folder ?? null);
    setFolderName(folder?.name ?? "");
    setFolderDescription(folder?.description ?? "");
    setFolderColor(folder?.color ?? FOLDER_COLORS[folders.length % FOLDER_COLORS.length]);
    setFolderDialogOpen(true);
  };

  const saveFolder = async () => {
    if (!folderName.trim()) return;
    setFolderSaving(true);
    try {
      if (editingFolder) {
        const folder = await updateKnowledgeFolder({
          data: {
            id: editingFolder.id,
            name: folderName,
            description: folderDescription,
            color: folderColor,
          },
        });
        setFolders((current) => current.map((item) => (item.id === folder.id ? folder : item)));
        toast.success("Folder updated.");
      } else {
        const folder = await createKnowledgeFolder({
          data: { name: folderName, description: folderDescription, color: folderColor },
        });
        setFolders((current) => [...current, folder]);
        setView(`folder:${folder.id}`);
        toast.success("Folder created.");
      }
      setFolderDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save folder.");
    } finally {
      setFolderSaving(false);
    }
  };

  const removeFolder = async (folder: KnowledgeFolder) => {
    if (!window.confirm(`Delete the “${folder.name}” folder? Its notes will move to Unfiled.`))
      return;
    try {
      await deleteKnowledgeFolder({ data: { id: folder.id } });
      setFolders((current) => current.filter((item) => item.id !== folder.id));
      setNotes((current) =>
        current.map((note) => (note.folderId === folder.id ? { ...note, folderId: null } : note)),
      );
      setDraft((current) => {
        if (current?.folderId !== folder.id) return current;
        const next = { ...current, folderId: null };
        draftRef.current = next;
        return next;
      });
      if (view === `folder:${folder.id}`) setView("all");
      toast.success("Folder removed; its notes are now Unfiled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete folder.");
    }
  };

  const addTag = () => {
    if (!draft) return;
    const tag = tagInput.trim().replace(/^#/, "").toLocaleLowerCase();
    if (!tag || draft.tags.includes(tag) || draft.tags.length >= 12) {
      setTagInput("");
      return;
    }
    changeDraft({ tags: [...draft.tags, tag] });
    setTagInput("");
  };

  if (loading) {
    return (
      <div className="grid min-h-[65vh] place-items-center">
        <div className="space-y-3 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
          <div className="text-sm">Opening your Knowledge Vault…</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    const missingSchema = /knowledge_(folders|notes)|schema cache/i.test(loadError);
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-2xl border border-rose-400/25 bg-rose-500/5 p-7 text-center shadow-2xl">
        <LibraryBig className="mx-auto h-10 w-10 text-rose-300" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">Knowledge Vault unavailable</h2>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        {missingSchema && (
          <p className="mt-3 text-xs text-amber-200">
            Apply the Knowledge Vault Supabase migration, then reload this page.
          </p>
        )}
        <Button className="mt-5" variant="secondary" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-[1800px] space-y-4 overflow-hidden">
      <div
        className="pointer-events-none absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--violet-glow), transparent 68%)" }}
      />
      <header className="glass-panel relative overflow-hidden p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,oklch(0.72_0.2_285_/_0.14),transparent_38%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.7 0.2 225 / .28), oklch(0.65 0.22 295 / .34))",
                boxShadow: "0 0 28px oklch(0.72 0.19 245 / .26)",
              }}
            >
              <LibraryBig className="h-6 w-6 text-cyan-100" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">
                BlueVerse knowledge system
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Knowledge Vault
              </h1>
              <p className="text-sm text-muted-foreground">
                Training guides, work notes, prompts, procedures, and everything you learn along the
                way.
              </p>
            </div>
          </div>
          <div className="flex gap-2 text-center">
            <Stat value={activeNotes.length} label="Active notes" />
            <Stat value={folders.length} label="Folders" />
            <Stat value={activeNotes.filter((note) => note.isPinned).length} label="Pinned" />
          </div>
        </div>
      </header>

      <div className="relative grid min-h-[690px] gap-3 xl:h-[calc(100vh-13rem)] xl:grid-cols-[230px_330px_minmax(0,1fr)]">
        <aside className="glass-panel flex min-h-0 flex-col overflow-hidden p-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Collections
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => openFolderDialog()}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="sr-only">New folder</span>
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1 pr-1">
            <div className="space-y-1">
              <VaultNavItem
                icon={Boxes}
                label="All knowledge"
                count={activeNotes.length}
                active={view === "all"}
                onClick={() => setView("all")}
              />
              <VaultNavItem
                icon={Pin}
                label="Pinned"
                count={activeNotes.filter((note) => note.isPinned).length}
                active={view === "pinned"}
                onClick={() => setView("pinned")}
              />
              <VaultNavItem
                icon={Heart}
                label="Favorites"
                count={activeNotes.filter((note) => note.isFavorite).length}
                active={view === "favorites"}
                onClick={() => setView("favorites")}
              />

              <div className="pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                Knowledge types
              </div>
              {NOTE_TYPES.map((item) => (
                <VaultNavItem
                  key={item.value}
                  icon={item.icon}
                  label={item.label}
                  count={activeNotes.filter((note) => note.noteType === item.value).length}
                  color={item.color}
                  active={view === `type:${item.value}`}
                  onClick={() => setView(`type:${item.value}`)}
                />
              ))}

              <div className="flex items-center justify-between pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                <span>Folders</span>
                <button
                  className="text-cyan-300 hover:text-cyan-100"
                  onClick={() => openFolderDialog()}
                >
                  New
                </button>
              </div>
              {folders.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[11px] text-muted-foreground">
                  Create a folder to organize your growing library.
                </div>
              )}
              {folders.map((folder) => (
                <div key={folder.id} className="group flex items-center gap-1">
                  <VaultNavItem
                    icon={view === `folder:${folder.id}` ? FolderOpen : Folder}
                    label={folder.name}
                    count={activeNotes.filter((note) => note.folderId === folder.id).length}
                    color={folder.color}
                    active={view === `folder:${folder.id}`}
                    onClick={() => setView(`folder:${folder.id}`)}
                    className="min-w-0 flex-1"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0 opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openFolderDialog(folder)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit folder
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-rose-300"
                        onClick={() => void removeFolder(folder)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}

              <div className="pt-4">
                <VaultNavItem
                  icon={Archive}
                  label="Archive"
                  count={notes.filter((note) => note.isArchived).length}
                  active={view === "archived"}
                  onClick={() => setView("archived")}
                />
              </div>
            </div>
          </ScrollArea>
        </aside>

        <section className="glass-panel flex min-h-0 flex-col overflow-hidden">
          <div className="space-y-3 border-b border-white/10 p-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search your vault…"
                  className="h-9 pl-9"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select
                value={newType}
                onValueChange={(value) => setNewType(value as KnowledgeNoteType)}
              >
                <SelectTrigger className="h-9 min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.singular}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="h-9" onClick={() => void createNote()}>
                <Plus className="mr-1.5 h-4 w-4" /> New
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <span>
              {filteredNotes.length} note{filteredNotes.length === 1 ? "" : "s"}
            </span>
            <span>Recently updated</span>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
            <div className="space-y-2">
              {filteredNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  folder={folderById.get(note.folderId ?? "")}
                  selected={note.id === selectedId}
                  onClick={() => selectNote(note.id)}
                />
              ))}
              {filteredNotes.length === 0 && (
                <div className="mx-2 mt-8 rounded-xl border border-dashed border-white/10 p-6 text-center">
                  <BookOpen className="mx-auto h-7 w-7 text-cyan-300/60" />
                  <div className="mt-3 text-sm font-medium text-foreground">No notes here yet</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Create one and start building your operational memory.
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </section>

        <main className="glass-panel min-h-[680px] min-w-0 overflow-hidden">
          {draft ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-white/10 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={draft.noteType}
                    onValueChange={(value) => changeDraft({ noteType: value as KnowledgeNoteType })}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTE_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.singular}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={draft.folderId ?? "unfiled"}
                    onValueChange={(value) =>
                      changeDraft({ folderId: value === "unfiled" ? null : value })
                    }
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="Folder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unfiled">Unfiled</SelectItem>
                      {folders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("h-8 w-8 p-0", draft.isPinned && "text-cyan-200")}
                      onClick={() => void toggleNote({ isPinned: !draft.isPinned })}
                      title="Pin note"
                    >
                      <Pin className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("h-8 w-8 p-0", draft.isFavorite && "text-pink-300")}
                      onClick={() => void toggleNote({ isFavorite: !draft.isFavorite })}
                      title="Favorite"
                    >
                      <Heart className={cn("h-4 w-4", draft.isFavorite && "fill-current")} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => void toggleNote({ isArchived: !draft.isArchived })}
                        >
                          <Archive className="mr-2 h-4 w-4" />
                          {draft.isArchived ? "Restore from archive" : "Move to archive"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-rose-300"
                          onClick={() => void removeNote()}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <Input
                  value={draft.title}
                  onChange={(event) => changeDraft({ title: event.target.value })}
                  onBlur={() => {
                    if (dirty && draftRef.current) void persistDraft(draftRef.current);
                  }}
                  className="mt-3 h-auto border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
                  placeholder="Untitled note"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  {draft.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() =>
                        changeDraft({ tags: draft.tags.filter((item) => item !== tag) })
                      }
                      className="group rounded-full border border-cyan-300/15 bg-cyan-300/5 px-2 py-0.5 text-[11px] text-cyan-100/80 hover:border-rose-300/30 hover:text-rose-200"
                    >
                      #{tag}
                      <X className="ml-1 inline h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                    </button>
                  ))}
                  {draft.tags.length < 12 && (
                    <Input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addTag();
                        }
                      }}
                      onBlur={addTag}
                      placeholder="Add tag"
                      className="h-7 w-24 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                    />
                  )}
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-4">
                  <RichTextEditor
                    value={draft.contentHtml}
                    onChange={(contentHtml) => changeDraft({ contentHtml })}
                    placeholder="Start writing your note, training guide, prompt, or procedure…"
                    minHeight="calc(100vh - 28rem)"
                    editorClassName="text-[15px] leading-7"
                    className="border-white/10 bg-black/10"
                  />
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-muted-foreground">
                <span>
                  {htmlToPlainText(draft.contentHtml).split(/\s+/).filter(Boolean).length} words
                </span>
                <span
                  className={cn(saving && "text-cyan-200", dirty && !saving && "text-amber-200")}
                >
                  {saving
                    ? "Saving to vault…"
                    : dirty
                      ? "Unsaved changes"
                      : lastSaved
                        ? `Saved ${formatDistanceToNow(lastSaved, { addSuffix: true })}`
                        : "Saved"}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-[680px] place-items-center p-8 text-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-violet-300/15 bg-violet-400/10 shadow-[0_0_40px_oklch(0.7_0.2_285_/_0.16)]">
                  <LibraryBig className="h-8 w-8 text-violet-200" />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-foreground">
                  Your operational memory starts here
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Capture a work note, turn a process into training, save a reusable AI prompt, or
                  build a step-by-step procedure.
                </p>
                <Button className="mt-5" onClick={() => void createNote()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first note
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>

      <FolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        editing={editingFolder}
        name={folderName}
        setName={setFolderName}
        description={folderDescription}
        setDescription={setFolderDescription}
        color={folderColor}
        setColor={setFolderColor}
        saving={folderSaving}
        onSave={() => void saveFolder()}
      />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-20 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
      <div className="font-mono text-lg text-cyan-100">{value}</div>
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
    </div>
  );
}

function VaultNavItem({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  color = "var(--cyan-glow)",
  className,
}: {
  icon: typeof FileText;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition",
        active
          ? "bg-white/10 text-foreground shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.08)]"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: active ? color : undefined }} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-mono text-[10px] text-muted-foreground/70">{count}</span>
    </button>
  );
}

function NoteCard({
  note,
  folder,
  selected,
  onClick,
}: {
  note: KnowledgeNote;
  folder?: KnowledgeFolder;
  selected: boolean;
  onClick: () => void;
}) {
  const config = typeConfig(note.noteType);
  const Icon = config.icon;
  const preview = htmlToPlainText(note.contentHtml) || "Empty note — open it and start writing.";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full overflow-hidden rounded-xl border p-3 text-left transition",
        selected
          ? "border-cyan-300/25 bg-cyan-300/[0.07] shadow-[0_0_22px_oklch(0.75_0.18_225_/_0.1)]"
          : "border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.045]",
      )}
    >
      {selected && (
        <span className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-cyan-300 shadow-[0_0_8px_var(--cyan-glow)]" />
      )}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5">
          <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-medium text-foreground">{note.title}</div>
            {note.isPinned && <Pin className="h-3 w-3 shrink-0 text-cyan-200" />}
            {note.isFavorite && <Heart className="h-3 w-3 shrink-0 fill-pink-300 text-pink-300" />}
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {preview}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
        <span className="truncate" style={{ color: folder?.color }}>
          {folder?.name ?? config.singular}
        </span>
        <span className="shrink-0">
          {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
        </span>
      </div>
    </button>
  );
}

function FolderDialog({
  open,
  onOpenChange,
  editing,
  name,
  setName,
  description,
  setDescription,
  color,
  setColor,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: KnowledgeFolder | null;
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  color: string;
  setColor: (value: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-cyan-300/15 bg-background/95 shadow-[0_0_70px_oklch(0.7_0.2_270_/_0.18)] backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit collection" : "Create a collection"}</DialogTitle>
          <DialogDescription>
            Group related training, procedures, prompts, and work notes together.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="space-y-1.5 text-xs text-muted-foreground">
            <span>Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Example: Infinity Supervisor"
              autoFocus
              maxLength={80}
            />
          </label>
          <label className="space-y-1.5 text-xs text-muted-foreground">
            <span>Description</span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What belongs in this collection?"
              maxLength={500}
            />
          </label>
          <div>
            <div className="mb-2 text-xs text-muted-foreground">Color signal</div>
            <div className="flex gap-2">
              {FOLDER_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition",
                    color === item
                      ? "scale-110 border-white"
                      : "border-transparent opacity-70 hover:opacity-100",
                  )}
                  style={{
                    background: item,
                    boxShadow: color === item ? `0 0 14px ${item}` : undefined,
                  }}
                  aria-label={item}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
