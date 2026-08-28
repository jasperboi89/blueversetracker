# Portal UI 2.0 — Screen Audit

**Phase 1 · Account Command Center evolution**
Status: living document — drives subsequent redesign phases.

This audit inventories every major route/screen, classifies it, and records the
friction to resolve in later phases. Phase 1 itself only acted on a subset (Home
→ Command Center, navigation, header Copilot, token consolidation, and the
removal of Shift Handoff + Coverage Watch). Everything else is captured here so
the redesign stays controlled and reversible.

## Legend

- **KEEP** — solid; leave as-is this phase.
- **REDESIGN** — worth a focused visual/structural pass in a later phase.
- **MERGE** — should fold into another surface.
- **REMOVE** — should be retired (with rollback safety).
- **ADMIN/SECONDARY** — necessary but must not compete with operational work.

Risk = risk of the *redesign*, not of the current screen.

---

## Command Center & shell

### `/` — Command Center (was "Home") — **REDESIGN (done, Phase 1)**
- **Purpose:** the operator's home base — orientation, priority intelligence, live work state.
- **Strengths:** rich existing panels (NBA, briefings, night plan, alerts, ledger); floating Power Workspace.
- **Friction (pre-Phase 1):** a long flat stack of equal-weight glowing panels; Handoff + Coverage panes the owner didn't use.
- **Phase 1 change:** reorganised the composed layout into hierarchy bands (Orientation → Priority → Work Intelligence → Operations); removed Handoff/Coverage panes; preserved floating PaneCanvas as the optional Power Workspace.
- **Future role:** the contextual intelligence surface — a live, composable operational HUD.
- **Dependencies:** `home/*` components, `workspace/pane-layout-store`, `focus-workspace`, theme store.
- **Risk:** medium (many child components; logic reused, presentation reorganised).

### App shell / header / sidebar — **REDESIGN (partial, Phase 1)**
- **Phase 1 change:** header gained a native, context-aware **Intel Copilot** entry point; the floating launcher is now mobile-only; sidebar IA reorganised into operator jobs (Command Center / Work / Accounts / Dispatch / Knowledge / Intelligence / System).
- **Future role:** a calm, dense command surface; per-zone tinting kept.
- **Risk:** low.

---

## WORK

### `/assigned-to-me` — Assigned to Me — **KEEP**
- **Purpose:** personal inbox of assigned tickets/work; unread badge in nav.
- **Strengths:** clear queue; drives the sidebar badge.
- **Friction:** none blocking; visual pass later for density.
- **Future role:** primary "my queue" lane.
- **Dependencies:** `assigned-inbox-store`, tickets store.
- **Risk:** low.

### `/freshdesk-tickets` + `/freshdesk-tickets/$ticketId/work` — Freshdesk Work — **KEEP**
- **Purpose:** the core ticket queue and per-ticket work surface (timer, notes, actions).
- **Strengths:** deep integration with active-work timer, portal context, Copilot ticket pane.
- **Friction:** work surface is dense; benefits from the token pass for hierarchy.
- **Future role:** the operational "cockpit" for a single unit of work.
- **Dependencies:** tickets store, active-work store, freshdesk API, portal context.
- **Risk:** medium (high-traffic; change carefully).

### `/additional-work` (+ `.index`, `/$workId/work`) — Additional Work — **KEEP**
- **Purpose:** non-Freshdesk work items with their own work surface.
- **Strengths:** mirrors ticket work ergonomics.
- **Future role:** unify work-surface primitives with Freshdesk work in a later phase (shared timer/notes shell).
- **Dependencies:** additional-work store, active-work store.
- **Risk:** low–medium.

---

## ACCOUNTS

### `/accounts` + `/accounts/$accountNumber` — Accounts — **KEEP / REDESIGN-later**
- **Purpose:** account book of record; per-account context (tickets, changes, resolutions, knowledge).
- **Strengths:** backed by the Account Context Pack (bounded, provenance-tagged).
- **Friction:** the detail view is the natural home for the future "Account Cortex" world-model view.
- **Future role:** Account Cortex — a persistent world model with risk/anomaly signals.
- **Dependencies:** `account-context-service`, resolution memory, changes, knowledge.
- **Risk:** medium.

---

## DISPATCH

### `/contact-dispatch` (+ `.archive`, `/$sessionId/work`) — Contact Dispatch — **KEEP**
- **Purpose:** outbound contact verification workflow + archive.
- **Strengths:** self-contained; own work surface and archive.
- **Future role:** governed action target (verification steps as capabilities).
- **Dependencies:** dispatch store, capability registry.
- **Risk:** low.

---

## KNOWLEDGE

### `/knowledge-vault` — Knowledge Vault — **KEEP / REDESIGN-later**
- **Purpose:** runbooks, IS scripts, notes; reader/editor.
- **Strengths:** rich editor (TipTap), PDF extract, per-account matching.
- **Friction:** retrieval is query-driven; future semantic retrieval seam exists (`lib/retrieval`).
- **Future role:** the institutional-knowledge substrate for retrieval + Copilot grounding.
- **Dependencies:** knowledge functions, retrieval, rich-text.
- **Risk:** medium.

---

## INTELLIGENCE

### `/freshdesk-intelligence` — Freshdesk Intelligence — **KEEP**
- **Purpose:** search/analysis over Freshdesk; **owns the "coverage" diagnostics** (result completeness, ticket-content coverage, access logging).
- **⚠️ Preserve:** these coverage diagnostics are **unrelated** to the removed Coverage Watch feature — do not conflate.
- **Future role:** pattern/anomaly detection surface.
- **Dependencies:** `api/freshdesk-search.functions`, `SearchDebugPanel`, `ticket-access-log`.
- **Risk:** low (leave diagnostics intact).

### `/completed-work` — Completed Work — **KEEP**
- **Purpose:** history of completed work; feeds memory compilation.
- **Future role:** input to Operational Learning.
- **Risk:** low.

### `/reports` — Reports — **KEEP**
- **Purpose:** recurring-issues, night-plan history, and shift recap/summaries.
- **Note:** end-of-shift **summary** lives here and in briefings — generic summarization is retained (only the "Shift Handoff" framing was removed).
- **Risk:** low.

---

## SYSTEM / ADMIN

### `/achievements` — Achievements — **SECONDARY**
- **Purpose:** gamification. Kept accessible under System so it never competes with operational work.
- **Risk:** low.

### `/audit-log` — Audit Log — **ADMIN**
- **Purpose:** auth + action audit trail. Admin-only.
- **Future role:** the human-facing view of the Action Ledger / governed-autonomy audit.
- **Risk:** low.

### `/settings` — Settings — **ADMIN**
- **Purpose:** AI settings, Freshdesk credentials, theme, profile.
- **Future role:** model/provider routing controls; autonomy-level controls.
- **Risk:** low.

---

## Orphans / to document

### `/constellations` — **ADMIN/EXPERIMENTAL (theme-gated)**
- **Finding (verified Phase 1.5):** the route renders a **Quantum Bloom "Discovery sky"** — `ConstellationField`, `ArchiveTimeline`, and a `CoreCard` over `useDiscoveries()` (gamification/achievements visualization). It **self-gates to the Quantum Bloom theme** (shows a "switch theme" prompt otherwise). It is **not linked** from the sidebar or command palette — only reachable by direct URL and via the generated route tree. No in-app navigation points to it.
- **Classification:** ADMIN/EXPERIMENTAL — thematic, gamification-adjacent, not core operational work. Functional, not dead.
- **Recommendation:** in a later phase, either surface it from Achievements/Settings when Quantum Bloom is active, or leave it as an easter-egg surface. No destructive change; left untouched.
- **Risk:** low.

### Power Workspace (floating panes) — **KEEP (deemphasized)**
- **Finding:** floating/customisable layouts remain available but are no longer the default visual language. Narrow/mobile always uses the stable stack.
- **Recommendation:** promote to an explicit "Power Workspace" toggle in a later phase.

---

## Removed in Phase 1 (rollback-safe)

- **Shift Handoff** — user-facing panel, focus/awareness recommendations, and AI "handoff note" framing removed. `handoff.functions.ts`, the `shift_handoffs` table, `handoff_generation` router task type, and legacy event names remain **dormant** for rollback. Generic shift-recap/summary retained.
- **Coverage Watch** — panel, home pane, alerts, account-context surfacing, and cloud-sync registration removed. `coverage-store.ts` / `holidays.ts` kept **dormant** (unwired). **Freshdesk coverage diagnostics preserved.**

See `docs/OPERATIONAL_INTELLIGENCE_EVOLUTION.md` for architecture evolution.
