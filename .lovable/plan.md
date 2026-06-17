# Finish-the-build Plan

Audit of the whole app found a handful of unfinished pieces. The recently-built features (night plan rollover, programming email, ReasonFlowSection collapsibles, reports panels, auth routes) are wired correctly — these are the gaps.

## Blockers (functional holes users will hit)

### 1. Reason Flow templates are empty arrays
`src/components/dispatch/ReasonFlowSection.tsx` declares `globalReasonTemplates = []` and `accountReasonTemplates = {}` at module scope, so the "Global Template" / "Account Template" submenus in the add-reason dropdown are always empty.

Fix: read globals from `dropdowns-store` (or a new `reason-templates-store`) and per-account templates from `accountsStore` (the Accounts page already saves them there). Render real items in the submenus and auto-fill the new reason card when selected.

### 2. "View Account" buttons go nowhere
- `src/components/dispatch/ActiveSessionsList.tsx` — line ~48 toast stub
- `src/routes/_authenticated/contact-dispatch.$sessionId.work.tsx` — line ~77 toast stub

Both should `navigate({ to: "/accounts/$accountNumber", params: { accountNumber } })` (route already exists). Disable the button when no account is linked.

### 3. "Create Account Later" stub in dispatch start pane
`src/components/dispatch/StartTestingPane.tsx` line ~99 — replace toast with the same "create account" path used on the Accounts page (open `accountsStore.create()` minimal modal, then link it to the session).

### 4. Forgot-password link missing on LoginCard
`/reset-password` route exists but nothing triggers it. Add a "Forgot password?" link under the password field that calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })` and toasts success.

### 5. Google OAuth (only if required)
No `signInWithOAuth` anywhere. If Google sign-in is required, add a "Continue with Google" button to `LoginCard` that calls `supabase.auth.signInWithOAuth({ provider: "google" })` and configure the provider. **Need confirmation — see Open Questions.**

## Polish

### 6. Report Export buttons are stubs
`src/routes/_authenticated/reports.tsx` has 5 Export buttons all calling `exportPlaceholder()`. Reuse the existing `src/components/completed-work/exportCsv.ts` pattern to emit CSVs for: Ticket History, Dispatch Status, Additional Work, Account History, Night Plan History.

### 7. `progNotes` on additional-work not consumed by email
`src/routes/_authenticated/additional-work.$workId.work.tsx` saves a `progNotes` field labelled "used later in the Programming Status Email", but `src/lib/reports/prog-email-format.ts` ignores it. Add an "Additional Work" section to the email builder that pulls items in the window with non-empty `progNotes`.

### 8. Silent catch in discoveries hook
`src/hooks/use-discoveries.ts` line ~29 swallows Supabase errors. Log via `console.warn` and surface a toast on hard failures so users know the panel is stale.

### 9. Quantum Bloom Settings inert controls
`src/components/settings/ThemesSection.tsx` — either wire the remaining sliders/toggles to `qbTuningStore` or hide them behind a "Coming soon" disabled state instead of looking interactive. Recommend wiring (store already exists).

## Cosmetic (low priority — flag, don't necessarily fix)
- `src/components/layout/PlaceholderPage.tsx` — no route uses it; safe to delete.
- `src/lib/api/example.functions.ts` — scaffold leftover, never called; safe to delete.

## Open Questions
1. Is **Google OAuth** required for this hub? (If no, skip item 5 and the audit blocker is dropped.)
2. For item 7, should `progNotes` appear in a new "Additional Work" section in the prog-status email, or merged into the existing Items list?
3. For item 6, should CSV exports include attachments/snip URLs, or text fields only?

## Out of Scope
- Real outbound email send for the programming status email (current copy-rich + manual-sent workflow is intentional unless you say otherwise).
- Building anything new on top of `PlaceholderPage`.
