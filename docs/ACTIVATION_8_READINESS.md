# ACTIVATION 8 — Production Readiness Drill

Final activation. No Activation 9. Scope was proving the system can fail, recover,
protect itself, preserve data and be operated safely — not adding product features.

Baseline entering the drill: 1017 tests, typecheck clean, build clean.
Baseline leaving the drill: **1044 tests**, typecheck clean, build clean.

---

## 1. Readiness inventory (before any change)

| Area | Mechanism already present | Verdict |
| --- | --- | --- |
| Authentication | Supabase session, `_authenticated` route gate, inactivity auto-logoff | Present |
| Authorization | `authorized_users` + `has_role` security-definer, re-checked at execute time in `execution-guard.ts` | Present |
| Kill switch / safe mode | `execution/kill-switch.ts`, enforced in the guard before any reservation | Present, **not durable** (defect 1) |
| Governed execution | `execution-engine.ts` — resolve → authorize → confirm → reserve → conflict → apply → verify → audit | Present |
| Confirmation | `confirmation.ts` — plan-bound, operator-bound, time-limited, single use | Present |
| Idempotency | Durable server ledger (`action_ledger`) with reserve/finalize + duplicate suppression | Present |
| Honest failure | `rejected` / `uncertain` / `partial` / `compensation_available` receipts; never "succeeded" without verification | Present |
| Agent bounds | `agent-runtime.ts` — one invocation per cycle, budgets, loop + no-progress stops, capped at PREPARE | Present |
| Audit trail | `operational_event_ledger`, `auth_audit_log`, `ticket_access_log` — insert + select policies only, no update/delete | Present, append-only |
| Local hygiene | `purge-local-data.ts` wipes `aih:` keys on sign-out | Present |
| Cloud persistence | `cloud-sync/blob-sync.ts`, per-user JSON blobs, RLS-scoped | Present, **silent + unbounded on failure** (defect 2) |
| Migrations | 38 SQL migrations, forward-only, all public tables have RLS + GRANTs | Present |
| Script Twin safety | `twin-simulation.ts` — simulation only, no Amtelco write path, `validatedAgainstRealExport: false` | Present |
| Backup / restore | — | **Absent** (defect 3) |

Everything below reuses these mechanisms; no parallel system was introduced.

---

## 2. Defects found and repaired

### Defect 1 — the emergency stop did not survive a reload
The kill switch lived in process memory only. A page refresh, crash or new tab
silently re-enabled execution while an incident was still open.

**Repair** (`execution/kill-switch.ts`): the mode is persisted, restored on load,
and every change keeps a bounded local trail (mode, actor, reason, timestamp). A
corrupt or unreadable record falls back to **disabled**, never to enabled. Safe mode
is now reachable from the UI, not only from code.

### Defect 2 — a failed cloud save looked identical to a successful one
`blob-sync` retried every 10 seconds forever and reported failure only to the
browser console. An operator could work a full shift believing work was in the cloud.

**Repair**: bounded exponential backoff (5s → 120s, 6 attempts) then an explicit
stop, plus `cloud-sync/sync-health.ts` — a per-store state of
`synced / local_only / retrying / sync_failed` surfaced in Settings in plain words
("your work is safe on this device only"). A failed hydrate is also labelled instead
of silently leaving stale local state looking authoritative.

### Defect 3 — there was no way to back up or restore a workspace
No export, no import, no integrity checking.

**Repair** (`backup/snapshot.ts` + Settings → Backup & Recovery): one-file export of
every `aih:` store with a deterministic checksum; restore verifies format, version,
entry count, value types and checksum **before writing anything** and refuses damaged,
edited, truncated or foreign files outright. Writes happen before pruning, a
pre-restore safety copy is always taken, and a failed restore rolls back — or, if the
device cannot even be rolled back, says so and hands the operator the recovery copy.

### Defect 4 — an execution path could skip the role check
`execution-guard.ts` only ran the permission check when a canonical capability
definition existed. Production capabilities all have one, so this was not exploitable
in the shipped allowlist, but it was a fail-open branch.

**Repair**: an unconditional role floor for any state-changing operation, applied
before the per-capability permission check.

---

## 3. Drill results

`src/lib/readiness/activation8-drills.test.ts` — 27 drills, all passing.

| # | Drill | Result |
| --- | --- | --- |
| 3 | Backup captures every workspace store and nothing else | PASS |
| 3 | Backup verifies against its own integrity check; checksum is order-independent | PASS |
| 4 | Restore round-trips a workspace onto an empty device | PASS |
| 4 | Restore removes stale keys absent from the backup | PASS |
| 4 | Truncated backup refused, existing data untouched | PASS |
| 4 | Edited backup refused on checksum | PASS |
| 4 | Backup claiming more areas than it carries refused | PASS |
| 4 | Foreign file / newer-version file refused | PASS |
| 4 | Restore that cannot finish never empties the device; recovery copy returned | PASS |
| 7 | Revoked role: previously confirmed change refused, provider never called | PASS |
| 7 | Downgraded role (viewer): refused | PASS |
| 6 | Provider unreachable: never reported as success | PASS |
| 11 | Lost answer: recorded as uncertain, not done and not failed | PASS |
| 12 | Verification unavailable: not reported as verified | PASS |
| 9 | Safe mode allows only low-risk reversible work | PASS |
| 10 | Emergency stop refuses everything, provider untouched | PASS |
| 10 | Stop is recorded with who, when and why | PASS |
| 10 | Stop survives a reload | PASS |
| 10 | Corrupt control record falls closed | PASS |
| 10 | Stop is explained in plain language, no error codes | PASS |
| 14 | Store labelled "not saved to cloud" once writes stop succeeding | PASS |
| 14 | Operator warned in plain language that work exists on this device only | PASS |
| 8 | Session end reports sync as paused, not as saved | PASS |
| 14 | Warning clears on the next successful write | PASS |
| 14 | Failed cloud read leaves local work intact | PASS |

Already covered by existing suites and re-run unchanged: confirmation forgery,
replay, tamper and expiry (phase 10.5 red team); idempotency and duplicate
suppression; partial effects; compensation on verification mismatch; agent budget,
loop and no-progress stops; Script Twin containment.

---

## 4. Production readiness matrix

| Capability | State | Evidence |
| --- | --- | --- |
| Backup | **Ready** | Operator-triggered, integrity-checked, covers all workspace stores |
| Restore | **Ready** | Verified-before-write, all-or-nothing, rollback on failure |
| Migration / rollback | **Ready with limits** — forward-only SQL migrations, reviewed and applied one at a time; there is no automated schema downgrade. Data is recoverable from backup, schema is not self-rolling. |
| Provider outage | **Ready** | Refusal, not partial application; outage named in the receipt |
| Permission revocation | **Ready** | Re-checked at execute time plus an unconditional role floor |
| Session recovery | **Ready** | Session re-validated before every cloud write; sync pauses and says so |
| Safe mode | **Ready** | Low-risk reversible only, operator-reachable |
| Kill switch | **Ready** | Durable, audited, fails closed on a corrupt record |
| Governed action failure | **Ready** | Honest statuses; never "succeeded" without verification |
| Verification failure | **Ready** | Uncertain / compensation-available, never verified |
| Agent runtime | **Ready** | Bounded, capped at PREPARE, deterministic stop reasons |
| Storage / sync failure | **Ready** | Bounded retry, explicit not-saved state, local work preserved |
| Event / audit integrity | **Ready** | Append-only tables (insert + select policies only) |
| Privacy / retention | **Ready with an open action** — see below |
| Script Twin safety | **Ready** | Simulation only; `validatedAgainstRealExport` remains **false** |

### Open action outside the code (cannot be fixed from here)

The project's generated `.env` is tracked in git and contains a
`SUPABASE_SERVICE_ROLE_KEY`. It is **not** present in any built client or server
bundle (verified by scanning `dist/`), so it does not ship to browsers — but a
privileged key should not live in version control. This file is platform-generated
and must not be hand-edited, and untracking it requires git operations outside this
environment. Recommended: rotate the service role key and remove the file from
tracking. Recorded here rather than silently patched.

---

## 5. Verification

- `bunx vitest run` → **1044 / 1044 passing**, 59 files
- `bunx tsgo --noEmit` → clean
- `bun run build` → clean
- Governance surfaces unchanged: capability allowlist, autonomy cap (PREPARE),
  confirmation contract and ledger schema are all as they were at Activation 7.

**ACTIVATION 8 COMPLETE — PRODUCTION READY WITH DOCUMENTED LIMITS.**
