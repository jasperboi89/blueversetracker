## Goal
Honor the existing **Demo Mode** toggle so seeded demo Freshdesk tickets and seeded mock alerts disappear from the portal when Demo Mode is off. Real tickets (e.g. the Sheboygan Internal Medicine ticket you pulled in yourself) stay visible.

Today the toggle exists in Settings → Data / Cleanup, and tickets are already tagged with `isDemo: true` at seed time — but nothing in the UI actually filters them out. Mock alerts are always shown unconditionally.

## Changes

### 1. Filter demo tickets when Demo Mode is off
`src/lib/tickets-store.ts`
- Update the `useTickets()` hook (and any related selectors used by the lookup card, active sections, and ticket preview list) to read `useDemoMode()` and exclude tickets where `isDemo === true` when demo mode is off.
- Tickets you pulled from real Freshdesk (created via `createFromFreshdesk`) do **not** get `isDemo`, so the Sheboygan ticket remains.
- Recent-tickets list filters demo IDs the same way.

### 2. Filter mock alerts when Demo Mode is off
`src/components/home/AlertCenter.tsx`
- Import `useDemoMode`.
- Only spread `mockAlerts` into the visible list when demo mode is on. Dynamic alerts (recurring scripting issues, Night Plan cleanup) continue to show in both modes because they come from real data.

### 3. No data deletion required
The seeded ticket records stay in localStorage so toggling Demo Mode back on restores them. If you'd rather permanently wipe them, the existing **"Clear all demo data"** button in Settings → Data / Cleanup already does that — no change needed there.

## Technical notes
- `Ticket.isDemo` flag already exists and is set in `seed()` (line 253).
- `demoModeStore` / `useDemoMode()` already exist (`src/lib/settings/demo-mode-store.ts`).
- No backend or schema changes.
- Scope is intentionally limited to Freshdesk tickets + alerts (what you called out). Demo dispatch sessions, additional-work items, and accounts are not touched — say the word if you'd like those gated too.