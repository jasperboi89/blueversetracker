import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  INACTIVITY_ACTIVITY_EVENTS,
  INACTIVITY_LOGOUT_MS,
  INACTIVITY_WARN_MS,
} from "@/lib/auth/inactivity-config";
import { logAuthEventAuthed } from "@/lib/auth/audit.functions";
import { InactivityWarningModal } from "./InactivityWarningModal";

export function InactivityWatcher() {
  const [warnOpen, setWarnOpen] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function clearTimers() {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    warnTimerRef.current = null;
    logoutTimerRef.current = null;
  }

  function scheduleTimers() {
    clearTimers();
    warnTimerRef.current = setTimeout(() => setWarnOpen(true), INACTIVITY_WARN_MS);
    logoutTimerRef.current = setTimeout(async () => {
      try {
        await logAuthEventAuthed({ data: { type: "session_timeout" } });
      } catch { /* ignore */ }
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    }, INACTIVITY_LOGOUT_MS);
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
    return () => {
      for (const ev of INACTIVITY_ACTIVITY_EVENTS) {
        window.removeEventListener(ev, handler);
      }
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { bumpActivity(); /* route change */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function stay() {
    setWarnOpen(false);
    scheduleTimers();
  }

  async function signOutNow() {
    setWarnOpen(false);
    clearTimers();
    try { await logAuthEventAuthed({ data: { type: "logout" } }); } catch {}
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
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