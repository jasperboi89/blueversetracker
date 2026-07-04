import { useEffect } from "react";
import { useEffectiveMotion } from "@/lib/settings/display-prefs-store";

/**
 * Publishes the cursor position as --pointer-x/--pointer-y (viewport px) on
 * <html>. Every .glass-panel reads them through a viewport-fixed radial
 * gradient, giving a specular highlight that sweeps across panels as the
 * cursor moves — one rAF-throttled listener for the whole app, no per-panel
 * JS. Disabled under reduced motion (the vars stay off-screen, so the
 * highlight simply never appears).
 */
export function usePointerGlow() {
  const motion = useEffectiveMotion();
  useEffect(() => {
    if (typeof window === "undefined" || motion === "reduced") return;
    const root = document.documentElement;
    let raf = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty("--pointer-x", `${x}px`);
        root.style.setProperty("--pointer-y", `${y}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
      root.style.removeProperty("--pointer-x");
      root.style.removeProperty("--pointer-y");
    };
  }, [motion]);
}
