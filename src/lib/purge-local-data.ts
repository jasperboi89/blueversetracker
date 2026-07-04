/**
 * HIPAA workstation hygiene: every app store persists under the "aih:" prefix
 * in localStorage (tickets, dispatch sessions, notes — ticket bodies can
 * contain PHI). On sign-out that local mirror must be wiped so nothing is
 * readable by the next person at a shared desk. Cloud copies in
 * user_store_blobs are the durable source; they re-hydrate on next sign-in.
 */
const APP_STORAGE_PREFIX = "aih:";

export function purgeLocalAppData(): void {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(APP_STORAGE_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode etc.) — nothing persisted to purge.
  }
}
