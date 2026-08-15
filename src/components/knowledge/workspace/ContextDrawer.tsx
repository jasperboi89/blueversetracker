import { formatDistanceToNow } from "date-fns";
import {
  Clock3,
  FileText,
  History,
  Info,
  Link2,
  Paperclip,
  Sparkles,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  KnowledgeFolder,
  KnowledgeNote,
  KnowledgeNoteVersion,
} from "@/lib/knowledge/knowledge.functions";
import type { ContextTab } from "@/lib/knowledge/vault-workspace-store";

const TABS: Array<{ id: ContextTab; label: string; icon: typeof Info }> = [
  { id: "details", label: "Details", icon: Info },
  { id: "versions", label: "Versions", icon: History },
  { id: "tags", label: "Tags", icon: TagIcon },
  { id: "attachments", label: "Files", icon: Paperclip },
  { id: "related", label: "Related", icon: Link2 },
];

/**
 * Right-hand contextual drawer. Metadata lives here instead of eating
 * document width; it stays closed until the operator opens it.
 */
export function ContextDrawer({
  open,
  tab,
  onTabChange,
  onClose,
  note,
  folder,
  related,
  onOpenRelated,
  onViewVersion,
  children,
}: {
  open: boolean;
  tab: ContextTab;
  onTabChange: (tab: ContextTab) => void;
  onClose: () => void;
  note: KnowledgeNote;
  folder?: KnowledgeFolder;
  related: KnowledgeNote[];
  onOpenRelated: (id: string) => void;
  onViewVersion: (version: KnowledgeNoteVersion) => void;
  /** Attachments panel supplied by the vault so upload/paste logic stays in one place. */
  children?: React.ReactNode;
}) {
  const versions = note.versions ?? [];
  const attachments = note.attachments ?? [];

  return (
    <aside
      data-slot="vault-context-drawer"
      aria-hidden={!open}
      aria-label="Document context"
      className={cn(
        "absolute inset-y-0 right-0 z-20 flex w-[min(24rem,88vw)] flex-col overflow-hidden",
        "border-l border-white/10 bg-background/95 backdrop-blur-xl transition-transform duration-200",
        open ? "translate-x-0" : "pointer-events-none translate-x-full",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Context
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onClose}
          aria-label="Close context drawer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-white/10 px-2 py-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            aria-current={tab === item.id}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
              tab === item.id && "border-cyan-300/35 bg-cyan-300/10 text-foreground",
            )}
          >
            <item.icon className="h-3 w-3" />
            {item.label}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3 text-xs text-muted-foreground">
          {tab === "details" && (
            <dl className="space-y-2">
              <Row label="Created" value={new Date(note.createdAt).toLocaleString()} />
              <Row
                label="Updated"
                value={formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
              />
              <Row label="Collection" value={folder?.name ?? "Unfiled"} />
              <Row label="Type" value={note.noteType} />
              <Row label="Attachments" value={String(attachments.length)} />
              <Row label="Versions" value={String(versions.length)} />
              {note.aiGeneratedAt && (
                <Row
                  label="AI pass"
                  value={formatDistanceToNow(new Date(note.aiGeneratedAt), { addSuffix: true })}
                />
              )}
            </dl>
          )}

          {tab === "versions" && (
            <div className="space-y-2">
              {versions.length === 0 && <Empty text="No archived versions yet." />}
              {versions.map((version) => (
                <div key={version.id} className="rounded-lg border border-white/10 bg-black/15 p-2">
                  <div className="truncate text-[12px] text-foreground">{version.label}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                    <Clock3 className="h-3 w-3" />
                    {new Date(version.createdAt).toLocaleString()}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1.5 h-6 px-2 text-[11px] text-violet-100"
                    onClick={() => onViewVersion(version)}
                  >
                    <History className="mr-1 h-3 w-3" /> View read-only
                  </Button>
                </div>
              ))}
            </div>
          )}

          {tab === "tags" && (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.length === 0 && <Empty text="No tags on this note." />}
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-2 py-0.5 text-[11px] text-cyan-100/80"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {tab === "attachments" && (children ?? <Empty text="No attachments." />)}

          {tab === "related" && (
            <div className="space-y-1.5">
              {related.length === 0 && (
                <Empty text="Nothing related yet — related notes come from shared tags and collection." />
              )}
              {related.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenRelated(item.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-left text-[12px] text-muted-foreground transition hover:border-cyan-300/25 hover:text-foreground"
                >
                  {item.aiGeneratedAt ? (
                    <Sparkles className="h-3 w-3 shrink-0 text-violet-300" />
                  ) : (
                    <FileText className="h-3 w-3 shrink-0 text-cyan-300" />
                  )}
                  <span className="truncate">{item.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] pb-1.5">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{label}</dt>
      <dd className="truncate text-[12px] text-foreground/90">{value}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-[11px]">
      {text}
    </div>
  );
}