## Problem

- The active-work timer starts when you open a ticket/dispatch/additional-work `.work` route, but keeps running after you navigate away. It only stops when you manually hit stop in the dock or open a different work item.
- Time worked isn't recorded anywhere durable — it's just banked into an in-memory `totals` map for the shift summary.

## Fix

### 1. Auto-stop when leaving a work page

Add a cleanup effect to each of the three `.work` routes so navigating away stops the timer:

- `src/routes/_authenticated/freshdesk-tickets.$ticketId.work.tsx`
- `src/routes/_authenticated/additional-work.$workId.work.tsx`
- `src/routes/_authenticated/contact-dispatch.$sessionId.work.tsx`

Each already calls `setActiveWork(...)` in an effect. Extend that effect's return cleanup to call a new helper `leaveActiveWork(id)` — it stops the timer only if the current active item still matches this route's id (so switching directly from one work item to another still hands off cleanly via `setActiveWork`'s existing banking logic).

### 2. New `leaveActiveWork` helper in `src/lib/workspace/active-work-store.ts`

- If `state.current?.id === id`: bank the elapsed time, append a session entry to the new work-log store, then clear `current`.
- If a different item is current: no-op.

### 3. Persist work sessions

New file `src/lib/workspace/work-log-store.ts` — persisted store `aih:workspace:worklog:v1` with cloud sync. Shape:

```ts
interface WorkLogEntry {
  id: string;
  kind: "ticket" | "dispatch" | "additional";
  workId: string;
  label: string;           // e.g. "Ticket #12345"
  accountNumber: string;   // "" when unknown
  accountName?: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  to: string;
  params: Record<string, string>;
}
```

Exports: `logWorkSession(entry)`, `useWorkLog()`, selector `workLogForAccount(num)`.

`leaveActiveWork` resolves the current item's `accountNumber` / `accountName` from `ticketsStore`, `dispatchStore`, or `additionalWorkStore` (by `kind` + `id`) before writing the entry. Sessions shorter than ~10s are dropped to avoid noise.

### 4. Show sessions on the Account timeline

`src/routes/_authenticated/accounts.$accountNumber.tsx`:

- Add `"timelog"` to the `TimelineFilter` union and the filter tabs.
- Read entries via `workLogForAccount(accountNumber)` and push a new timeline `Item` per entry with a Clock icon, the label (linking back via `entry.to` + `entry.params`), the formatted duration (`formatElapsed`), and `formatCentralShort(new Date(entry.endedAt))`.

### 5. Shift summary continues to work

`activeWorkStore.totals` stays as-is (used by the shift summary for per-item time this shift). `leaveActiveWork` still updates it via the existing `bank()` call, so nothing downstream changes.

## Out of scope

- No manual "edit session" UI — entries are append-only for now.
- No backend schema change — the log rides existing user-blob cloud sync.
- Dock pause/resume/stop buttons unchanged.
- No new AI features.
