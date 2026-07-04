import { supabase } from "@/integrations/supabase/client";

/**
 * Cloud-sync a store via a single JSON blob per user.
 *
 * Flow on first call (browser only):
 *  1. Wait for the current Supabase auth session.
 *  2. Fetch the row at user_store_blobs(user_id, store_key). If a row exists,
 *     hand the cloud snapshot to `applyServerSnapshot` (which replaces the
 *     in-memory state and persists locally). If no cloud row exists, upload
 *     the current local snapshot as a one-time import.
 *  3. Subscribe to store changes; on each change, debounce-upsert the
 *     snapshot back to the cloud.
 *  4. Subscribe to auth state changes; on sign-in by a different user,
 *     re-hydrate. On sign-out, stop syncing.
 */
export interface CloudSyncOptions<TState> {
  storeKey: string;
  getSnapshot: () => TState;
  applyServerSnapshot: (state: TState) => void;
  subscribe: (cb: () => void) => () => void;
  /** Optional shallow-empty check used to skip the auto-upload step. */
  isEmpty?: (state: TState) => boolean;
}

const TABLE = "user_store_blobs";
const DEBOUNCE_MS = 800;

const registered = new Set<string>();

export function attachCloudSync<TState>(opts: CloudSyncOptions<TState>): void {
  if (typeof window === "undefined") return;
  if (registered.has(opts.storeKey)) return;
  registered.add(opts.storeKey);

  let activeUserId: string | null = null;
  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let storeUnsub: (() => void) | null = null;
  let lastPushedJson: string | null = null;

  const RETRY_MS = 10_000;

  const push = async () => {
    if (!activeUserId) return;
    let snap: TState;
    try { snap = opts.getSnapshot(); } catch { return; }
    let json: string;
    try { json = JSON.stringify(snap); } catch { return; }
    if (json === lastPushedJson) return;
    try {
      const { error } = await supabase
        .from(TABLE)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ user_id: activeUserId, store_key: opts.storeKey, data: snap as any }, { onConflict: "user_id,store_key" });
      if (error) throw error;
      // Mark as pushed only after the write succeeds; on failure the next
      // change (or the retry below) will re-attempt instead of silently
      // dropping this snapshot.
      lastPushedJson = json;
    } catch (err) {
      console.error(`[cloud-sync:${opts.storeKey}] push failed, retrying`, err);
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(push, RETRY_MS);
    }
  };

  const schedulePush = () => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(push, DEBOUNCE_MS);
  };

  const hydrateForUser = async (userId: string) => {
    activeUserId = userId;
    lastPushedJson = null;
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("data")
        .eq("user_id", userId)
        .eq("store_key", opts.storeKey)
        .maybeSingle();
      if (error) throw error;
      if (data?.data) {
        try {
          opts.applyServerSnapshot(data.data as TState);
          lastPushedJson = JSON.stringify(data.data);
        } catch (err) {
          console.error(`[cloud-sync:${opts.storeKey}] apply failed`, err);
        }
      } else {
        // First time for this user — upload current local state if it has anything.
        const localSnap = opts.getSnapshot();
        if (!opts.isEmpty || !opts.isEmpty(localSnap)) {
          await push();
        }
      }
    } catch (err) {
      console.error(`[cloud-sync:${opts.storeKey}] hydrate failed`, err);
    }

    // Attach store listener (once per user session).
    if (!storeUnsub) {
      storeUnsub = opts.subscribe(() => {
        if (activeUserId) schedulePush();
      });
    }
  };

  const stopSyncing = () => {
    activeUserId = null;
    lastPushedJson = null;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (storeUnsub) { storeUnsub(); storeUnsub = null; }
  };

  // Initial session check
  void supabase.auth.getSession().then(({ data }) => {
    const uid = data.session?.user?.id;
    if (uid) void hydrateForUser(uid);
  });

  // Auth listener
  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id ?? null;
    if (event === "SIGNED_OUT" || !uid) {
      stopSyncing();
      return;
    }
    if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
      if (uid !== activeUserId) void hydrateForUser(uid);
    }
  });
}