import { formatDistanceToNow } from "date-fns";
import { BookOpen, LibraryBig } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KnowledgeFolder, KnowledgeNote } from "@/lib/knowledge/knowledge.functions";

/** Archive-volume style browser for collections; an addition to the sidebar list. */
export function CollectionShelf({
  folders,
  notes,
  onOpen,
  onOpenBook,
}: {
  folders: KnowledgeFolder[];
  notes: KnowledgeNote[];
  onOpen: (folderId: string) => void;
  onOpenBook: (folderId: string) => void;
}) {
  if (folders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-muted-foreground">
        Create a collection to build your first archive volume.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {folders.map((folder) => {
        const inside = notes.filter((n) => n.folderId === folder.id && !n.isArchived);
        const latest = inside
          .map((n) => n.updatedAt)
          .sort()
          .at(-1);
        return (
          <div
            key={folder.id}
            className="glass-panel relative overflow-hidden p-4"
            style={{ boxShadow: `inset 3px 0 0 ${folder.color}` }}
          >
            <div className="flex items-start gap-3">
              <div
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10"
                style={{ background: `${folder.color}22` }}
              >
                <LibraryBig className="h-4 w-4" style={{ color: folder.color }} />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">{folder.name}</h3>
                <p className="line-clamp-2 text-[11px] text-muted-foreground">
                  {folder.description || "No description yet."}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>
                {inside.length} note{inside.length === 1 ? "" : "s"}
              </span>
              {latest && <span>{formatDistanceToNow(new Date(latest), { addSuffix: true })}</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => onOpen(folder.id)}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 border border-cyan-300/25 bg-cyan-300/10 text-xs text-cyan-100"
                disabled={inside.length === 0}
                onClick={() => onOpenBook(folder.id)}
              >
                <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Open as book
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
