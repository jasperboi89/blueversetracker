## Phase 3 — Contact Dispatch Testing

Build the Contact Dispatch Testing module per spec. Reuse Phase 1/2 visual patterns (glass panels, drawers, sticky tracker styling akin to ShiftCard, Sheet/Drawer responsive shell). No changes to Home or Freshdesk visuals beyond mock data feeding.

### Files to create

**Data layer**
- `src/lib/dispatch-store.ts` — subscribable store (same shape as `tickets-store.ts`) with `localStorage` persistence under `aih:dispatch:v1`. Exports:
  - Types: `DispatchStatus` (4 values exactly), `SectionStatus`, `ReasonType`, `ReasonResult`, `RetestEntry`, `ReasonCard`, `SectionState` (for Phone / Repeat / Save-Summary), `UrgentRoutingCheck`, `DispatchSnip`, `SummaryNoteVersion` (`Manual Draft | Generated | User Edited | Final Posted / Marked Used`), `DispatchSession`.
  - Actions: `start({accountNumber, ticketNumber?})`, `update(id, patch)`, `updateSection`, `addReason`, `updateReason`, `duplicateReason`, `removeReason`, `addRetest`, `addSnip`, `removeSnip`, `setOverallStatus`, `markReady`, `generateSummary`, `saveSummaryEdit`, `markPosted`, `restoreVersion`.
  - Selectors: `computeReadiness(session)` → `{percent, sectionStatuses, blockedBy[]}`, `canMarkReady(session)`.
  - Seeds: 6+ sessions covering every required state + a linked-ticket and no-ticket case.
- `src/lib/mock/dispatch-templates.ts` — mock Global + per-account reason templates.

**Page (Contact Dispatch index)**
- Replace `src/routes/contact-dispatch.tsx` with dashboard layout:
  1. Page header (3D glass routing icon, title, subtitle)
  2. `StartTestingPane` — account search-as-you-type against `mockAccounts`, optional Freshdesk ticket linker (validates against `ticketsStore.getByNumber`), `Start Testing` → navigates to workspace; `Create Account Later` placeholder when no match.
  3. `DispatchMiniDashboard` — 5 compact glass cards (Active, Waiting CS, Waiting Prog, Not Ready, Ready). Click → filtered Sheet (right on desktop, bottom on mobile) listing matching sessions.
  4. `ActiveSessionsList` — stacked glass cards (account #, name, linked ticket, status chip, readiness %, last updated Central, Open Testing, Open Account placeholder).
  5. `DispatchRecentlyCompleted` (only if mock has Ready/completed) — small section using same row style.

**Workspace route**
- `src/routes/contact-dispatch.$sessionId.work.tsx` — full-page workspace. Use nested-route pattern from Phase 2 (`contact-dispatch.tsx` renders `<Outlet/>` for child path, index UI for `/contact-dispatch`).
- Components in `src/components/dispatch/`:
  - `WorkspaceHeader.tsx` — account info, status, readiness %, last updated, actions: Back, Open Account (placeholder), Open Freshdesk (if linked), Generate Summary Note (scrolls to section), Mark Ready (disabled until `canMarkReady`).
  - `ReadinessTracker.tsx` — sticky (`sticky top-0 z-20`), progress ring + bar, section status chips, blocked-by list. Color thresholds: 0–49 blue/purple, 50–89 cyan/blue, 90–99 bright cyan, 100 green/cyan shimmer + checkmark + Ready badge (no sound, no global overlay).
  - `SectionCard.tsx` — reused collapsible shell (forked from Phase 2 work route's local SectionCard) with section-status chip.
  - `ReasonFlowSection.tsx` — Add Reason menu (Global Template / Account Template / Manual). Renders `ReasonCard` list. Each `ReasonCard`:
    - Fields: reason text, type tag (Routine/Urgent/N/A/Not Sure Yet, optional pre-save), Expected Flow, Actual Flow, Result (Passed/Failed), Failure Reason (required if Failed), Changes Made, Retest History list + add, Notes, Snips grid.
    - Routine + Passed requires Expected/Actual/Result; Urgent + Passed adds `UrgentRoutingSubsection`.
    - Duplicate Reason copies text/type/expected/notes/urgent fields; does NOT copy result/failure reason/retests/snips.
  - `UrgentRoutingSubsection.tsx` — fields per spec; failing forces parent reason Failed and requires Failure Reason + Changes/Retest before Passed After Retest.
  - `PhoneFieldSection.tsx`, `RepeatCallerSection.tsx` (cannot be skipped — sectionStatus must be set to non-`Not Tested`), `SaveSummarySection.tsx` — fixed-checks structured forms per spec with Failure Reason, Changes, Retest, Snips, Notes.
  - `OverallResultSection.tsx` — radio between 4 statuses with conditional Reason field; surfaces gating rules.
  - `SummaryNotesSection.tsx` — status, recommended note type, Generate, editable preview, version dropdown (Manual Draft/Generated/User Edited/Final Posted), Copy Final/Text Only, Download Snips, Open Freshdesk, Mark Posted Manually (confirm modal), Save. Generated note builder honors “Show all tested reasons / only failed-retested-review” toggle and emits warning panel with Add Missing Details / Generate Anyway / Write Manually when insufficient detail.
  - `MarkReadyModal.tsx` — three options: Mark Ready Only, Mark Ready + Generate Summary Note, Cancel; on confirm calls `markReady`, plays local green/cyan checkmark pulse (component-scoped, not full-screen).
  - `MarkPostedModal.tsx` — confirmation copy per spec.
  - `RetestModal.tsx` — date/time (Central, defaults now), result, notes, optional snips.
  - `AddSnipModal.tsx` — reuse pattern from `freshdesk/AddSnipModal` (paste/upload, preview, rename, category change, label) but bound to dispatch store and tagged with section/reason id.

**Home Dashboard integration (mock, additive only)**
- Add an adapter `src/lib/mock/dispatch-feed.ts` that pulls live counts/items from `dispatchStore` and merges into:
  - `OverviewCards` Open Items list — Not Ready sessions
  - `OverviewCards` In Review list — Waiting CS / Waiting Prog sessions
  - `RecentlyCompleted` — Ready for Activation sessions (alongside existing ticket + mock completed)
- Modify `OverviewCards.tsx` and `RecentlyCompleted.tsx` to subscribe to `dispatchStore` and merge (lists only — counts derived from merged length). Existing static `overviewCounts`/`mockCompleted` items remain.

### Statuses & rules (locked)

- Overall statuses: exactly `Ready for Activation`, `Waiting on Review from Customer Service`, `Waiting on Review from Programming`, `Not Ready, Still Working on Ticket`. No others. No “In Review” status.
- Section status chips: `Not Tested | In Progress | Passed | Failed | Passed After Retest | Still Failed | Waiting Review | Complete` (+ `N/A` for Save/Summary).
- Mark Ready gating: Repeat Caller section complete; all required reasons Passed or Passed After Retest; readiness = 100%. Reaching 100% only unlocks the button — never auto-flips status.

### Non-goals (will not build)

- Audit, Genesis, full Account Profile, Additional Work, Reports, Settings, Freshdesk API, real persistence, charts/analytics on the dispatch page, sound, dashboard-wide celebration overlay, any extra overall status, ability to skip Repeat Caller Check.

### Technical notes

- All `Date.now()` / random values stay out of module scope (Phase 2 hydration lessons): seed sessions store `*MinutesAgo` offsets and resolve to dates on client mount.
- Workspace route lives under nested file `contact-dispatch.$sessionId.work.tsx`; `contact-dispatch.tsx` becomes a layout that renders the dashboard at index or `<Outlet/>` for children, matching the Freshdesk pattern.
- Reuse `glass-panel`, `shimmer`, `--cyan-glow`, `--electric`, `--violet-glow`, `--green-glow`, `--gold-glow` tokens already in `styles.css` — no new design tokens unless a status needs a shade not already present.
- All sheets use `Sheet` with `side={isMobile ? "bottom" : "right"}` mirroring `OverviewCards` / `RecentlyCompleted`.

### Verification

After build, smoke-check: start session from lookup, run a Routine reason pass, an Urgent reason fail → retest → Passed After Retest, fail repeat-caller then retest, set Waiting CS (requires reason), flip to Not Ready (requires reason), drive a session to 100% and Mark Ready (modal → both options), Mark Posted on summary note, verify Home Dashboard Open Items / In Review / Recently Completed reflect the mock dispatch sessions, and confirm responsive drawer/sheet behavior.
