## Goal

At shift end, automatically reset the Night Plan to 0 if everything is complete. If items are still active, prompt at 5:50 AM Central asking whether to carry them into tomorrow's plan — accepting wipes the next plan and seeds it with those leftovers; declining archives them as dismissed so the next shift starts fresh.

## Behavior

1. **Auto-reset when clean (shift rollover):**
   - When the current Central time crosses out of the shift window (hour reaches 6 AM, i.e. shift key changes), and zero items are `todo` / `in-progress` / `carried`, archive everything to `nightPlanHistory` and clear `nightPlanStore` so the new shift opens at 0 / 0%.
   - Already-finished items (`done`, `dismissed`, `converted`) get pushed to history with their current status, then removed.

2. **5:50 AM Central carry-over prompt (only when leftovers exist):**
   - A small daily watcher fires at 5:50 AM Central. If there are active items, open a modal: "X items are still open. Move them to tomorrow's plan?"
   - **Move them over** → mark each active item as `carried` in history, clear the current plan, and re-add fresh `todo` items (one per leftover, preserving task / notes / priority, new id, new `createdAt`, `carryTrail` updated). The new plan is the next shift's plan (the rollover at 6 AM uses the same items because the shift key has not changed yet — at 5:50 AM the key is still tonight; we seed under the *next* shift key explicitly).
   - **Start fresh** → archive leftovers to history as `dismissed`, clear the current plan. Next shift opens at 0.
   - **Dismiss / no answer by 6:00 AM** → default to "Start fresh" so the new shift is always clean.
   - Snooze "remind me in 10 min" option for the prompt; auto-defaults at 6:00 AM regardless.
   - Suppress if already answered for this shift key (store `rolloverAnsweredShiftKey` in plan state).

3. **Manual override:** add a "Reset Plan" button in the Night Plan header so the user can trigger the same logic on demand (archives current items, clears state). Confirms first.

## Technical notes

**`src/lib/night-plan-store.ts`**
- Add `rolloverAnsweredShiftKey?: string` to `PlanState`.
- New actions:
  - `archiveAndReset(disposition: "done-as-is" | "dismiss-active" | "carry-active")` — pushes current items into `nightPlanHistory` with the right statuses, then resets `items` to `[]`, sets `shiftKey` to current `getShiftKey()`, clears `celebrationShown`.
  - `seedNextShiftFromCarry(items: NightPlanItem[])` — overrides `shiftKey` to tomorrow's key and replaces `items` with fresh `todo` clones (new id, `createdAt = now`, status `todo`, retains priority/task/notes).
  - `markRolloverAnswered(shiftKey: string)`.
- On `ensureLoaded`, if stored `shiftKey !== getShiftKey()` AND no leftover-active items, auto-archive any leftover finished items and reset (covers the "everything complete" path automatically on next load).

**`src/lib/reports/night-plan-history.ts`**
- Add `addMany(items: NPHistoryItem[])` to push a batch (current store has `delete` / `clearAll` but no add).

**`src/lib/shift.ts`**
- Add `getNextShiftKey(now?)` returning tomorrow's shift key for seeding.
- Add `isAt(hour, minute, now?)` helper or expose central minute-of-day so the watcher can fire at exactly 5:50.

**New `src/components/home/NightPlanRolloverWatcher.tsx`** (mounted once inside the home shell where `NightPlan` already lives)
- `useNow()` (already exists per `src/hooks/use-now.ts`) → every minute check Central time.
- When `hour===5 && minute===50` and shift not yet answered and active items exist → open `<RolloverPromptModal />`.
- At hour===6 minute===0, if not answered, run default "dismiss-active" reset.
- The "shift just ended and was clean" path also runs here: if stored shiftKey differs from current and active items === 0, call `archiveAndReset("done-as-is")` immediately.

**New `src/components/home/RolloverPromptModal.tsx`**
- Three buttons: Move to Tomorrow / Start Fresh / Snooze 10 min.
- Shows list of leftover items grouped by priority for quick review.

**`src/components/home/NightPlan.tsx`**
- Add "Reset Plan" button in the header with a confirm dialog (uses `ConfirmModal`).
- Mount `<NightPlanRolloverWatcher />` near the top so it lives wherever NightPlan is visible (or mount it once in `AppShell` so it runs site-wide).

## Out of scope

- Configurable prompt time (hard-coded to 5:50 AM Central; can be made user-tunable later).
- Pre-shift email / push notification — modal only.
- Carrying over snip attachments or sub-state beyond task/notes/priority.
