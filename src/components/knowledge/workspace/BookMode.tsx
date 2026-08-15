import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Bookmark, ChevronLeft, ChevronRight, Columns2, List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { KnowledgeNote } from "@/lib/knowledge/knowledge.functions";
import { NoteReader } from "./NoteReader";

/**
 * Immersive reader over an ordered collection. Pure presentation: it renders
 * the same note HTML the vault already stores, one page (or spread) at a time.
 */
export function BookMode({
  title,
  notes,
  index,
  onIndexChange,
  onExit,
  bookmarkedId,
  onBookmark,
}: {
  title: string;
  notes: KnowledgeNote[];
  index: number;
  onIndexChange: (next: number) => void;
  onExit: () => void;
  bookmarkedId?: string;
  onBookmark: (noteId: string) => void;
}) {
  const [tocOpen, setTocOpen] = useState(false);
  const [spread, setSpread] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const wide = useWideViewport(1280);
  const twoUp = spread && wide && notes.length > 1;
  const step = twoUp ? 2 : 1;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(notes.length - 1, 0));
  const current = notes[safeIndex];

  const go = useCallback(
    (delta: number) => {
      const next = safeIndex + delta;
      if (next < 0 || next >= notes.length) return;
      setDirection(delta > 0 ? "next" : "prev");
      onIndexChange(next);
    },
    [safeIndex, notes.length, onIndexChange],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(step);
      else if (event.key === "ArrowLeft") go(-step);
      else if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, step, onExit]);

  if (!current) return null;

  return (
    <div
      data-slot="vault-book"
      className="relative flex h-[calc(100vh-9rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/80"
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0 text-cyan-200" />
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setTocOpen((v) => !v)}
            aria-expanded={tocOpen}
          >
            <List className="mr-1.5 h-3.5 w-3.5" /> Contents
          </Button>
          {wide && (
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-7 text-xs", twoUp && "text-cyan-100")}
              onClick={() => setSpread((v) => !v)}
              aria-pressed={twoUp}
            >
              <Columns2 className="mr-1.5 h-3.5 w-3.5" /> Spread
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className={cn("h-7 text-xs", bookmarkedId === current.id && "text-amber-200")}
            onClick={() => onBookmark(current.id)}
            aria-label="Bookmark this page"
          >
            <Bookmark className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onExit}>
            <X className="mr-1.5 h-3.5 w-3.5" /> Exit book
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div
            key={safeIndex}
            data-direction={direction}
            className={cn(
              "vault-page-turn grid gap-8 px-6 py-8",
              twoUp ? "lg:grid-cols-2" : "grid-cols-1",
            )}
          >
            <BookPage note={current} position={safeIndex + 1} total={notes.length} />
            {twoUp && notes[safeIndex + 1] && (
              <BookPage note={notes[safeIndex + 1]} position={safeIndex + 2} total={notes.length} />
            )}
          </div>
        </ScrollArea>

        {tocOpen && (
          <nav
            aria-label="Table of contents"
            className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] border-r border-white/10 bg-background/95 backdrop-blur-xl"
          >
            <ScrollArea className="h-full">
              <ol className="space-y-1 p-3">
                {notes.map((note, i) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      aria-current={i === safeIndex}
                      onClick={() => {
                        setDirection(i >= safeIndex ? "next" : "prev");
                        onIndexChange(i);
                        setTocOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-white/5 hover:text-foreground",
                        i === safeIndex && "bg-cyan-300/10 text-foreground",
                      )}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground/70">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{note.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </nav>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-[11px] text-muted-foreground">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={safeIndex === 0}
          onClick={() => go(-step)}
        >
          <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
        </Button>
        <span className="truncate">
          {current.title} • {safeIndex + 1} / {notes.length}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={safeIndex + step >= notes.length}
          onClick={() => go(step)}
        >
          Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </footer>
    </div>
  );
}

function BookPage({
  note,
  position,
  total,
}: {
  note: KnowledgeNote;
  position: number;
  total: number;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-4 border-b border-white/[0.07] pb-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
          Page {position} of {total}
        </div>
        <h2 className="mt-1 text-xl font-semibold text-foreground">{note.title}</h2>
      </div>
      <NoteReader html={note.contentHtml} compact />
    </section>
  );
}

function useWideViewport(min: number) {
  const [wide, setWide] = useState(false);
  const ref = useRef(min);
  ref.current = min;
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width: ${ref.current}px)`);
    setWide(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}
