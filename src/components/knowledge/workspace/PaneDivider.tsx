import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface PaneDividerProps {
  /** Current width of the pane to the LEFT of this divider. */
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  onReset: () => void;
  label: string;
}

/**
 * Draggable, keyboard-accessible boundary between two workspace panes.
 * Pointer drag resizes; arrow keys nudge; Home/End snap to min/max; a
 * double-click (or Enter) restores the pane's default width.
 */
export function PaneDivider({ value, min, max, onChange, onReset, label }: PaneDividerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { startX: event.clientX, startWidth: value };
    },
    [value],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state) return;
      onChange(state.startWidth + (event.clientX - state.startX));
    },
    [onChange],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-slot="vault-pane-divider"
      className={cn(
        "group relative hidden w-1.5 shrink-0 cursor-col-resize touch-none rounded-full",
        "transition-colors hover:bg-cyan-300/25 focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-cyan-300/60 xl:block",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(value - (event.shiftKey ? 48 : 16));
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(value + (event.shiftKey ? 48 : 16));
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(min);
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(max);
        } else if (event.key === "Enter") {
          event.preventDefault();
          onReset();
        }
      }}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.07] group-hover:bg-cyan-300/40" />
    </div>
  );
}
