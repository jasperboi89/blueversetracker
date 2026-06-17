## Problem

`Open Work` navigates correctly to `/additional-work/$workId/work`, but the page stays blank (button looks dead) because the parent route file `src/routes/_authenticated/additional-work.tsx` renders the full `AdditionalWorkPage` instead of an `<Outlet />`. Since it has a child route (`additional-work.$workId.work.tsx`), TanStack needs the parent to render `<Outlet />` so the child can mount.

## Fix

1. Convert `src/routes/_authenticated/additional-work.tsx` into a pure layout route:
   - `component: () => <Outlet />`
   - Strip all UI/imports, keep only the route definition.

2. Create `src/routes/_authenticated/additional-work.index.tsx`:
   - Move the current `AdditionalWorkPage` and its helpers (`Header`, `SectionTitle`, `ActiveCard`, `CompletedCard`) here.
   - `createFileRoute("/_authenticated/additional-work/")` with the existing head/meta.

No business logic changes — pure routing restructure.
