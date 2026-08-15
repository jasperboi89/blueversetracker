import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import {
  Archive,
  BookOpen,
  Boxes,
  Clock3,
  Download,
  File as FileIcon,
  FileText,
  Folder,
  FolderOpen,
  GraduationCap,
  Heart,
  History,
  Inbox,
  LibraryBig,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TerminalSquare,
  Upload,
  X,
} from "lucide-react";
import { ArrowUpDown, Check, FolderInput, Maximize2, PinOff } from "lucide-react";
import {
  BookMarked,
  Eye,
  LayoutList,
  Minimize2,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  Rows3,
  SquareStack,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { portalPresence } from "@/lib/core/portal-presence";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { PrintableNote } from "@/components/knowledge/PrintableNote";
import { IsScriptWorkspace } from "@/components/knowledge/is-scripts/IsScriptWorkspace";
import { PaneDivider } from "@/components/knowledge/workspace/PaneDivider";
import { NoteReader } from "@/components/knowledge/workspace/NoteReader";
import { ContextDrawer } from "@/components/knowledge/workspace/ContextDrawer";
import { BookMode } from "@/components/knowledge/workspace/BookMode";
import { CollectionShelf } from "@/components/knowledge/workspace/CollectionShelf";
import {
  NAV_MAX,
  NAV_MIN,
  STACK_MAX,
  STACK_MIN,
  noteStatus,
  orderedForBook,
  useVaultWorkspace,
  vaultWorkspace,
  type ContextTab,
  type NoteStatus,
  type VaultDensity,
} from "@/lib/knowledge/vault-workspace-store";
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
import { aiOrganizeKnowledgeNote } from "@/lib/ai/ai.functions";
import { aiStyleHint, useAISettings } from "@/lib/settings/ai-settings-store";
import {
  createKnowledgeFolder,
  createKnowledgeNote,
  deleteKnowledgeFolder,
  deleteKnowledgeNote,
  listKnowledgeVault,
  updateKnowledgeFolder,
  updateKnowledgeNote,
  type KnowledgeAttachment,
  type KnowledgeFolder,
  type KnowledgeNote,
  type KnowledgeNoteVersion,
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
  | "all"
  | "recent"
  | "unfiled"
  | "pinned"
  | "favorites"
  | "archived"
  | `type:${KnowledgeNoteType}`
  | `folder:${string}`;

type SortMode = "updated" | "created" | "title" | "type" | "folder";

const SORT_LABELS: Record<SortMode, string> = {
  updated: "Recently updated",
  created: "Recently created",
  title: "Title A–Z",
  type: "Type",
  folder: "Folder",
};

function contentFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16)}-${value.length}`;
}

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
    a.tags.join("\u0000") === b.tags.join("\u0000") &&
    (a.attachments ?? []).map((x) => x.id).join("\u0000") ===
      (b.attachments ?? []).map((x) => x.id).join("\u0000") &&
    a.aiContentHtml === b.aiContentHtml &&
    a.aiGeneratedAt === b.aiGeneratedAt &&
    a.aiSourceFingerprint === b.aiSourceFingerprint
  );
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_NOTE = 30;

function readFileAsAttachment(file: File): Promise<KnowledgeAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name || "attachment",
        mimeType: file.type || "application/octet-stream",
        isImage: (file.type || "").startsWith("image/"),
        dataUrl,
        sizeBytes: file.size,
        createdAt: new Date().toISOString(),
      });
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeVault() {
  const aiSettings = useAISettings();
  const workspace = useVaultWorkspace();
  const [section, setSection] = useState<"notes" | "is-scripts">("notes");
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<VaultView>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KnowledgeNote | null>(null);
  const [printTarget, setPrintTarget] = useState<KnowledgeNote | null>(null);

  useEffect(() => {
    if (!printTarget) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintTarget(null);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [printTarget]);
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
  const [expanded, setExpanded] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<KnowledgeAttachment | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [aiOrganizing, setAiOrganizing] = useState(false);
  /** Document presentation state — Reader is the default for an existing note. */
  const [docMode, setDocMode] = useState<"reader" | "edit">("reader");
  const [focusMode, setFocusMode] = useState(false);
  const [bookFolderId, setBookFolderId] = useState<string | null>(null);
  const [bookIndex, setBookIndex] = useState(0);
  const [versionPreview, setVersionPreview] = useState<KnowledgeNoteVersion | null>(null);
  const [compareVersion, setCompareVersion] = useState(false);

  /**
   * Publish Knowledge Vault presence to the Portal Context layer: which note is
   * open, whether the operator is editing it, and whether there is unsaved
   * work. Only identifiers and state flags — never note content.
   */
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;
  useEffect(() => {
    portalPresence.setKnowledgeNote(
      selectedNote ? { id: selectedNote.id, title: selectedNote.title, collection: selectedNote.folderId ?? undefined, noteType: selectedNote.noteType, presentation: focusMode ? "focus" : docMode } : null,
    );
  }, [selectedNote?.id, selectedNote?.title, selectedNote?.folderId, selectedNote?.noteType, docMode, focusMode]);
  useEffect(() => {
    portalPresence.setEditMode(docMode === "edit");
  }, [docMode]);
  useEffect(() => {
    portalPresence.setUnsaved("knowledge_note", selectedId ?? "draft", dirty);
  }, [dirty, selectedId]);
  useEffect(
    () => () => {
      portalPresence.setKnowledgeNote(null);
      portalPresence.setEditMode(false);
      portalPresence.reset();
    },
    [],
  );

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
    setVersionsOpen(false);
    setDocMode("reader");
    setVersionPreview(null);
    setCompareVersion(false);
    // Note list updates are handled explicitly so an autosave never overwrites an active draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const activeNotes = useMemo(() => notes.filter((note) => !note.isArchived), [notes]);
  const unfiledCount = activeNotes.filter((note) => note.folderId === null).length;
  const recentCount = activeNotes.filter(
    (note) => Date.now() - new Date(note.updatedAt).getTime() <= 7 * 24 * 60 * 60 * 1000,
  ).length;
  const organizationPercent =
    activeNotes.length === 0
      ? 100
      : Math.round(((activeNotes.length - unfiledCount) / activeNotes.length) * 100);
  const aiIsStale = Boolean(
    draft?.aiContentHtml && draft.aiSourceFingerprint !== contentFingerprint(draft.contentHtml),
  );

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return notes
      .filter((note) => {
        if (view === "archived") {
          if (!note.isArchived) return false;
        } else if (note.isArchived) return false;
        if (
          view === "recent" &&
          Date.now() - new Date(note.updatedAt).getTime() > 7 * 24 * 60 * 60 * 1000
        )
          return false;
        if (view === "unfiled" && note.folderId !== null) return false;
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
            return a.noteType.localeCompare(b.noteType) || b.updatedAt.localeCompare(a.updatedAt);
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

  const draftStatus: NoteStatus = draft ? noteStatus(workspace, draft.id) : "saved";
  const isReference = draftStatus === "reference";

  const relatedNotes = useMemo(() => {
    if (!draft) return [];
    return notes
      .filter(
        (note) =>
          note.id !== draft.id &&
          !note.isArchived &&
          ((draft.folderId && note.folderId === draft.folderId) ||
            note.tags.some((tag) => draft.tags.includes(tag))),
      )
      .slice(0, 8);
  }, [notes, draft]);

  const bookFolder = bookFolderId ? (folderById.get(bookFolderId) ?? null) : null;
  const bookNotes = useMemo(() => {
    if (!bookFolderId) return [];
    const inside = notes.filter((note) => note.folderId === bookFolderId && !note.isArchived);
    return orderedForBook(inside, workspace.bookOrder[bookFolderId]);
  }, [notes, bookFolderId, workspace.bookOrder]);

  // Persist the last collection/view the operator was browsing.
  useEffect(() => {
    vaultWorkspace.setLastView(view);
  }, [view]);

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
          attachments: snapshot.attachments ?? [],
          aiContentHtml: snapshot.aiContentHtml,
          aiGeneratedAt: snapshot.aiGeneratedAt,
          aiSourceFingerprint: snapshot.aiSourceFingerprint,
          versions: snapshot.versions ?? [],
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

  const organizeWithAi = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return;
    const sourceText = htmlToPlainText(current.contentHtml).trim();
    if (!sourceText) {
      toast.error("Add some original notes before organizing them with AI.");
      return;
    }

    setAiOrganizing(true);
    try {
      const result = await aiOrganizeKnowledgeNote({
        data: {
          title: current.title.trim() || "Untitled note",
          noteType: current.noteType,
          sourceText,
          style: aiStyleHint(aiSettings),
        },
      });
      if (!result.ok) {
        toast.error(result.error ?? "AI could not organize this note.");
        return;
      }
      if (!result.html) {
        toast.error("AI returned an empty organized note.");
        return;
      }

      const safeHtml = DOMPurify.sanitize(result.html, {
        ALLOWED_TAGS: [
          "h2",
          "h3",
          "p",
          "ul",
          "ol",
          "li",
          "strong",
          "em",
          "blockquote",
          "code",
          "pre",
          "br",
        ],
        ALLOWED_ATTR: [],
      });
      const history = current.versions ?? [];
      const archived: KnowledgeNoteVersion = {
        id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: history.length === 0 ? "Original note" : "Before AI pass",
        html: current.contentHtml,
        createdAt: new Date().toISOString(),
      };
      const next: KnowledgeNote = {
        ...current,
        contentHtml: safeHtml,
        versions: [archived, ...history].slice(0, 30),
        aiContentHtml: safeHtml,
        aiGeneratedAt: new Date().toISOString(),
        aiSourceFingerprint: contentFingerprint(safeHtml),
      };
      setDraft(next);
      draftRef.current = next;
      setDirty(true);
      await persistDraft(next);
      toast.success("AI version is now the note. Your previous text is in Versions.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI could not organize this note.");
    } finally {
      setAiOrganizing(false);
    }
  }, [aiSettings, persistDraft]);

  /** Legacy notes kept the AI copy alongside the original; promote it and archive the original. */
  useEffect(() => {
    const note = draftRef.current;
    if (!note) return;
    if (!note.aiContentHtml || note.aiContentHtml === note.contentHtml) return;
    if ((note.versions ?? []).length > 0) return;
    const promoted: KnowledgeNote = {
      ...note,
      contentHtml: note.aiContentHtml,
      versions: [
        {
          id: `ver-${Date.now()}-legacy`,
          label: "Original note",
          html: note.contentHtml,
          createdAt: note.createdAt,
        },
      ],
      aiSourceFingerprint: contentFingerprint(note.aiContentHtml),
    };
    setDraft(promoted);
    draftRef.current = promoted;
    void persistDraft(promoted);
  }, [selectedId, persistDraft]);

  const restoreVersion = useCallback(
    (version: KnowledgeNoteVersion) => {
      const current = draftRef.current;
      if (!current) return;
      const next: KnowledgeNote = {
        ...current,
        contentHtml: version.html,
        versions: [
          {
            id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            label: "Replaced by restore",
            html: current.contentHtml,
            createdAt: new Date().toISOString(),
          },
          ...(current.versions ?? []),
        ].slice(0, 30),
        aiGeneratedAt: null,
        aiContentHtml: "",
        aiSourceFingerprint: "",
      };
      setDraft(next);
      draftRef.current = next;
      setVersionsOpen(false);
      void persistDraft(next);
      toast.success(`Restored “${version.label}”.`);
    },
    [persistDraft],
  );

  useEffect(() => {
    if (!dirty || !draft) return;
    const timer = window.setTimeout(() => void persistDraft(draft), 900);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, persistDraft]);

  /** Explicit save from Edit Mode; returns to Reader unless the user keeps editing. */
  const saveAndRead = useCallback(async () => {
    const snapshot = draftRef.current;
    if (snapshot) await persistDraft(snapshot);
    setDocMode("reader");
  }, [persistDraft]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        if (docMode === "edit" && draftRef.current) {
          event.preventDefault();
          void persistDraft(draftRef.current);
        }
        return;
      }
      if (event.key !== "Escape") return;
      if (versionPreview) {
        setVersionPreview(null);
        setCompareVersion(false);
        return;
      }
      if (focusMode) {
        setFocusMode(false);
        return;
      }
      if (workspace.drawerOpen) vaultWorkspace.setDrawer(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [docMode, focusMode, versionPreview, workspace.drawerOpen, persistDraft]);

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

  const patchNoteById = async (
    id: string,
    changes: Partial<
      Pick<
        KnowledgeNote,
        "folderId" | "title" | "noteType" | "isPinned" | "isFavorite" | "isArchived"
      >
    >,
  ) => {
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    const merged = { ...target, ...changes };
    try {
      const saved = await updateKnowledgeNote({
        data: {
          id,
          folderId: merged.folderId,
          title: merged.title.trim() || "Untitled note",
          noteType: merged.noteType,
          isPinned: merged.isPinned,
          isFavorite: merged.isFavorite,
          isArchived: merged.isArchived,
        },
      });
      setNotes((current) => current.map((n) => (n.id === saved.id ? saved : n)));
      if (draftRef.current?.id === saved.id) {
        setDraft(saved);
        draftRef.current = saved;
        setDirty(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update note.");
    }
  };

  const deleteNoteById = async (id: string) => {
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    if (!window.confirm(`Delete “${target.title}”? This cannot be undone.`)) return;
    try {
      await deleteKnowledgeNote({ data: { id } });
      const remaining = notes.filter((n) => n.id !== id);
      setNotes(remaining);
      if (selectedId === id) {
        setSelectedId(remaining.find((n) => !n.isArchived)?.id ?? remaining[0]?.id ?? null);
      }
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("Note deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete note.");
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkApply = async (action: "archive" | "restore" | "delete" | { move: string | null }) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (
      action === "delete" &&
      !window.confirm(`Delete ${ids.length} note(s)? This cannot be undone.`)
    )
      return;
    try {
      if (action === "delete") {
        await Promise.all(ids.map((id) => deleteKnowledgeNote({ data: { id } })));
        setNotes((current) => current.filter((n) => !selectedIds.has(n.id)));
        toast.success(`${ids.length} note(s) deleted.`);
      } else {
        const changes =
          action === "archive"
            ? { isArchived: true }
            : action === "restore"
              ? { isArchived: false }
              : { folderId: action.move };
        await Promise.all(
          ids.map((id) => updateKnowledgeNote({ data: { id, ...changes } }).then((saved) => saved)),
        );
        setNotes((current) =>
          current.map((n) => (selectedIds.has(n.id) ? { ...n, ...changes } : n)),
        );
        toast.success(`${ids.length} note(s) updated.`);
      }
      clearSelection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed.");
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

  const addAttachments = useCallback(
    async (files: File[] | FileList | null | undefined) => {
      if (!files) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      const current = draftRef.current;
      if (!current) return;
      const existing = current.attachments ?? [];
      const room = MAX_ATTACHMENTS_PER_NOTE - existing.length;
      if (room <= 0) {
        toast.error(`Note is at the ${MAX_ATTACHMENTS_PER_NOTE} attachment limit.`);
        return;
      }
      const accepted: File[] = [];
      for (const f of list.slice(0, room)) {
        if (f.size > MAX_ATTACHMENT_BYTES) {
          toast.error(`“${f.name}” is over 5 MB and was skipped.`);
          continue;
        }
        accepted.push(f);
      }
      if (accepted.length === 0) return;
      try {
        const items = await Promise.all(accepted.map(readFileAsAttachment));
        changeDraft({ attachments: [...existing, ...items] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not attach files.");
      }
    },

    [],
  );

  const removeAttachment = (attachmentId: string) => {
    const current = draftRef.current;
    if (!current) return;
    changeDraft({
      attachments: (current.attachments ?? []).filter((a) => a.id !== attachmentId),
    });
  };

  const renameAttachment = (attachmentId: string, nextName: string) => {
    const current = draftRef.current;
    if (!current) return;
    const trimmed = nextName.trim();
    if (!trimmed) return;
    changeDraft({
      attachments: (current.attachments ?? []).map((a) =>
        a.id === attachmentId ? { ...a, name: trimmed.slice(0, 200) } : a,
      ),
    });
  };

  // Global paste-image capture while a note is open (and no modal input is focused elsewhere).
  useEffect(() => {
    if (!draft) return;
    const handler = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const target = event.target as HTMLElement | null;
      // Ignore paste inside plain text inputs (title, tag input) so it behaves normally there.
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        void addAttachments(files);
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [draft, addAttachments]);

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
      {!focusMode && (
        <header className="glass-panel relative overflow-hidden p-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,oklch(0.72_0.2_285_/_0.14),transparent_38%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/20"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.7 0.2 225 / .28), oklch(0.65 0.22 295 / .34))",
                  boxShadow: "0 0 28px oklch(0.72 0.19 245 / .26)",
                }}
              >
                <LibraryBig className="h-5 w-5 text-cyan-100" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">
                  BlueVerse knowledge system
                </div>
                <h1 className="text-[1.35rem] font-semibold tracking-tight text-foreground">
                  Knowledge Vault
                </h1>
                <p className="text-sm text-muted-foreground">
                  Training guides, work notes, prompts, procedures, and everything you learn along
                  the way.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-stretch justify-end gap-2 text-center">
              <Stat value={activeNotes.length} label="Active notes" />
              <Stat value={recentCount} label="Fresh this week" />
              <Stat value={unfiledCount} label="Needs filing" />
              <div className="min-w-32 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] px-3 py-2 text-left">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    Vault health
                  </span>
                  <span className="font-mono text-sm text-emerald-200">{organizationPercent}%</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 shadow-[0_0_10px_oklch(0.8_0.16_165_/_0.35)] transition-all"
                    style={{ width: `${organizationPercent}%` }}
                  />
                </div>
                <div className="mt-1 text-[9px] text-muted-foreground">notes organized</div>
              </div>
            </div>
          </div>
        </header>
      )}

      {!focusMode && (
        <div className="flex flex-wrap items-center gap-2">
          <SectionTab
            active={section === "notes"}
            icon={LibraryBig}
            label="Notes"
            onClick={() => setSection("notes")}
          />
          <SectionTab
            active={section === "is-scripts"}
            icon={TerminalSquare}
            label="IS Script Work"
            onClick={() => setSection("is-scripts")}
          />
          {section === "notes" && (
            <SectionTab
              active={workspace.shelfOpen}
              icon={BookMarked}
              label="Shelf"
              onClick={() => vaultWorkspace.setShelfOpen(!workspace.shelfOpen)}
            />
          )}
        </div>
      )}

      {section === "is-scripts" && <IsScriptWorkspace />}

      {section === "notes" && workspace.shelfOpen && !focusMode && (
        <CollectionShelf
          folders={folders}
          notes={notes}
          onOpen={(folderId) => {
            setView(`folder:${folderId}`);
            vaultWorkspace.setShelfOpen(false);
          }}
          onOpenBook={(folderId) => {
            setBookFolderId(folderId);
            setBookIndex(0);
            vaultWorkspace.setShelfOpen(false);
          }}
        />
      )}

      <div
        className={cn(
          "relative flex min-h-[690px] flex-col gap-3 xl:h-[calc(100vh-12rem)] xl:flex-row xl:items-stretch",
          section !== "notes" && "hidden",
        )}
      >
        {focusMode ? null : workspace.navCollapsed ? (
          <div className="glass-panel hidden w-11 shrink-0 flex-col items-center gap-2 p-2 xl:flex">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              aria-label="Expand vault navigator"
              onClick={() => vaultWorkspace.setNavCollapsed(false)}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <Boxes className="h-4 w-4 text-cyan-200/70" />
            <Folder className="h-4 w-4 text-muted-foreground" />
            <Archive className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : (
          <aside
            className="glass-panel flex min-h-0 shrink-0 flex-col overflow-hidden p-3"
            style={{ width: workspace.navWidth }}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Vault
              </span>
              <div className="flex items-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => openFolderDialog()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="sr-only">New folder</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="hidden h-7 w-7 p-0 xl:inline-flex"
                  aria-label="Collapse vault navigator"
                  onClick={() => vaultWorkspace.setNavCollapsed(true)}
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </div>
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
                  icon={Clock3}
                  label="Recently updated"
                  count={recentCount}
                  active={view === "recent"}
                  onClick={() => setView("recent")}
                />
                <VaultNavItem
                  icon={Inbox}
                  label="Unfiled"
                  count={unfiledCount}
                  active={view === "unfiled"}
                  onClick={() => setView("unfiled")}
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
                  <span>Collections</span>
                  <button
                    className="text-cyan-300 hover:text-cyan-100"
                    onClick={() => openFolderDialog()}
                  >
                    New
                  </button>
                </div>
                {folders.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[11px] text-muted-foreground">
                    Create a collection to organize your growing library.
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
        )}

        {!workspace.navCollapsed && !focusMode && (
          <PaneDivider
            label="Resize vault navigator"
            value={workspace.navWidth}
            min={NAV_MIN}
            max={NAV_MAX}
            onChange={(next) => vaultWorkspace.setNavWidth(next)}
            onReset={() => vaultWorkspace.resetNavWidth()}
          />
        )}

        {focusMode ? null : (
          <section
            className="glass-panel flex min-h-0 shrink-0 flex-col overflow-hidden xl:w-[var(--stack-w)]"
            style={{ ["--stack-w" as string]: `${workspace.stackWidth}px` }}
          >
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
            <div className="flex items-center justify-between gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span>
                {filteredNotes.length} note{filteredNotes.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      aria-label="List density"
                    >
                      {workspace.density === "compact" ? (
                        <Rows3 className="h-3 w-3" />
                      ) : workspace.density === "cards" ? (
                        <SquareStack className="h-3 w-3" />
                      ) : (
                        <LayoutList className="h-3 w-3" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(["compact", "comfortable", "cards"] as VaultDensity[]).map((d) => (
                      <DropdownMenuItem key={d} onClick={() => vaultWorkspace.setDensity(d)}>
                        {workspace.density === d ? (
                          <Check className="mr-2 h-4 w-4 text-cyan-300" />
                        ) : (
                          <span className="mr-2 inline-block h-4 w-4" />
                        )}
                        <span className="capitalize">{d}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1 rounded-md px-1.5 py-0.5 tracking-[0.16em] text-muted-foreground hover:bg-white/5 hover:text-foreground">
                      <ArrowUpDown className="h-3 w-3" />
                      <span className="normal-case tracking-normal">{SORT_LABELS[sortMode]}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                      <DropdownMenuItem key={mode} onClick={() => setSortMode(mode)}>
                        {sortMode === mode ? (
                          <Check className="mr-2 h-4 w-4 text-cyan-300" />
                        ) : (
                          <span className="mr-2 inline-block h-4 w-4" />
                        )}
                        {SORT_LABELS[mode]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {selectedIds.size > 0 && (
              <div className="mx-3 mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.06] px-2 py-1.5 text-[11px]">
                <span className="mr-1 font-medium text-cyan-100">{selectedIds.size} selected</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
                      <FolderInput className="mr-1 h-3 w-3" /> Move
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => void bulkApply({ move: null })}>
                      Unfiled
                    </DropdownMenuItem>
                    {folders.length > 0 && <DropdownMenuSeparator />}
                    {folders.map((f) => (
                      <DropdownMenuItem key={f.id} onClick={() => void bulkApply({ move: f.id })}>
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-full"
                          style={{ background: f.color }}
                        />
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => void bulkApply(view === "archived" ? "restore" : "archive")}
                >
                  <Archive className="mr-1 h-3 w-3" />
                  {view === "archived" ? "Restore" : "Archive"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-rose-300 hover:text-rose-200"
                  onClick={() => void bulkApply("delete")}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-[11px]"
                  onClick={clearSelection}
                >
                  Clear
                </Button>
              </div>
            )}
            <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
              <div className="space-y-2">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    folder={folderById.get(note.folderId ?? "")}
                    density={workspace.density}
                    status={noteStatus(workspace, note.id)}
                    selected={note.id === selectedId}
                    checked={selectedIds.has(note.id)}
                    onToggleChecked={() => toggleSelected(note.id)}
                    isRenaming={renamingId === note.id}
                    onStartRename={() => setRenamingId(note.id)}
                    onFinishRename={(nextTitle) => {
                      setRenamingId(null);
                      const trimmed = nextTitle.trim();
                      if (trimmed && trimmed !== note.title) {
                        void patchNoteById(note.id, { title: trimmed });
                      }
                    }}
                    folders={folders}
                    onPatch={(changes) => void patchNoteById(note.id, changes)}
                    onDelete={() => void deleteNoteById(note.id)}
                    onPrint={() => setPrintTarget(note)}
                    showFolderChip={!view.startsWith("folder:")}
                    onClick={() => selectNote(note.id)}
                  />
                ))}
                {filteredNotes.length === 0 && (
                  <div className="mx-2 mt-8 rounded-xl border border-dashed border-white/10 p-6 text-center">
                    <BookOpen className="mx-auto h-7 w-7 text-cyan-300/60" />
                    <div className="mt-3 text-sm font-medium text-foreground">
                      No notes here yet
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Create one and start building your operational memory.
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>
        )}

        {!focusMode && (
          <PaneDivider
            label="Resize note list"
            value={workspace.stackWidth}
            min={STACK_MIN}
            max={STACK_MAX}
            onChange={(next) => vaultWorkspace.setStackWidth(next)}
            onReset={() => vaultWorkspace.resetStackWidth()}
          />
        )}

        <div className="relative flex min-h-[680px] min-w-0 flex-1 overflow-hidden">
          {bookFolderId && bookNotes.length > 0 ? (
            <div className="min-w-0 flex-1">
              <BookMode
                title={bookFolder?.name ?? "Collection"}
                notes={bookNotes}
                index={bookIndex}
                onIndexChange={setBookIndex}
                onExit={() => setBookFolderId(null)}
                bookmarkedId={workspace.bookmarks[bookFolderId]}
                onBookmark={(noteId) => {
                  vaultWorkspace.setBookmark(bookFolderId, noteId);
                  toast.success("Bookmarked this page");
                }}
              />
            </div>
          ) : (
            <div className="glass-panel min-h-[680px] min-w-0 flex-1 overflow-hidden">
              {draft ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b border-white/10 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-white/[0.02] p-0.5">
                        <ModeButton
                          active={docMode === "reader"}
                          icon={Eye}
                          label="Reader"
                          onClick={() => setDocMode("reader")}
                        />
                        <ModeButton
                          active={docMode === "edit"}
                          icon={Pencil}
                          label="Edit"
                          onClick={() => {
                            if (isReference) {
                              toast.info("This note is marked Reference — unlock it to edit.");
                              return;
                            }
                            setDocMode("edit");
                          }}
                        />
                        <ModeButton
                          active={false}
                          icon={BookMarked}
                          label="Book"
                          onClick={() => {
                            if (!draft.folderId) {
                              toast.info("Put this note in a collection to read it as a book.");
                              return;
                            }
                            const ordered = orderedForBook(
                              notes.filter((n) => n.folderId === draft.folderId && !n.isArchived),
                              workspace.bookOrder[draft.folderId],
                            );
                            setBookFolderId(draft.folderId);
                            setBookIndex(
                              Math.max(
                                0,
                                ordered.findIndex((n) => n.id === draft.id),
                              ),
                            );
                          }}
                        />
                        <ModeButton
                          active={focusMode}
                          icon={focusMode ? Minimize2 : Maximize2}
                          label="Focus"
                          onClick={() => setFocusMode((v) => !v)}
                        />
                      </div>
                      {docMode === "edit" && (
                        <Select
                          value={draft.noteType}
                          onValueChange={(value) =>
                            changeDraft({ noteType: value as KnowledgeNoteType })
                          }
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
                      )}
                      {docMode === "edit" && (
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
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn("h-8 w-8 p-0", workspace.drawerOpen && "text-cyan-200")}
                          onClick={() => vaultWorkspace.setDrawer(!workspace.drawerOpen)}
                          title="Context drawer"
                          aria-label="Toggle context drawer"
                        >
                          <PanelRight className="h-4 w-4" />
                        </Button>
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
                              onClick={() =>
                                vaultWorkspace.setStatus(
                                  draft.id,
                                  isReference ? "saved" : "reference",
                                )
                              }
                            >
                              <SquareStack className="mr-2 h-4 w-4" />
                              {isReference ? "Unlock (allow editing)" : "Mark as reference"}
                            </DropdownMenuItem>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setExpanded(true)}
                          title="Expand note to full-screen editor"
                        >
                          <Maximize2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            if (dirty && draftRef.current) void persistDraft(draftRef.current);
                            setPrintTarget(draftRef.current ?? draft);
                          }}
                          title="Print note"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {docMode === "edit" ? (
                      <Input
                        value={draft.title}
                        onChange={(event) => changeDraft({ title: event.target.value })}
                        onBlur={() => {
                          if (dirty && draftRef.current) void persistDraft(draftRef.current);
                        }}
                        className="mt-3 h-auto border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
                        placeholder="Untitled note"
                      />
                    ) : (
                      <h2 className="mt-3 text-2xl font-semibold text-foreground">
                        {draft.title || "Untitled note"}
                      </h2>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                      <span style={{ color: typeConfig(draft.noteType).color }}>
                        {typeConfig(draft.noteType).singular}
                      </span>
                      {isReference && (
                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-amber-100">
                          Reference
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock3 className="h-3 w-3" />
                        Updated{" "}
                        {formatDistanceToNow(new Date(draft.updatedAt), { addSuffix: true })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {(draft.attachments ?? []).length} attachment
                        {(draft.attachments ?? []).length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {docMode === "edit" ? (
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
                    ) : draft.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        {draft.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-cyan-300/15 bg-cyan-300/5 px-2 py-0.5 text-[11px] text-cyan-100/80"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {docMode === "edit" && (
                      <NoteViewModeBar
                        versionCount={(draft.versions ?? []).length}
                        onOpenVersions={() => setVersionsOpen(true)}
                        hasOrganized={Boolean(draft.aiGeneratedAt)}
                        stale={aiIsStale}
                        generatedAt={draft.aiGeneratedAt}
                        aiEnabled={aiSettings.enabled}
                        busy={aiOrganizing}
                        onGenerate={() => void organizeWithAi()}
                      />
                    )}
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    {docMode === "reader" ? (
                      <div className="px-6 py-8 sm:px-10">
                        {versionPreview ? (
                          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                            <History className="h-3.5 w-3.5" />
                            Viewing “{versionPreview.label}” from{" "}
                            {formatDistanceToNow(new Date(versionPreview.createdAt), {
                              addSuffix: true,
                            })}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[11px]"
                              onClick={() => setCompareVersion((v) => !v)}
                            >
                              {compareVersion ? "Hide current" : "Compare with current"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[11px]"
                              onClick={() => {
                                setVersionPreview(null);
                                setCompareVersion(false);
                              }}
                            >
                              <Undo2 className="mr-1 h-3 w-3" /> Back to current
                            </Button>
                          </div>
                        ) : null}
                        {versionPreview && compareVersion ? (
                          <div className="grid gap-6 lg:grid-cols-2">
                            <NoteReader html={versionPreview.html} compact />
                            <NoteReader html={draft.contentHtml} compact />
                          </div>
                        ) : (
                          <NoteReader html={versionPreview?.html ?? draft.contentHtml} />
                        )}
                      </div>
                    ) : (
                      <div className="p-4">
                        <KnowledgeContentWorkspace
                          html={draft.contentHtml}
                          aiGenerated={Boolean(draft.aiGeneratedAt)}
                          onChange={(contentHtml) => changeDraft({ contentHtml })}
                          minHeight="calc(100vh - 28rem)"
                        />
                        <AttachmentsPanel
                          attachments={draft.attachments ?? []}
                          onAdd={(files) => void addAttachments(files)}
                          onRemove={removeAttachment}
                          onRename={renameAttachment}
                          onPreview={setAttachmentPreview}
                        />
                      </div>
                    )}
                  </ScrollArea>
                  <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-muted-foreground">
                    <span>
                      {htmlToPlainText(draft.contentHtml).split(/\s+/).filter(Boolean).length} words
                    </span>
                    <div className="flex items-center gap-2">
                      {docMode === "edit" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px]"
                          onClick={() => void saveAndRead()}
                        >
                          <Check className="mr-1 h-3 w-3" /> Save &amp; read
                        </Button>
                      )}
                      <span
                        className={cn(
                          saving && "text-cyan-200",
                          dirty && !saving && "text-amber-200",
                        )}
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
                      Capture a work note, turn a process into training, save a reusable AI prompt,
                      or build a step-by-step procedure.
                    </p>
                    <Button className="mt-5" onClick={() => void createNote()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create your first note
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {draft && !focusMode ? (
            <ContextDrawer
              open={workspace.drawerOpen}
              tab={workspace.drawerTab}
              onTabChange={(tab) => vaultWorkspace.setDrawerTab(tab)}
              onClose={() => vaultWorkspace.setDrawer(false)}
              note={draft}
              folder={folderById.get(draft.folderId ?? "")}
              related={relatedNotes}
              onOpenRelated={(id) => selectNote(id)}
              onViewVersion={(version) => {
                setVersionPreview(version);
                setDocMode("reader");
              }}
            >
              <AttachmentsPanel
                attachments={draft.attachments ?? []}
                onAdd={(files) => void addAttachments(files)}
                onRemove={removeAttachment}
                onRename={renameAttachment}
                onPreview={setAttachmentPreview}
              />
            </ContextDrawer>
          ) : null}
        </div>
      </div>

      {printTarget ? (
        <PrintableNote
          note={printTarget}
          folderName={folderById.get(printTarget.folderId ?? "")?.name}
        />
      ) : null}

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

      <Dialog open={expanded && !!draft} onOpenChange={setExpanded}>
        <DialogContent className="max-w-5xl border-cyan-300/15 bg-background/95 p-0 shadow-[0_0_70px_oklch(0.7_0.2_270_/_0.18)] backdrop-blur-xl sm:max-w-5xl">
          <DialogHeader className="border-b border-white/10 px-5 py-3">
            <DialogTitle className="text-left">
              <Input
                value={draft?.title ?? ""}
                onChange={(event) => changeDraft({ title: event.target.value })}
                onBlur={() => {
                  if (dirty && draftRef.current) void persistDraft(draftRef.current);
                }}
                className="h-auto border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
                placeholder="Untitled note"
              />
            </DialogTitle>
            <DialogDescription className="sr-only">Expanded note editor</DialogDescription>
            {draft && (
              <NoteViewModeBar
                versionCount={(draft.versions ?? []).length}
                onOpenVersions={() => setVersionsOpen(true)}
                hasOrganized={Boolean(draft.aiGeneratedAt)}
                stale={aiIsStale}
                generatedAt={draft.aiGeneratedAt}
                aiEnabled={aiSettings.enabled}
                busy={aiOrganizing}
                onGenerate={() => void organizeWithAi()}
                compact
              />
            )}
          </DialogHeader>
          {draft ? (
            <div className="flex h-[80vh] flex-col">
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-5">
                  <KnowledgeContentWorkspace
                    html={draft.contentHtml}
                    aiGenerated={Boolean(draft.aiGeneratedAt)}
                    onChange={(contentHtml) => changeDraft({ contentHtml })}
                    minHeight="calc(80vh - 12rem)"
                  />
                  <AttachmentsPanel
                    attachments={draft.attachments ?? []}
                    onAdd={(files) => void addAttachments(files)}
                    onRemove={removeAttachment}
                    onRename={renameAttachment}
                    onPreview={setAttachmentPreview}
                  />
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between border-t border-white/10 px-5 py-2 text-[11px] text-muted-foreground">
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
          ) : null}
          <DialogFooter className="border-t border-white/10 px-5 py-3">
            <Button
              variant="ghost"
              onClick={() => {
                if (dirty && draftRef.current) void persistDraft(draftRef.current);
                setExpanded(false);
                setPrintTarget(draftRef.current ?? draft);
              }}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button variant="ghost" onClick={() => setExpanded(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-3xl border-violet-300/15 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-violet-300" />
              Archived versions
            </DialogTitle>
            <DialogDescription className="text-xs">
              Earlier text for this note, kept out of the way. Restore any version to make it the
              note again.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 pr-3">
              {(draft?.versions ?? []).length === 0 && (
                <div className="rounded-lg border border-white/10 bg-black/10 p-6 text-center text-sm text-muted-foreground">
                  No archived versions yet.
                </div>
              )}
              {(draft?.versions ?? []).map((version) => (
                <div key={version.id} className="rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-foreground">{version.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 border border-violet-300/20 bg-violet-400/10 px-2.5 text-[11px] text-violet-100 hover:bg-violet-400/20"
                      onClick={() => restoreVersion(version)}
                    >
                      <RefreshCw className="mr-1.5 h-3 w-3" />
                      Restore
                    </Button>
                  </div>
                  <div
                    className="rich-text-content max-h-48 overflow-auto rounded-lg border border-white/[0.06] bg-black/20 p-3 text-[13px] leading-6 text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(version.html) }}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVersionsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!attachmentPreview} onOpenChange={(v) => !v && setAttachmentPreview(null)}>
        <DialogContent className="max-w-4xl border-cyan-300/15 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="truncate">{attachmentPreview?.name}</DialogTitle>
            <DialogDescription className="text-xs">
              {attachmentPreview
                ? `${attachmentPreview.mimeType} · ${formatBytes(attachmentPreview.sizeBytes)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {attachmentPreview && (
            <div className="grid max-h-[70vh] place-items-center overflow-auto rounded-lg border border-white/10 bg-black/20 p-3">
              {attachmentPreview.isImage ? (
                <img
                  src={attachmentPreview.dataUrl}
                  alt={attachmentPreview.name}
                  className="max-h-[65vh] rounded object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
                  <FileIcon className="h-10 w-10 text-cyan-200/80" />
                  <div className="max-w-md break-all">{attachmentPreview.name}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {attachmentPreview && (
              <a
                href={attachmentPreview.dataUrl}
                download={attachmentPreview.name}
                className="inline-flex items-center gap-1.5 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-300/15"
              >
                <Download className="h-4 w-4" /> Download
              </a>
            )}
            <Button variant="ghost" onClick={() => setAttachmentPreview(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteViewModeBar({
  versionCount,
  onOpenVersions,
  hasOrganized,
  stale,
  generatedAt,
  aiEnabled,
  busy,
  onGenerate,
  compact = false,
}: {
  versionCount: number;
  onOpenVersions: () => void;
  hasOrganized: boolean;
  stale: boolean;
  generatedAt: string | null;
  aiEnabled: boolean;
  busy: boolean;
  onGenerate: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-300/10 bg-violet-400/[0.035] p-1.5",
        compact && "mt-1",
      )}
    >
      <button
        type="button"
        onClick={onOpenVersions}
        disabled={versionCount === 0}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-black/15 px-2.5 py-1 text-[11px] transition",
          versionCount === 0
            ? "cursor-not-allowed opacity-35"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        )}
        title="Earlier versions of this note, archived automatically"
      >
        <History className="h-3 w-3" />
        Versions
        {versionCount > 0 && (
          <span className="rounded-full bg-white/10 px-1.5 font-mono">{versionCount}</span>
        )}
      </button>

      {hasOrganized && (
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5",
              stale
                ? "border-amber-300/25 bg-amber-300/[0.06] text-amber-200"
                : "border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-200",
            )}
          >
            {stale ? "Edited since AI pass" : "AI-written version"}
          </span>
          {generatedAt && !compact && (
            <span className="hidden xl:inline">
              Generated {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      )}

      <Button
        type="button"
        size="sm"
        className="ml-auto h-7 border border-violet-300/20 bg-violet-400/10 px-2.5 text-[11px] text-violet-100 hover:bg-violet-400/20"
        variant="ghost"
        disabled={busy || !aiEnabled}
        onClick={onGenerate}
        title={
          aiEnabled
            ? "Rewrite this note with AI; the current text is archived to Versions"
            : "AI is turned off in settings"
        }
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        )}
        {busy ? "Organizing…" : hasOrganized ? "Re-run AI" : "Organize with AI"}
      </Button>
    </div>
  );
}

function KnowledgeContentWorkspace({
  html,
  aiGenerated,
  onChange,
  minHeight,
}: {
  html: string;
  aiGenerated: boolean;
  onChange: (html: string) => void;
  minHeight: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/75">
        {aiGenerated ? (
          <Sparkles className="h-3 w-3 text-violet-300" />
        ) : (
          <FileText className="h-3 w-3 text-cyan-300" />
        )}
        Note
        {aiGenerated && (
          <span className="normal-case tracking-normal text-muted-foreground">
            AI-written · earlier text in Versions
          </span>
        )}
      </div>
      <RichTextEditor
        value={html}
        onChange={onChange}
        placeholder="Start writing your note, training guide, prompt, or procedure…"
        minHeight={minHeight}
        editorClassName="text-[15px] leading-7"
        className={cn(
          "border-white/10 bg-black/10",
          aiGenerated && "border-violet-300/15 bg-violet-400/[0.025]",
        )}
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
  density = "comfortable",
  status = "saved",
  selected,
  onClick,
  checked,
  onToggleChecked,
  isRenaming,
  onStartRename,
  onFinishRename,
  folders,
  onPatch,
  onDelete,
  onPrint,
  showFolderChip,
}: {
  note: KnowledgeNote;
  folder?: KnowledgeFolder;
  density?: VaultDensity;
  status?: NoteStatus;
  selected: boolean;
  onClick: () => void;
  checked: boolean;
  onToggleChecked: () => void;
  isRenaming: boolean;
  onStartRename: () => void;
  onFinishRename: (nextTitle: string) => void;
  folders: KnowledgeFolder[];
  onPatch: (
    changes: Partial<
      Pick<KnowledgeNote, "folderId" | "noteType" | "isPinned" | "isFavorite" | "isArchived">
    >,
  ) => void;
  onDelete: () => void;
  onPrint: () => void;
  showFolderChip: boolean;
}) {
  const config = typeConfig(note.noteType);
  const Icon = config.icon;
  const preview = htmlToPlainText(note.contentHtml) || "Empty note — open it and start writing.";
  const compact = density === "compact";
  const cards = density === "cards";
  const [renameValue, setRenameValue] = useState(note.title);
  useEffect(() => {
    if (isRenaming) setRenameValue(note.title);
  }, [isRenaming, note.title]);
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative w-full cursor-pointer overflow-hidden rounded-xl border text-left transition",
        compact ? "p-2" : cards ? "p-4" : "p-3",
        selected
          ? "border-cyan-300/25 bg-cyan-300/[0.07] shadow-[0_0_22px_oklch(0.75_0.18_225_/_0.1)]"
          : "border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.045]",
        checked && "ring-1 ring-cyan-300/40",
      )}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, ${config.color}, transparent 72%)` }}
      />
      {selected && (
        <span className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-cyan-300 shadow-[0_0_8px_var(--cyan-glow)]" />
      )}
      <div className="flex items-start gap-2">
        <div
          className="relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5"
          onClick={stop}
          onKeyDown={stop}
        >
          <Icon
            className={cn(
              "h-3.5 w-3.5 transition-opacity",
              checked ? "opacity-0" : "opacity-100 group-hover:opacity-0",
            )}
            style={{ color: config.color }}
          />
          <div
            className={cn(
              "absolute inset-0 grid place-items-center transition-opacity",
              checked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => onToggleChecked()}
              aria-label="Select note"
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isRenaming ? (
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={stop}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") onFinishRename(renameValue);
                  else if (e.key === "Escape") onFinishRename(note.title);
                }}
                onBlur={() => onFinishRename(renameValue)}
                className="h-6 min-w-0 flex-1 border-cyan-300/30 bg-black/20 px-1.5 text-sm"
              />
            ) : (
              <div className="truncate text-sm font-medium text-foreground">{note.title}</div>
            )}
            {note.isPinned && <Pin className="h-3 w-3 shrink-0 text-cyan-200" />}
            {note.isFavorite && <Heart className="h-3 w-3 shrink-0 fill-pink-300 text-pink-300" />}
            {note.aiContentHtml && (
              <Sparkles
                className="h-3 w-3 shrink-0 text-violet-300"
                aria-label="AI-organized version available"
              />
            )}
          </div>
          {!compact && (
            <div
              className={cn(
                "mt-1 text-[11px] leading-relaxed text-muted-foreground",
                cards ? "line-clamp-4" : "line-clamp-2",
              )}
            >
              {preview}
            </div>
          )}
          {status === "reference" && (
            <span className="mt-1 inline-block rounded-full border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-100">
              Reference
            </span>
          )}
        </div>
        <div
          className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={stop}
          onKeyDown={stop}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title="Rename"
            aria-label="Rename note"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={stop}
                title="More actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onStartRename()}>
                <Pencil className="mr-2 h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPrint()}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPatch({ isPinned: !note.isPinned })}>
                {note.isPinned ? (
                  <>
                    <PinOff className="mr-2 h-4 w-4" /> Unpin
                  </>
                ) : (
                  <>
                    <Pin className="mr-2 h-4 w-4" /> Pin
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPatch({ isFavorite: !note.isFavorite })}>
                <Heart
                  className={cn("mr-2 h-4 w-4", note.isFavorite && "fill-pink-300 text-pink-300")}
                />
                {note.isFavorite ? "Remove favorite" : "Favorite"}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="mr-2 h-4 w-4" /> Move to folder
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => onPatch({ folderId: null })}>
                    {note.folderId === null ? (
                      <Check className="mr-2 h-4 w-4 text-cyan-300" />
                    ) : (
                      <span className="mr-2 inline-block h-4 w-4" />
                    )}
                    Unfiled
                  </DropdownMenuItem>
                  {folders.length > 0 && <DropdownMenuSeparator />}
                  {folders.map((f) => (
                    <DropdownMenuItem key={f.id} onClick={() => onPatch({ folderId: f.id })}>
                      {note.folderId === f.id ? (
                        <Check className="mr-2 h-4 w-4 text-cyan-300" />
                      ) : (
                        <span
                          className="mr-2 inline-block h-3 w-3 rounded-full"
                          style={{ background: f.color }}
                        />
                      )}
                      {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FileText className="mr-2 h-4 w-4" /> Change type
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {NOTE_TYPES.map((t) => (
                    <DropdownMenuItem key={t.value} onClick={() => onPatch({ noteType: t.value })}>
                      {note.noteType === t.value ? (
                        <Check className="mr-2 h-4 w-4 text-cyan-300" />
                      ) : (
                        <t.icon className="mr-2 h-4 w-4" style={{ color: t.color }} />
                      )}
                      {t.singular}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onPatch({ isArchived: !note.isArchived })}>
                <Archive className="mr-2 h-4 w-4" />
                {note.isArchived ? "Restore from archive" : "Move to archive"}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-rose-300" onClick={() => onDelete()}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete permanently
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {(note.tags.length > 0 || (note.attachments ?? []).length > 0) && (
        <div className="mt-2 flex min-w-0 items-center gap-1 overflow-hidden text-[10px] text-muted-foreground">
          {note.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="max-w-24 truncate rounded-full border border-cyan-300/10 bg-cyan-300/[0.04] px-1.5 py-0.5 text-cyan-100/65"
            >
              #{tag}
            </span>
          ))}
          {note.tags.length > 2 && <span>+{note.tags.length - 2}</span>}
          {(note.attachments ?? []).length > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <Paperclip className="h-2.5 w-2.5" /> {(note.attachments ?? []).length}
            </span>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-muted-foreground">{config.singular}</span>
          {showFolderChip && folder && (
            <span
              className="truncate rounded-full border px-1.5 py-[1px]"
              style={{ color: folder.color, borderColor: `${folder.color}55` }}
            >
              {folder.name}
            </span>
          )}
        </span>
        <span className="shrink-0">
          {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
        </span>
      </div>
    </div>
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

function AttachmentsPanel({
  attachments,
  onAdd,
  onRemove,
  onRename,
  onPreview,
}: {
  attachments: KnowledgeAttachment[];
  onAdd: (files: FileList | File[] | null) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, nextName: string) => void;
  onPreview: (a: KnowledgeAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {attachments.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onAdd(e.target.files);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onAdd(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border border-dashed p-3 transition",
          dragOver ? "border-cyan-300/60 bg-cyan-300/[0.08]" : "border-white/10 bg-white/[0.02]",
        )}
      >
        {attachments.length === 0 ? (
          <div className="py-4 text-center text-[11px] text-muted-foreground">
            Drop files here, click <span className="text-foreground">Upload</span>, or paste an
            image (Ctrl/⌘+V) to attach it to this note.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/30"
              >
                <button
                  type="button"
                  onClick={() => onPreview(a)}
                  className="block h-24 w-full"
                  title={a.name}
                >
                  {a.isImage ? (
                    <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-[10px] text-muted-foreground">
                      <FileIcon className="h-6 w-6 text-cyan-200/80" />
                      <span className="line-clamp-2 break-all">{a.name}</span>
                    </div>
                  )}
                </button>
                <div className="flex items-center justify-between gap-1 border-t border-white/10 bg-black/40 px-2 py-1 text-[10px] text-muted-foreground">
                  {renamingId === a.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        onRename(a.id, renameValue);
                        setRenamingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onRename(a.id, renameValue);
                          setRenamingId(null);
                        } else if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="min-w-0 flex-1 rounded bg-black/40 px-1 text-[10px] text-foreground outline-none ring-1 ring-cyan-300/30"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(a.id);
                        setRenameValue(a.name);
                      }}
                      className="truncate text-left hover:text-foreground"
                      title={`${a.name} · ${formatBytes(a.sizeBytes)}`}
                    >
                      {a.name}
                    </button>
                  )}
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <a
                      href={a.dataUrl}
                      download={a.name}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded p-0.5 hover:bg-white/10 hover:text-foreground"
                      title="Download"
                    >
                      <Download className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onRemove(a.id)}
                      className="rounded p-0.5 hover:bg-rose-500/20 hover:text-rose-200"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Small segmented control used for Reader / Edit / Book / Focus. */
function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Eye;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground",
        active &&
          "bg-cyan-300/12 text-foreground shadow-[inset_0_0_0_1px_oklch(0.8_0.14_210_/_0.35)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function SectionTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof FileText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground transition hover:border-cyan-300/30 hover:text-foreground",
        active && "border-cyan-300/45 bg-cyan-300/10 text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
