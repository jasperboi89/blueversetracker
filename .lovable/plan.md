## Phase 7 — Authorization Gate & Login Screen

A real Lovable Cloud (Supabase) auth gate in front of the entire Hub. Email/password only. No public sign-up. Authorized-users table controls who actually gets in, with roles (Admin/Programmer/Viewer). Inactivity auto-logoff at 30 minutes with a 2-minute warning. Auth events persisted to a server-side audit table.

### 1. Database (one migration)

**`public.app_role`** enum: `admin | programmer | viewer`.

**`public.authorized_users`**
- `id uuid pk`, `user_id uuid` (nullable, FK `auth.users` on delete set null — populated on first sign-in), `email citext unique not null`, `role app_role not null default 'viewer'`, `status text not null default 'active' check in ('active','disabled')`, `created_at`, `created_by uuid`, `last_login_at`.
- RLS: only Admins (via `has_role`) can `select/insert/update`; each user can `select` their own row; nobody can `delete`.
- Grants: `select,insert,update` to `authenticated`; `all` to `service_role`.

**`public.has_role(_user_id uuid, _role app_role) returns boolean`** — security definer, reads `authorized_users` by `user_id` + `status='active'`. Used in RLS without recursion. Roles are NEVER stored on `profiles`.

**`public.auth_audit_log`**
- `id uuid pk`, `event_type text` (`login_success | login_failed | logout | access_denied | session_timeout | role_check_failed`), `user_id uuid null`, `email text null`, `role app_role null`, `ip text null`, `user_agent text null`, `meta jsonb`, `created_at`.
- RLS: only Admins read; only `service_role` writes (writes happen from server functions). No client-side inserts.
- Grants: `select` to `authenticated` (gated by RLS); `all` to `service_role`.

**Seed:** insert `lucast@anser.com` as `role='admin', status='active', user_id=null`. The row links to `auth.users` on first successful sign-in via a server function (below) — no risk of an unauthorized user grabbing it because the seed row exists before any account is created.

**Trigger `handle_new_user`:** on `auth.users` insert, look up `authorized_users` by lowercased email. If found and `user_id is null`, set `user_id = NEW.id`. If not found, do nothing (the gate will block them on first sign-in). Never auto-create authorized rows.

### 2. Supabase Auth config

- Email/password ON, **disable_signup = true** (no public registration).
- `external_anonymous_users_enabled = false`.
- `auto_confirm_email = false` (real reset emails go through Lovable's auth email flow).
- `password_hibp_enabled = true` (leaked-password protection).
- Scaffold Lovable auth email templates for password reset / email confirmation, styled to BlueVerse (background stays #ffffff per spec).

### 3. Server functions (`createServerFn`, all under `src/lib/auth/`)

- `checkAuthorization` — middleware `requireSupabaseAuth`. Returns `{ ok, role, status, email }` by reading `authorized_users` for `context.userId`. Updates `last_login_at` on success. Writes `login_success` or `access_denied` to audit log (admin client, server-only). Used by the auth gate on every protected nav.
- `logAuthEvent` — `requireSupabaseAuth`, accepts `{ type: 'logout' | 'session_timeout' }`, writes to audit table with user id/email/role.
- `requestPasswordReset` — public fn, calls `supabase.auth.resetPasswordForEmail` server-side; always returns the same success shape regardless of whether email exists (no enumeration).
- `adminListUsers` / `adminAddUser` / `adminSetStatus` / `adminSetRole` — `requireSupabaseAuth` + `has_role('admin')` check, server-only `supabaseAdmin` loaded inside handler. **Authored but not yet surfaced in UI this phase** (only Settings → Security & Access read-only panel uses `adminListUsers` to show counts).

All server fns that use admin powers load `client.server` via `await import(...)` inside the handler, per stack rules.

### 4. Routing & gates

- New `src/routes/auth.tsx` (public): BlueVerse login card, sign-in form, Forgot Password link, Reset Password mode (when URL has `?reset=1`). Redirects to `/` if already authenticated + authorized.
- New `src/routes/access-denied.tsx` (public): BlueVerse glass panel, "Return to Login" button (signs out + navigates to `/auth`).
- New `src/routes/reset-password.tsx` (public): handles `type=recovery` hash and calls `supabase.auth.updateUser({password})`.
- Move every existing top-level page into the integration-managed `src/routes/_authenticated/` subtree:
  - `_authenticated/index.tsx` (Home), `freshdesk-tickets.tsx`, `freshdesk-tickets.$ticketId.work.tsx`, `contact-dispatch.tsx`, `contact-dispatch.$sessionId.work.tsx`, `additional-work.tsx`, `additional-work.$workId.work.tsx`, `accounts.tsx`, `accounts.$accountNumber.tsx`, `reports.tsx`, `settings.tsx`.
  - Each existing file is **moved** (not duplicated); the `createFileRoute("/...")` string is updated to `"/_authenticated/..."`.
- `_authenticated/route.tsx` is the integration-managed gate (`ssr: false`, redirects to `/auth`). On top of that we add a child layout `_authenticated/route.tsx` extension via an **`AuthorizationGuard`** component rendered inside the layout's `<Outlet />` wrapper: it calls `checkAuthorization` once on mount, while loading renders a glass spinner, on `denied` navigates to `/access-denied` and signs out, on `ok` provides role via React context (`useHubRole()`).

### 5. App shell additions

- `__root.tsx`: register a single filtered `onAuthStateChange` listener (SIGNED_IN / SIGNED_OUT / USER_UPDATED) → `router.invalidate()` and `queryClient.invalidateQueries()` only when signed in.
- `AppSidebar` footer: user chip (initials + email tooltip + role badge) and a Logout button. Logout flow: `cancelQueries → clear → logAuthEvent('logout') → supabase.auth.signOut → navigate('/auth', replace:true)`.
- Top header: small "HIPAA-Safeguarded · Internal Use" pill (muted, right-aligned, not loud).
- New `InactivityWatcher` mounted inside `_authenticated`: tracks `mousemove`, `keydown`, `click`, `touchstart`, route changes. At 28 min idle opens warning modal; at 30 min calls logout with `session_timeout` audit event. Constants live in a config so they can move to Settings later.

### 6. Login screen (BlueVerse)

Centered glass card on the existing galaxy background. Reduced-motion respects the existing `data-motion` attr.

```text
┌──────────────────────────────────────┐
│            ◆ 3D shield icon          │
│         Account Intel Hub            │
│             AnSer Ops                │
│   HIPAA-Safeguarded · Internal Use   │
│ ──────────────────────────────────── │
│ Authorized access only.              │
│ This system may contain confidential │
│ operational and protected info...    │
│ ──────────────────────────────────── │
│  [ Email                       ]     │
│  [ Password                    ]     │
│  [        Sign In              ]     │
│  Forgot password?                    │
│ ──────────────────────────────────── │
│ By signing in, you agree to use      │
│ this system only for authorized work │
└──────────────────────────────────────┘
```

3D shield uses a layered cyan/violet radial gradient + inner glow + soft shadow (no external asset, pure CSS like the existing icon tiles).

Login submit:
1. `supabase.auth.signInWithPassword`.
2. If error → audit `login_failed` via server fn → toast "Invalid email or password." (no enumeration).
3. If success → server fn `checkAuthorization` runs. Active → navigate `/`. Disabled or missing → sign out + navigate `/access-denied` + audit `access_denied`.

Forgot Password is a second view inside the same card: email field → `requestPasswordReset` → always shows "If an account exists, a reset link will be sent."

### 7. Role enforcement (Phase 7 scope)

- Roles are loaded into `HubRoleContext` after the gate clears.
- Sidebar: `Settings` link visible only to Admin.
- Top-level "create / edit / complete / delete / archive / mark posted/sent" buttons receive `disabled` + tooltip "Read-only access" when role is `viewer`. Implemented via one small `useCanWrite()` hook used at button sites — no page rewrites.
- Server-side: write-capable server fns added later will check role; this phase relies on RLS + UI gating (no new write fns added).

### 8. Settings → Security & Access (read-only panel, Admin-only section)

A new `SectionCard` above "Data / Cleanup":
- Authentication: Active
- Authorized users only (count from `adminListUsers`)
- Auto-logoff: 30 minutes
- Roles enabled: Admin · Programmer · Viewer
- Audit logging: Enabled

No user management UI in this phase.

### 9. Files

**New:**
- `src/routes/auth.tsx`, `src/routes/access-denied.tsx`, `src/routes/reset-password.tsx`
- `src/components/auth/LoginCard.tsx`, `ForgotPasswordCard.tsx`, `ShieldIcon3D.tsx`, `AuthorizationGuard.tsx`, `InactivityWatcher.tsx`, `InactivityWarningModal.tsx`, `UserChip.tsx`, `HipaaPill.tsx`
- `src/lib/auth/authorization.functions.ts`, `audit.functions.ts`, `admin-users.functions.ts`, `password-reset.functions.ts`
- `src/lib/auth/role-context.tsx` (provider + `useHubRole`, `useCanWrite`)
- `src/lib/auth/inactivity-config.ts` (timeout constants)

**Edited:**
- `src/routes/__root.tsx` (auth listener), `src/components/layout/AppShell.tsx` (header pill), `src/components/layout/AppSidebar.tsx` (user chip, logout, role-gated Settings)
- `src/routes/settings.tsx` (Security & Access section)
- Every existing top-level route file moved into `src/routes/_authenticated/...` with updated `createFileRoute` strings
- `src/start.ts` (already has `attachSupabaseAuth` — verify)

### 10. Strict guarantees

- No password ever in `localStorage` or any client store; only Supabase's own httpOnly-ish session storage handles tokens.
- No service-role key or API key in client bundles; `client.server` is only imported inside server-fn handlers via `await import(...)`.
- `disable_signup=true` at the Supabase config level — public sign-up is impossible even if someone POSTs directly.
- The `AuthorizationGuard` calls `checkAuthorization` server-side every protected mount; client cannot bypass by editing JS.
- Existing localStorage Phase 1–6 stores remain shared per browser (per your answer); no PHI/PII is stored client-side today.
- Wording stays "HIPAA-Safeguarded · Internal Use" everywhere — no "HIPAA compliant" claim.
- After logout: `queryClient.clear()` + `replace:true` navigation, so browser back cannot re-render protected pages from cache.

### 11. Out of scope (explicitly deferred)

- Admin user-management UI (add/disable/role-change screens).
- Audit log viewer UI.
- Per-action server-side role enforcement on every existing write path (RLS + UI gating covers Phase 7; full server-fn migration of writes lands later).
- Google / SSO providers.
- Configurable inactivity timeout in Settings UI (constant for now).