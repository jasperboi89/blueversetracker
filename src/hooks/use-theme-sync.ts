import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getThemePrefs,
  setThemePrefs,
} from "@/lib/settings/theme.functions";
import { themeStore, useThemeState } from "@/lib/settings/theme-store";

/**
 * Sync local theme store with Lovable Cloud per-user prefs.
 * - On mount: pull from server, hydrate local store.
 * - On local change: debounce-push to server.
 * Mount once inside the authenticated layout.
 */
export function useThemeSync() {
  const get = useServerFn(getThemePrefs);
  const set = useServerFn(setThemePrefs);
  const state = useThemeState();
  const hydratedRef = useRef(false);
  const lastPushed = useRef<string>("");

  // Pull once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await get();
        if (cancelled) return;
        themeStore.update((c) => ({
          ...c,
          theme: res.theme,
          qbFirstEntryCompleted: res.qbFirstEntryCompleted,
        }));
      } catch {
        // offline / not signed in — keep local
      } finally {
        hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [get]);

  // Push on change (after first hydration).
  useEffect(() => {
    if (!hydratedRef.current) return;
    const payload = JSON.stringify({
      theme: state.theme,
      qbFirstEntryCompleted: state.qbFirstEntryCompleted,
    });
    if (payload === lastPushed.current) return;
    lastPushed.current = payload;
    const t = setTimeout(() => {
      set({
        data: {
          theme: state.theme,
          qbFirstEntryCompleted: state.qbFirstEntryCompleted,
        },
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [set, state.theme, state.qbFirstEntryCompleted]);
}