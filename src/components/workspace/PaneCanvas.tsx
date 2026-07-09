import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Lock, LockOpen, RotateCcw, Monitor, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PRESET_NAMES,
  resetActivePreset,
  setActivePreset,
  setAllLocked,
  usePaneLayout,
  type PresetName,
} from "@/lib/workspace/pane-layout-store";

interface CanvasSize {
  width: number;
  height: number;
}
const CanvasSizeContext = createContext<CanvasSize>({ width: 0, height: 0 });
export function useCanvasSize(): CanvasSize {
  return useContext(CanvasSizeContext);
}

const PRESET_ICON: Record<PresetName, typeof Monitor> = {
  Single: Monitor,
  Dual: MonitorSmartphone,
};

/**
 * Free-floating "desk" that hosts absolutely-positioned FloatingPanes. Measures
 * its own box (ResizeObserver) so panes can compute percent defaults and clamp
 * to the visible area. Renders a toolbar for lock-all / reset / preset switch.
 */
export function PaneCanvas({ paneIds, children }: { paneIds: string[]; children: ReactNode }) {
  const layout = usePaneLayout();
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rects = layout.presets[layout.activePreset] ?? {};
  const allLocked = paneIds.length > 0 && paneIds.every((id) => rects[id]?.locked);

  return (
    <div className="flex flex-col gap-3">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-1">
          {PRESET_NAMES.map((p) => {
            const Icon = PRESET_ICON[p];
            const active = layout.activePreset === p;
            return (
              <Button
                key={p}
                size="sm"
                variant="ghost"
                className={active ? "h-7 text-foreground" : "h-7 text-muted-foreground"}
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.5), oklch(0.4 0.18 290 / 0.4))",
                        border: "1px solid oklch(0.78 0.18 220 / 0.4)",
                      }
                    : undefined
                }
                onClick={() => setActivePreset(p)}
              >
                <Icon className="mr-1 h-3.5 w-3.5" />
                {p}
              </Button>
            );
          })}
          <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Layout
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground"
            onClick={() => setAllLocked(!allLocked, paneIds)}
          >
            {allLocked ? (
              <>
                <LockOpen className="mr-1 h-3.5 w-3.5" /> Unlock all
              </>
            ) : (
              <>
                <Lock className="mr-1 h-3.5 w-3.5" /> Lock all
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground"
            onClick={resetActivePreset}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </div>

      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded-2xl"
        style={{ height: "calc(100vh - 210px)", minHeight: 520 }}
      >
        <CanvasSizeContext.Provider value={size}>
          {size.width > 0 ? children : null}
        </CanvasSizeContext.Provider>
      </div>
    </div>
  );
}

/** True on viewport widths where floating panes would be cramped (use the stacked fallback). */
export function useIsNarrow(breakpoint = 1024): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return narrow;
}
