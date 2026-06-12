# Phase 1 — Account Intel Hub (BlueVerse)

Build the visual shell, navigation, and Home Dashboard with local mock data only. No backend, no Freshdesk API, no extra modules.

## Scope (exactly what gets built)

1. **BlueVerse visual system** — cosmic galaxy background, glass panels, electric blue/cyan/violet glow, subtle particles, gold/green/pink accents reserved for special states.
2. **App shell** — left sidebar (Home, Freshdesk Tickets, Contact Dispatch, Additional Work, Accounts, Reports, Settings). Only Home is functional; others are placeholder pages.
3. **Home Dashboard** in this exact order:
   - Header row: greeting panel (left) + Date/Time Shift Card (right)
   - Alert Center (hidden when empty; shown with mock alerts)
   - Night Plan header / shell (fully functional, local state)
   - Lookup area: Account Lookup + Freshdesk Ticket Lookup (mock)
   - Overview cards: Due Today, Open Items, In Review (drawer/sheet on click, mock)
   - Recently Completed Work (mock, last 5 mixed)
   - Generate Shift Summary button + setup modal shell

## Module specifics

**Date/Time Shift Card** — date, Central time, shift window 10p–6a, status (Before/Active/Near End/Complete), ring + bar (both shown). 5a–6a gold/cyan pulse. 6a: 3s "Finalizing shift…" overlay → 10s dashboard-wide celebration (no sound, glow wave, checkmark, ring/bar 100%). Local-state only; don't replay within same shift.

**Alert Center** — data-driven, hidden when empty, auto-expanded, no collapse button, full-width glass. Sort Critical → Warning → Info, newest first. Dismiss per shift; "View Dismissed Alerts" when any dismissed. Animated border color = highest priority. Mock alerts only.

**Night Plan** — full local-state CRUD:
- Header card with 3D icon, progress ring, count "N of M done", priority breakdown, dismissed/converted counts when >0.
- Empty: "0% / No plan items yet / + Add Item".
- Populated: "Open Night Plan" + "+ Add Item".
- Open Night Plan expands inline on Home (first 5 sorted by priority then oldest); "View More" → right drawer (desktop/tablet) or bottom sheet (mobile) with tabs Active / Completed / Dismissed / Converted.
- Item fields: Task (req), Notes, Status (To Do/In Progress/Done/Carried Over/Dismissed/Converted), Priority (Normal/Important/Must Do Tonight).
- Item detail view with actions: Mark Done, Carry Over, Dismiss, Convert to Additional Work (placeholder link), Edit. Back returns to originating tab. Completed items remain editable.
- BlueVerse confirmation popups per action (green/cyan, blue/cyan, violet/blue, amber/pink).
- Add Item modal: Enter adds, Ctrl+Enter from Notes adds, Escape closes if clean. After add, modal stays open, "Added to Night Plan" toast fades ~2s, fields reset, focus returns to Task. Done Adding closes. Unsaved-text protection prompt with Add & Close / Discard / Go Back.
- 100% celebration: 5s overlay with specified message; replays if a new item added then completed before 6a; suppressed after 6a.

**Lookup cards** — two side-by-side glass cards. Account Lookup: search-as-you-type, active first, Include Archived toggle, last-5 recents this shift. Freshdesk Ticket Lookup: numeric, saved Hub tickets only, Include Completed toggle, recents; if no result show "Pull from Freshdesk" + "Create Manually" placeholder buttons.

**Overview cards** — Due Today (wider primary), Open Items, In Review. Count-only, zero-state copy as specified. Click → right drawer (desktop/tablet) or bottom sheet (mobile) grouped by work type, Home visible behind. Mock data.

**Recently Completed Work** — stable section, last 5 mixed newest first, each row: type, title, completed time, 3D icon, Open Record (placeholder). "View All Completed Work" → drawer with category filter.

**Generate Shift Summary** — medium glowing button. Modal shell with "Use Current Shift" / "Choose Custom Range"; current-shift window calculated per the time rules.

**Responsive** — desktop full sidebar + right drawers; tablet collapsible sidebar + right drawers; mobile stacked + bottom sheets.

## Technical approach

- TanStack Start route files: `index.tsx` (Home) + simple placeholders for `/freshdesk-tickets`, `/contact-dispatch`, `/additional-work`, `/accounts`, `/reports`, `/settings`. Each placeholder route renders a glass panel saying it's coming in a later phase. Each route sets its own `head()` metadata.
- Sidebar uses the shadcn `Sidebar` (collapsible="icon") pattern with TanStack `Link` + `useRouterState` for active state; glowing pill background via custom utility.
- Design tokens added to `src/styles.css` under `@theme inline` and `:root`: cosmic background, glass surface, electric-blue, cyan, violet, gold, green, pink, plus glow shadow tokens and a `--gradient-galaxy`. Custom utilities (`@utility glass-panel`, `@utility glow-cyan`, `@utility shimmer`) for reusable BlueVerse treatments.
- Animated galaxy background: fixed full-screen layer in `__root.tsx` using layered radial gradients + a lightweight CSS particle field (no heavy libs). Framer-motion already-allowed for entrance/celebration overlays.
- All state Phase 1 is local React state. Night Plan persisted to `localStorage` keyed by shift date so add/edit survives reloads within a shift. Celebrations gated by a `localStorage` flag per shift to avoid replay.
- Central-time computations via `Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago' })` helpers in `src/lib/shift.ts`.
- Mock data lives in `src/lib/mock/` (alerts, accounts, tickets, completed work).
- Component layout under `src/components/home/` (GreetingPanel, ShiftCard, AlertCenter, NightPlan/*, LookupCards, OverviewCards, RecentlyCompleted, ShiftSummaryButton) and `src/components/layout/` (AppSidebar, AppShell, GalaxyBackground).
- Drawers use shadcn `Sheet`; bottom sheets use `Drawer` (vaul) for mobile. Modals use shadcn `Dialog`.

## Explicit non-goals for Phase 1

No Audit, Genesis, CRM, billing, team mgmt, client portal, analytics, chatbot. No Freshdesk API. No auth. No extra pages or charts. No real persistence beyond localStorage. Convert-to-Additional-Work only marks Converted + shows a disabled placeholder link.

## Deliverable checklist

Visual shell · sidebar/nav · Home dashboard sections in order · functional Shift Card with celebration · Alert Center (mock) · full local Night Plan CRUD + drawer + celebrations · lookup card shells · overview drawers (mock) · Recently Completed (mock) · Shift Summary modal shell · responsive desktop/tablet/mobile.

Awaiting your approval before I start building.
