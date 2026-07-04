import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  INACTIVITY_ACTIVITY_EVENTS,
  INACTIVITY_LOGOUT_MS,
  INACTIVITY_WARN_MS,
} from "@/lib/auth/inactivity-config";
import { logAuthEventAuthed } from "@/lib/auth/audit.functions";
import { purgeLocalAppData } from "@/lib/purge-local-data";
import { InactivityWarningModal } from "./InactivityWarningModal";

export function InactivityWatcher() {
  const [warnOpen, setWarnOpen] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loggingOutRef = useRef(false);
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function clearTimers() {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    warnTimerRef.current = null;
    logoutTimerRef.current = null;
  }

  async function performLogout(type: "session_timeout" | "logout") {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    clearTimers();
    try {
      await logAuthEventAuthed({ data: { type } });
    } catch {
      /* ignore */
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    purgeLocalAppData();
    // Full reload (not SPA navigation) so in-memory store state is dropped too.
    window.location.replace("/auth");
  }

  // Timers are anchored to the last-activity wall clock, not "N ms from now",
  // so a machine that slept through the deadline logs out as soon as timers
  // (or the visibility handler below) run again.
  function scheduleTimers() {
    clearTimers();
    const elapsed = Date.now() - lastActivityRef.current;
    warnTimerRef.current = setTimeout(
      () => setWarnOpen(true),
      Math.max(0, INACTIVITY_WARN_MS - elapsed),
    );
    logoutTimerRef.current = setTimeout(
      () => void performLogout("session_timeout"),
      Math.max(0, INACTIVITY_LOGOUT_MS - elapsed),
    );
  }

  function bumpActivity() {
    lastActivityRef.current = Date.now();
    if (warnOpen) return; // do not silently dismiss warning on background activity
    scheduleTimers();
  }

  useEffect(() => {
    scheduleTimers();
    const handler = () => bumpActivity();
    for (const ev of INACTIVITY_ACTIVITY_EVENTS) {
      window.addEventListener(ev, handler, { passive: true });
    }
    // Re-check the deadline when the tab becomes visible again — setTimeout is
    // throttled/paused in background tabs and across laptop sleep.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_LOGOUT_MS) {
        void performLogout("session_timeout");
      } else {
        if (elapsed >= INACTIVITY_WARN_MS) setWarnOpen(true);
        scheduleTimers();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      for (const ev of INACTIVITY_ACTIVITY_EVENTS) {
        window.removeEventListener(ev, handler);
      }
      document.removeEventListener("visibilitychange", onVisible);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bumpActivity(); /* route change */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function stay() {
    setWarnOpen(false);
    lastActivityRef.current = Date.now();
    scheduleTimers();
  }

  function signOutNow() {
    setWarnOpen(false);
    void performLogout("logout");
  }

  return (
    <InactivityWarningModal
      open={warnOpen}
      remainingMs={INACTIVITY_LOGOUT_MS - INACTIVITY_WARN_MS}
      onStay={stay}
      onSignOut={signOutNow}
    />
  );
}
