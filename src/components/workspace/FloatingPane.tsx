import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, GripVertical, Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bringToFront,
  clampRect,
  defaultToRect,
  getStoredRect,
  patchPane,
  usePaneLayout,
  PANE_MIN_H,
  PANE_MIN_W,
  type PaneDefault,
  type PaneRect,
} from "@/lib/workspace/pane-layout-store";
import { useCanvasSize } from "./PaneCanvas";

interface FloatingPaneProps {
  id: string;
  title: string;
  chip?: string;
  def: PaneDefault;
  children: ReactNode;
}

/**
 * One translucent-glass window: drag via the title bar, resize from the
 * bottom-right, lock (freezes both), collapse to the title bar. Geometry is
 * persisted per layout preset. Motion is limited to a grab-lift shadow that
 * the reduced-motion CSS kill-switch neutralizes.
 */
export function FloatingPane({ id, title, chip, def, children }: FloatingPaneProps) {
  const layout = usePaneLayout();
  const { width: cw, height: ch } = useCanvasSize();
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    rect: PaneRect;
    raf: number;
  } | null>(null);

  const rect = useMemo<PaneRect>(() => {
    const base = defaultToRect(def, cw, ch);
    const stored = getStoredRect(layout, id);
    const merged: PaneRect = { ...base, ...stored } as PaneRect;
    return clampRect(merged, cw, ch);
  }, [layout, id, cw, ch, def]);

  const locked = rect.locked;

  const onPointerDown = useCallback(
    (mode: "move" | "resize") => (e: React.PointerEvent) => {
      if (locked) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      bringToFront(id);
      dragState.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        rect,
        raf: 0,
      };
      setDragging(true);
    },
    [locked, id, rect],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragState.current;
      if (!st) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      if (st.raf) return;
      st.raf = requestAnimationFrame(() => {
        st.raf = 0;
        if (st.mode === "move") {
          patchPane(id, clampMove(st.rect, dx, dy, cw, ch));
        } else {
          patchPane(id, clampResize(st.rect, dx, dy, cw, ch));
        }
      });
    },
    [id, cw, ch],
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    const st = dragState.current;
    if (st?.raf) cancelAnimationFrame(st.raf);
    dragState.current = null;
    setDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <section
      className={cn(
        "glass-panel absolute flex flex-col overflow-hidden",
        dragging && "glass-panel-lifted",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.collapsed ? undefined : rect.h,
        zIndex: rect.z,
      }}
      onPointerDownCapture={() => bringToFront(id)}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 select-none",
          locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <GripVertical
            className={cn("h-3.5 w-3.5 shrink-0", locked ? "opacity-20" : "text-muted-foreground")}
          />
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
          {chip && (
            <span className="shrink-0 rounded-full border border-border/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
              {chip}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            title={rect.collapsed ? "Expand" : "Collapse"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => patchPane(id, { collapsed: !rect.collapsed })}
          >
            {rect.collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            title={locked ? "Unlock pane" : "Lock pane"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => patchPane(id, { locked: !locked })}
          >
            {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {!rect.collapsed && (
        <div className="min-h-0 flex-1 overflow-auto border-t border-border/30 p-3">{children}</div>
      )}

      {!rect.collapsed && !locked && (
        <div
          className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize"
          style={{
            background: "linear-gradient(135deg, transparent 50%, oklch(0.78 0.18 220 / 0.5) 50%)",
            touchAction: "none",
          }}
          onPointerDown={onPointerDown("resize")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}
    </section>
  );
}

function clampMove(
  rect: PaneRect,
  dx: number,
  dy: number,
  cw: number,
  ch: number,
): Partial<PaneRect> {
  const x = Math.max(0, Math.min(rect.x + dx, Math.max(0, cw - rect.w)));
  const y = Math.max(0, Math.min(rect.y + dy, Math.max(0, ch - Math.min(rect.h, 48))));
  return { x, y };
}

function clampResize(
  rect: PaneRect,
  dx: number,
  dy: number,
  cw: number,
  ch: number,
): Partial<PaneRect> {
  const w = Math.max(PANE_MIN_W, Math.min(rect.w + dx, cw - rect.x));
  const h = Math.max(PANE_MIN_H, Math.min(rect.h + dy, ch - rect.y));
  return { w, h };
}
