# Add Activated state + Dispatch Archive

## Goal

Add a final "Mark Activated" action to Contact Dispatch testing. Activated sessions disappear from the Active Sessions list and the Mini Dashboard, and land in a new **Archive** tab inside Contact Dispatch where they can be reviewed or reopened.

## Changes

### 1. Data model — `src/lib/dispatch-store.ts`
- Add `"activated"` to the dispatch status union (keep `"ready"` as the precursor step).
- Add `activatedAt?: number` to the session record.
- Add `dispatchStore.markActivated(id)` — sets status `activated`, stamps `activatedAt`, bumps `updatedAt`.
- Add `dispatchStore.reopenFromArchive(id)` — clears `activatedAt`, returns status to `ready`.
- Update `DISPATCH_STATUS_LABEL` with `activated: "Activated"`.

### 2. Active list / dashboard hide rule
- `src/components/dispatch/ActiveSessionsList.tsx` — filter out `status === "activated"`.
- `src/components/dispatch/MiniDashboard.tsx` — exclude activated sessions from active counts; optionally show a small "Archived: N" stat linking to the new tab.

### 3. Workspace action — `src/routes/_authenticated/contact-dispatch.$sessionId.work.tsx`
- After the existing "Mark Ready for Activation" button, add a **Mark Activated** button, enabled only when `session.status === "ready"`.
- Confirm via a new lightweight `MarkActivatedModal` (`src/components/dispatch/MarkActivatedModal.tsx`) mirroring `MarkReadyModal` styling. Bullets: sets status Activated, stamps activated timestamp, hides from active list + dashboard, moves to Archive.
- On confirm: call `markActivated`, toast, navigate back to `/contact-dispatch`.

### 4. New Archive tab inside Contact Dispatch
- Convert `src/routes/_authenticated/contact-dispatch.tsx` into a pure layout (`component: () => <Outlet />`) and split the current index UI into `src/routes/_authenticated/contact-dispatch.index.tsx`.
- Add `src/routes/_authenticated/contact-dispatch.archive.tsx` rendering a new `DispatchArchiveList` component.
- On the index page, add a tab/toggle row at the top: **Active** (current view, links to `/contact-dispatch`) and **Archive** (links to `/contact-dispatch/archive`), styled like existing dispatch chips. Same toggle appears on the archive page.

### 5. New component — `src/components/dispatch/DispatchArchiveList.tsx`
- Lists sessions where `status === "activated"`, newest `activatedAt` first.
- Card shows account name/number, ticket #, activated timestamp (Central short), and actions: **Open** (route to `.../work`), **Reopen** (calls `reopenFromArchive`, toasts, returns to Active).
- Empty state: "No activated sessions yet."

### 6. Completed Work compatibility — `src/components/completed-work/CompletedWorkPage.tsx`
- Update the dispatch filter to include both `ready` and `activated` so historic + newly archived sessions still appear in the unified Completed Work list (kind = dispatch). No schema change beyond what's in step 1.

## Out of scope

- No backend / DB changes (dispatch sessions live in the existing client store).
- No changes to Reason Flow, Checks, Summary Notes, or readiness logic.
- No renaming of "Mark Ready for Activation" — it stays as the gate before Activated.
