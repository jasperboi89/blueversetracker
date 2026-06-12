# Phase 6 — Final Integration & Polish

Scope locked from the spec. No prior phases redesigned. No new modules, no Audit/Genesis/CRM. BlueVerse stays.

## Part 1 — Freshdesk read-only API

**Credentials & transport (decision: Lovable Cloud secrets)**
- Enable Lovable Cloud. Store `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY` as project secrets (never in client bundle).
- All Freshdesk calls go through TanStack server functions in `src/lib/api/freshdesk.functions.ts`:
  - `freshdeskTestConnection()` — GET `/api/v2/agents/me`, returns `{ ok, agentName?, error? }`.
  - `freshdeskGetTicket({ ticketId })` — GET `/api/v2/tickets/:id?include=requester,company,stats`.
  - `freshdeskGetConversations({ ticketId })` — GET `/api/v2/tickets/:id/conversations`.
  - `freshdeskGetAttachments({ ticketId })` — derived from conversations + ticket payload.
- Server-side only: API key read inside `.handler()`, never returned to client. Errors normalized to friendly strings; raw key/header never echoed.

**Settings → Freshdesk Integration section**
- Fields: Domain (display only, masked tail), API Key (masked `••••••••last4` once set).
- Actions: Save Connection, Test Connection, Clear Connection.
- Save flow: opens Lovable secrets prompt (`add_secret` / `update_secret`) — user enters values in the secure form, never typed into our UI.
- Status chip: Not Connected / Connected / Error, with "Last successful connection: 1:12 AM Central".
- Clear: calls `delete_secret` after confirm modal.

**Ticket lookup behavior**
- In `TicketLookupCard`: enter Freshdesk number.
  - If Hub record exists → open Ticket Preview drawer, show "Sync Freshdesk" button.
  - If not → show "Pull Ticket from Freshdesk" button; on click call `freshdeskGetTicket`, create Hub record, open Preview.
  - On 404 → toast + inline panel: "Ticket not found in Freshdesk" with [Try Again] [Create Ticket Work Manually]. No fake data.

**Sync Freshdesk (3 entry points: card, preview, workspace header)**
- Calls `freshdeskGetTicket` + `freshdeskGetConversations`.
- Updates ticket details (subject, status, priority, group, agent, requester, company, due date as Freshdesk source).
- Notes/conversations: dedupe by Freshdesk note id; new ones saved with `source: "freshdesk"` and "Pulled from Freshdesk" label; read-only.
- Attachments: dedupe by Freshdesk attachment id (+ fallback hash of name+size+createdAt); saved to ticket's `freshdeskAttachments` and mirrored into Account Profile snips if account linked. "Pulled from Freshdesk" label. Delete from Hub shows: "This only removes the saved Hub copy. It does not delete anything from Freshdesk."
- Returns `{ newNotes, newAttachments, syncedAt }`; UI shows the spec's success/empty/failure messages. Updates `syncedAt`.
- Card sync: small inline toast, fades.
- Preview sync: full summary block.
- Workspace sync: header timestamp + compact toast.

**Due date sources**
- Extend `Ticket` with `due: { value, source: "freshdesk"|"hub-manual"|"hub-override", updatedAt, initials }` and `dueHistory: Array<{ prev, next, source, at, initials: "LTP" }>`.
- Hub Override always wins for Due Today / Overdue selectors. Completed tickets excluded.

## Part 2 — Settings page (`src/routes/settings.tsx`)

BlueVerse section cards. Left sidebar of section anchors on desktop; stacked on mobile.

1. **Freshdesk Integration** — as above.
2. **AI Summary Settings** — new `aiSettingsStore` (localStorage):
   - tone (5 options), length (3), technicalLevel (3), smartDetailOverride (bool, default on), customInstructions (text).
   - Preview area: Generate / Regenerate buttons calling a local mock summarizer (no AI call yet — pure template formatter that respects settings). Sample outputs for FD note, dispatch summary, additional work, prog email item.
   - Save / Reset to Default.
   - Manual-note AI Polish: preview with Use Polished / Keep Original / Edit Polished — wires version labels (Manual Draft / AI Generated / AI Polished / User Edited / Final Posted / Final Sent) into existing note flows.
3. **Contact Dispatch Templates** — new `dispatchTemplatesStore`. CRUD + duplicate + archive/restore + reorder. Block delete if used historically; archive instead. Surfaces in Contact Dispatch Testing under "Use Global Template".
4. **Dropdown Management** — new `dropdownsStore` for: Region, Company, Topic, Type, FD Priority/Group/Agent, Issue Classification, Snip Categories. Add/Edit/Archive/Restore/Reorder. "Show Archived" toggle. Used values block delete; archived values still render on historical records.
5. **Shift Settings** — new `shiftSettingsStore`. Editable start (22:00), end (06:00), final hour (05:00), TZ (Central). Confirm modal on save listing affected surfaces. `shift.ts` reads from store with current defaults as fallback.
6. **Display Preferences** — new `displayPrefsStore`. Shift progress (Ring/Bar/Both), FD Show Due Times, FD Show Priority, Sidebar default, Motion (Full / Reduced). Reduced Motion toggles a `data-motion="reduced"` on `<html>` and gates particles/floating/celebration.
7. **Data / Cleanup Settings** — Night Plan archive counts (reuse `nightPlanHistory`), Review Cleanup button (confirm modal, only deletes NP history). Hub data counts table for each store. **Demo Mode toggle** here too (see Part 5).

## Part 3 — Final polish

**Shared primitives** (new):
- `src/components/ui/ConfirmModal.tsx` — BlueVerse glass confirm; replaces ad-hoc confirms across Mark Completed / Mark Posted / Mark Ready / Mark Sent / Archive Account / Delete note / Delete snip / NP cleanup / Carry Over / Dismiss / Convert / Discard.
- `src/components/ui/UnsavedChangesPrompt.tsx` + `useUnsavedGuard` hook — wired into NP Add Item, ticket work form, dispatch testing, additional work, account notes, generated note/email previews, settings.
- `formatCentralExact(date)` helper used everywhere (e.g. "1:42 AM Central"). Audit existing relative timestamps; keep relative only when paired with exact.
- Initials default constant `LTP` centralized.

**Visual consistency pass** across Home, Freshdesk, Contact Dispatch, Additional Work, Accounts, Reports, Settings: same card radii, glow tokens, button hierarchy, status badges, modal/drawer/bottom-sheet style. Mobile drawers → bottom sheets via existing `useIsMobile`.

**Accessibility pass**: aria-labels on icon-only buttons, Escape closes safe modals, focus return, visible focus ring, respects Reduced Motion.

## Part 4 — Data flow smoke checks
Walk each flow in the spec (FD ticket pull → preview → sync → work → posted → completed; dispatch start→ready; additional work create→complete; account timeline; reports; night plan). Fix any wiring gaps surfaced.

## Part 5 — Mock data / Demo Mode
- New `demoModeStore` (localStorage, default ON).
- All existing seed records tagged `isDemo: true` (one-time migration on boot).
- Real Freshdesk pulls never set `isDemo`.
- When Demo Mode OFF, list/dashboard selectors filter out `isDemo` records; Recently Completed, Reports, Account Timeline, NP history all respect it.
- Demo records render with a small "Demo" chip when Demo Mode is ON.
- Settings → Data / Cleanup exposes the toggle with a one-line explanation.

## File map (new / edited)

**New**
- `src/lib/api/freshdesk.functions.ts`, `src/lib/api/freshdesk.types.ts`
- `src/lib/settings/ai-settings-store.ts`
- `src/lib/settings/dispatch-templates-store.ts`
- `src/lib/settings/dropdowns-store.ts`
- `src/lib/settings/shift-settings-store.ts`
- `src/lib/settings/display-prefs-store.ts`
- `src/lib/settings/demo-mode-store.ts`
- `src/lib/settings/freshdesk-config-store.ts` (status only, no secrets)
- `src/components/ui/ConfirmModal.tsx`
- `src/components/ui/UnsavedChangesPrompt.tsx`
- `src/hooks/use-unsaved-guard.ts`
- `src/components/settings/*` — one component per section
- `src/components/freshdesk/PullTicketPanel.tsx`, `SyncFreshdeskButton.tsx`

**Edited**
- `src/routes/settings.tsx` — full build-out
- `src/components/freshdesk/TicketLookupCard.tsx`, `TicketCard.tsx`, `TicketPreviewDrawer.tsx`, `ActiveTicketSections.tsx`
- `src/routes/freshdesk-tickets.$ticketId.work.tsx` — header sync + due source
- `src/lib/tickets-store.ts` — `due` + `dueHistory` + `isDemo` + dedupe helpers + sync merger
- `src/lib/{dispatch,additional-work,accounts,night-plan}-store.ts` — `isDemo` tag + demo filter helpers
- `src/lib/shift.ts` — read from shift settings
- `src/routes/__root.tsx` — apply motion / sidebar default; mount Demo seed migration
- AlertCenter / OverviewCards / RecentlyCompleted / Reports — respect Demo Mode

## Out of scope (explicitly)
Auto-posting to Freshdesk, status writes to Freshdesk, attachment uploads to Freshdesk, new top-level pages, auth, multi-user sync, real AI calls (AI Polish uses a local formatter respecting settings — no LOVABLE_API_KEY usage in this phase).

## Risks / call-outs
- Sync may be heavy on large tickets — capped at latest 100 conversations per request; pagination only if needed.
- Lovable secrets are workspace-level; user enters values via the secure prompt, not our form. The Settings UI never receives the raw key.
- Shift Settings edits update derived UI immediately but won't retroactively rewrite stored `shiftKey` values (documented in the confirm modal).
