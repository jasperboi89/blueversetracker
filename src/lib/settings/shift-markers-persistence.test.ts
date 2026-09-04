import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Break markers must survive logout/login. They are a user-scoped preference
 * synced through the shared `user_store_blobs` blob-sync, so these tests drive
 * a fake cloud table and a fake auth session and simulate real sign-in /
 * sign-out cycles (including the local-storage purge sign-out performs).
 */

// ---- fake cloud table + auth session -------------------------------------

type Row = { user_id: string; store_key: string; data: unknown };

const cloud: Row[] = [];
let currentUser: string | null = null;
const authListeners: Array<(e: string, s: unknown) => void> = [];

vi.mock("@/integrations/supabase/client", () => {
  const session = () => (currentUser ? { user: { id: currentUser } } : null);
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: session() } }),
        onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
          authListeners.push(cb);
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
      },
      from: () => ({
        select: () => ({
          eq: (_c1: string, v1: string) => ({
            eq: (_c2: string, v2: string) => ({
              maybeSingle: async () => {
                const row = cloud.find((r) => r.user_id === v1 && r.store_key === v2);
                return { data: row ? { data: row.data } : null, error: null };
              },
            }),
          }),
        }),
        upsert: async (row: Row) => {
          const idx = cloud.findIndex(
            (r) => r.user_id === row.user_id && r.store_key === row.store_key,
          );
          const clone = JSON.parse(JSON.stringify(row)) as Row;
          if (idx >= 0) cloud[idx] = clone;
          else cloud.push(clone);
          return { error: null };
        },
      }),
    },
  };
});

// ---- harness -------------------------------------------------------------

const STORE_KEY = "settings:shift-markers";

type MarkersModule = typeof import("./shift-markers-store");

/** Simulate a fresh app boot for `userId` and return the freshly loaded store module. */
async function signIn(userId: string): Promise<MarkersModule> {
  currentUser = userId;
  authListeners.length = 0;
  vi.resetModules();
  const mod = (await import("./shift-markers-store")) as MarkersModule;
  // let the hydrate promise chain settle
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return mod;
}

/** Sign-out: the portal purges the local "aih:" mirror for workstation hygiene. */
async function signOut() {
  const { purgeLocalAppData } = await import("../purge-local-data");
  for (const cb of authListeners) cb("SIGNED_OUT", null);
  currentUser = null;
  purgeLocalAppData();
}

/** Flush the debounced cloud push. */
async function flushPush() {
  await vi.advanceTimersByTimeAsync(1000);
  await Promise.resolve();
  await Promise.resolve();
}

function cloudMarkers(userId: string) {
  const row = cloud.find((r) => r.user_id === userId && r.store_key === STORE_KEY);
  return (row?.data as { markers?: unknown[] } | undefined)?.markers ?? [];
}

beforeEach(() => {
  vi.useFakeTimers();
  cloud.length = 0;
  currentUser = null;
  authListeners.length = 0;
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("shift marker persistence", () => {
  it("Test 1: a marker survives a reload/remount", async () => {
    const a = await signIn("user-a");
    a.setMarkers([{ id: "m1", name: "Break 1", hour: 0, minute: 30, durationMin: 15 }]);
    await flushPush();

    const reloaded = await signIn("user-a");
    expect(reloaded.shiftMarkersStore.get().markers).toEqual([
      { id: "m1", name: "Break 1", hour: 0, minute: 30, durationMin: 15 },
    ]);
  });

  it("Test 2: a marker survives logout/login with local state cleared", async () => {
    const a = await signIn("user-a");
    a.setMarkers([{ id: "m1", name: "Break 1", hour: 0, minute: 30, durationMin: 15 }]);
    await flushPush();

    await signOut();
    expect(localStorage.getItem("aih:settings:shift-markers:v1")).toBeNull();

    const back = await signIn("user-a");
    expect(back.shiftMarkersStore.get().markers.map((m) => m.name)).toEqual(["Break 1"]);
  });

  it("Test 3: an edit persists across logout/login", async () => {
    const a = await signIn("user-a");
    a.setMarkers([{ id: "m1", name: "Break 1", hour: 0, minute: 30 }]);
    await flushPush();
    a.setMarkers([{ id: "m1", name: "Break 1", hour: 0, minute: 45 }]);
    await flushPush();
    await signOut();

    const back = await signIn("user-a");
    expect(back.shiftMarkersStore.get().markers[0]).toMatchObject({ hour: 0, minute: 45 });
  });

  it("Test 4: a deletion persists across logout/login", async () => {
    const a = await signIn("user-a");
    a.setMarkers([
      { id: "m1", name: "Break 1", hour: 0, minute: 30 },
      { id: "m2", name: "Lunch", hour: 2, minute: 0 },
    ]);
    await flushPush();
    a.setMarkers([{ id: "m2", name: "Lunch", hour: 2, minute: 0 }]);
    await flushPush();
    await signOut();

    const back = await signIn("user-a");
    expect(back.shiftMarkersStore.get().markers.map((m) => m.name)).toEqual(["Lunch"]);
  });

  it("Test 5: multiple markers return with names, times, durations and order", async () => {
    const a = await signIn("user-a");
    a.setMarkers([
      { id: "m1", name: "Break 1", hour: 0, minute: 30, durationMin: 15 },
      { id: "m2", name: "Lunch", hour: 2, minute: 0, durationMin: 30 },
      { id: "m3", name: "Break 2", hour: 3, minute: 30, durationMin: 15 },
      { id: "m4", name: "Meeting", hour: 4, minute: 0, milestone: true },
    ]);
    await flushPush();
    await signOut();

    const back = await signIn("user-a");
    expect(back.shiftMarkersStore.get().markers).toEqual([
      { id: "m1", name: "Break 1", hour: 0, minute: 30, durationMin: 15 },
      { id: "m2", name: "Lunch", hour: 2, minute: 0, durationMin: 30 },
      { id: "m3", name: "Break 2", hour: 3, minute: 30, durationMin: 15 },
      { id: "m4", name: "Meeting", hour: 4, minute: 0, milestone: true },
    ]);
  });

  it("Test 6: markers are isolated per authenticated user", async () => {
    const a = await signIn("user-a");
    a.setMarkers([{ id: "m1", name: "Break 1", hour: 0, minute: 30 }]);
    await flushPush();
    await signOut();

    const b = await signIn("user-b");
    expect(b.shiftMarkersStore.get().markers).toEqual([]);
    b.setMarkers([{ id: "m9", name: "Lunch", hour: 2, minute: 0 }]);
    await flushPush();
    await signOut();

    expect((cloudMarkers("user-a") as Array<{ name: string }>).map((m) => m.name)).toEqual([
      "Break 1",
    ]);
    expect((cloudMarkers("user-b") as Array<{ name: string }>).map((m) => m.name)).toEqual([
      "Lunch",
    ]);

    const backA = await signIn("user-a");
    expect(backA.shiftMarkersStore.get().markers.map((m) => m.name)).toEqual(["Break 1"]);
  });

  it("Test 7: the initial empty state cannot overwrite saved cloud markers", async () => {
    cloud.push({
      user_id: "user-a",
      store_key: STORE_KEY,
      data: { markers: [{ id: "seed", name: "Seeded", hour: 1, minute: 0 }] },
    });

    const a = await signIn("user-a");
    // Nothing local was pushed over the seed during startup...
    await flushPush();
    expect((cloudMarkers("user-a") as Array<{ name: string }>).map((m) => m.name)).toEqual([
      "Seeded",
    ]);
    // ...and the client hydrated from the cloud copy.
    expect(a.shiftMarkersStore.get().markers.map((m) => m.name)).toEqual(["Seeded"]);
  });
});
