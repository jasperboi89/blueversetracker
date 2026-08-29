# ACTIVATION 1 — Executable Capability Audit & Activation Selection

Audit-only pass. No capability was enabled, no allowlist widened, no confirmation
policy changed, no production behaviour modified.

## 1. Baseline

| Check | Result |
| --- | --- |
| Vitest | 911 / 911 passing, 52 files |
| Typecheck (`tsgo --noEmit`) | clean, 0 errors |
| Production build | success (`vite build` + nitro worker output) |
| Runtime | not exercised — no operator-facing surface currently produces an execution plan (see §4) |

Baseline matches the Phase 10.5 architecture gate exactly (911).

## 2. Where the truth lives

- `src/lib/execution/executable-registry.ts` — the EXECUTABLE allowlist (5 real + 3 fixtures)
- `src/lib/execution/execution-contract.ts` — operation/risk classes, confirmation floors, receipts
- `src/lib/execution/execution-guard.ts` — Guardian: integrity, allowlist, lifecycle, permissions, live health recheck
- `src/lib/execution/confirmation.ts` — proof minting (operator-only, fingerprint-bound, 5 min TTL, single use)
- `src/lib/execution/execution-engine.ts` — resolve → precondition → authorize → confirm → reserve → conflict → apply → verify → audit
- `src/lib/execution/safe-action-providers.ts` — the only real adapters (4 of 5 capabilities)
- `src/lib/execution/kill-switch.ts` — mode: `enabled` | `safe_mode` | `disabled`
- `src/lib/core/action-ledger.functions.ts` — server-side auth + idempotency + audit
- `src/components/execution/ActionCenter.tsx`, `ConfirmExecutionDialog.tsx` — operator surface

## 3. The five executable capabilities

### C1 `night_plan.item.create`
- Purpose / effect: adds one item to tonight's plan (`nightPlanStore`, local + synced operator store) via Safe Action `add_night_plan_item`.
- Target: `shift` / night plan. Internal portal mutation. **REAL.**
- Operation `reversible_write`, risk `low`, reversibility `reversible`, confirmation `single` (floor `single`, not raised).
- Permission `night_plan.write`, minimum role `programmer`.
- Idempotency: fingerprint-keyed (`exec:<id>:<fp>`), server unique index on (operator, idempotency_key). Retry ceiling 2, retry only on `provider_unavailable`.
- Verification: read-after-write against the store — item with matching task reads back. **STRONG (internal canonical read).**
- Failure states: precondition (not signed in), duplicate suppressed, verification failed, verification unavailable.
- Recovery: operator completes or removes the item manually (no auto-compensation anywhere in Phase 10).
- Health dependency: none external; local/synced store only.
- UI: Action Center (`/cognitive-runs`). Tests: `phase10-execution.test.ts`, `phase105-red-team.test.ts`.

### C2 `night_plan.item.complete`
- Purpose / effect: marks an existing night plan item done (`complete_night_plan_item`).
- Target: one night plan item. Internal. **REAL.**
- `reversible_write` / `low` / `reversible` / `single`. Permission `night_plan.write`, role `programmer`.
- Preconditions: authenticated, item exists.
- Idempotency fingerprint; maxAttempts 2.
- Verification: item re-read, status must equal `done`; returns `unavailable` honestly when the item cannot be found. **STRONG.**
- Recovery: reopen the item manually. Health: none external.
- UI: Action Center. Tests: Phase 10 / 10.5 suites.

### C3 `freshdesk.ticket.classify`
- Purpose: set the tracked issue classification on a ticket.
- Effect: **local `ticketsStore` only** — it does NOT write to Freshdesk. Name is misleading; the adapter calls `set_ticket_classification` and re-reads the local store.
- Target: tracked ticket. Internal. **REAL (internal), not an external Freshdesk write.**
- `reversible_write` / `medium` / `reversible` / `single`. Permission `ticket.write`, role `programmer`.
- Preconditions: authenticated, ticket tracked locally.
- Verification: read-after-write on `issueClassification`. **STRONG for the local record; UNVERIFIABLE with respect to Freshdesk itself, which it never touches.**
- Recovery: set the classification back manually.
- UI: Action Center. Tests: Phase 10 / 10.5 suites.

### C4 `work.timer.start`
- Purpose: start the work timer against a tracked ticket (`setActiveWork`).
- Effect: active-work state + timer/work-log side effects. Internal. **REAL.**
- `reversible_write` / `low` / `reversible` / `single`. Permission `timer.write`, role `programmer`.
- Idempotency fingerprint; maxAttempts 2.
- Verification: the provider returns `unavailable` unconditionally — there is no running-timer read-back. Every run therefore terminates `uncertain` with the audit note *"executed; verification unavailable — manual check required"*. **UNVERIFIABLE.**
- Recovery: stop the timer manually. Health: none external.
- UI: Action Center. Tests: Phase 10 / 10.5 suites.

### C5 `knowledge.draft.create`
- Purpose: create a durable knowledge draft from a reviewed promotion packet.
- Effect: writes a knowledge note (Curator `create_knowledge_draft` handler exists).
- Target: `knowledge_note`. Internal, durable. **FOUNDATION — declared but NOT wired: no execution provider is registered for this capability id in `safe-action-providers.ts`.**
- `irreversible_write` / `high` / `compensable` / declared `typed` (floor for irreversible_write is `typed`, so not raised). Permission `knowledge.write`, role `programmer`.
- Preconditions: authenticated, promotion packet reviewed.
- Idempotency fingerprint; **maxAttempts 1** (no retry).
- Verification: declared read-after-write from the vault — unreachable today because there is no provider.
- Recovery: archive or supersede the created draft.
- UI: reachable in principle from `PromotionReviewPanel` via the Safe Action path; the *governed execution* path is not connected.
- Current outcome if invoked through the engine: resolve fails with `provider_unavailable`.

Fixture-only contracts (never operator-visible): `fixture.reversible.write`,
`fixture.external.side_effect`, `fixture.blocked.capability`.

## 4. Real write path — as implemented

```
Operator UI (Action Center / Confirm dialog)
  ↓  ⚠ no surface in the app calls buildExecutionPlan() — plans exist only in tests
Plan (immutable, FNV-1a fingerprint over effect fields)
  ↓
Executable registry (allowlist; confirmation floored at load)
  ↓
Guardian (integrity, allowlist, canonical lifecycle, role permissions, LIVE health recheck)
  ↓
Confirmation proof (operator-minted, fingerprint-bound, TTL 5 min, single use, typed/dual phrase)
  ↓
Server enforcement — reserveAction() (Supabase auth middleware, RLS, unique idempotency key)
  ↓  ⚠ engine sends actionType: plan.capabilityId, server zod enum expects handler action types
Provider adapter → Safe Action handler → store mutation
  ↓
Reality verification (independent re-read; "unavailable" is a first-class answer)
  ↓
finalizeAction() → Action Ledger / Audit Log; execution-store → Action Center; Event Spine
```

Two structural gaps block any real run today (both audit findings, unchanged):

1. **No plan producer.** `buildExecutionPlan` has zero non-test callers. Nothing in the portal can currently reach the execution engine.
2. **Server reservation type mismatch.** `execution-engine.ts:216` reserves with `actionType: plan.capabilityId` (`"night_plan.item.create"`), while `action-ledger.functions.ts` validates against `["add_night_plan_item","complete_night_plan_item","set_ticket_classification","start_timer"]`. Every real execution would be rejected at the server reserve step. `create_knowledge_draft` is not in that enum at all.

## 5. Real vs fixture

| Capability | Class |
| --- | --- |
| night_plan.item.create | REAL (internal) |
| night_plan.item.complete | REAL (internal) |
| freshdesk.ticket.classify | REAL (internal store only, despite the name) |
| work.timer.start | REAL (internal), unverifiable |
| knowledge.draft.create | FOUNDATION (no provider) |
| fixture.* (3) | TEST/FIXTURE ONLY |

## 6. Scorecard

| Capability | Real/Fixture | Value | Risk | Confirm | Verification | Reversibility | Dependency | Readiness | Recommended initial state |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| night_plan.item.create | Real | HIGH | low | single | STRONG | reversible | local store | READY TO ACTIVATE (after §4 fixes) | first wave |
| night_plan.item.complete | Real | HIGH | low | single | STRONG | reversible | local store | READY TO ACTIVATE (after §4 fixes) | first wave |
| freshdesk.ticket.classify | Real (local) | MODERATE | medium | single | STRONG locally / UNVERIFIABLE vs Freshdesk | reversible | tickets store | READY WITH RESTRICTIONS | prepare-only |
| work.timer.start | Real | MODERATE | low | single | UNVERIFIABLE | reversible | active-work store | KEEP PREPARE-ONLY | prepare-only |
| knowledge.draft.create | Foundation | MODERATE | high | typed | declared, unreachable | compensable | none wired | KEEP DISABLED | disabled |
| fixture.* | Fixture | INFRASTRUCTURE ONLY | — | — | — | — | — | TEST/FIXTURE ONLY | never exposed |

## 7. Daily-workflow fit (selected candidates)

**Night plan create**
- Trigger: mid-shift, operator says "add a follow-up for account 1042 tonight".
- Portal intelligence: shift context, current night plan, account context.
- Proposed action: plan for `night_plan.item.create` with the task text and priority.
- Confirmation: single click showing the exact effect summary and target.
- Execution: one item appended via the Safe Action handler.
- Verification: the item is re-read from the plan.
- Audit: Action Ledger row + Action Center entry + Event Spine event.

**Night plan complete**
- Trigger: the operator finishes the work the item describes.
- Portal intelligence: matching open item, work timer / completed-work signal.
- Proposed action: plan for `night_plan.item.complete`.
- Confirmation: single click naming the item.
- Execution: status → done.
- Verification: status re-read as `done`.
- Audit: same three surfaces.

## 8. Copilot fit

The architecture already supports prepare → confirm → execute for all four wired
capabilities: capabilities are `discoverable: true, callable: false,
requiresProposal: true`, and Copilot can only produce a proposal. No Copilot
execution path was added or enabled in this pass.

## 9. Direct UI fit

- Night plan create/complete: cleanest entry is the existing **Night Plan panel** row action, with review in the **Action Center**. Copilot proposal is a secondary path.
- Ticket classify: the **ticket work page** classification control (already exists as a direct edit).
- Timer start: the existing **start-timer button** — governed execution adds nothing.
- Knowledge draft: **PromotionReviewPanel**, which already runs the Safe Action path.
No new UI was created.

## 10. Activation safety matrix (wired capabilities)

| Control | Status |
| --- | --- |
| Server-side authorization | present (`requireSupabaseAuth` + RLS) |
| Account isolation | resourceScope `crossAccount: false`; ledger rows scoped to operator |
| Operator ownership | proof `operatorRef` compared at execute time |
| Plan fingerprint | present, recomputed and verified |
| Confirmation proof | operator-only mint, single use |
| Confirmation expiry | 5 minutes |
| Execution health recheck | present (Phase 10.5 fix) |
| Kill switch / safe mode | present, admin-toggled in Action Center |
| Idempotency | fingerprint + server unique index — **currently blocked by the actionType mismatch** |
| Verification | strong for night plan + classify; absent for timer |
| Audit | Action Ledger + execution store + Event Spine |
| AgentRunInspector visibility | present at `/cognitive-runs` |

## 11. Recommended first activation wave (max two)

1. `night_plan.item.create`
2. `night_plan.item.complete`

Frequent in real shift work, low risk, tiny blast radius, strong read-after-write
verification, clean idempotency, trivially reversible by hand, and immediately
understandable to an operator.

**Both remain BLOCKED until the two §4 gaps are closed.** No activation should
happen in this pass.

## 12. Keep locked

- `freshdesk.ticket.classify` — prepare-only. The name implies an external Freshdesk write it does not perform; activating it as "classify the ticket" would be operationally dishonest until the naming or the effect is reconciled.
- `work.timer.start` — prepare-only. Verification is unconditionally unavailable, so every run terminates `uncertain`. A governed path that can never confirm itself is worse than the existing button.
- `knowledge.draft.create` — disabled. No provider, irreversible write, high risk, no retry.
- `fixture.*` — test-only, permanently hidden from operator surfaces.

## 13. Current execution settings (unchanged)

- Execution mode: `enabled` (module default in `kill-switch.ts`; admin can switch to `disabled` from the Action Center).
- Safe mode: available, not active; when on, only `reversible` + `low` risk may execute — which happens to permit exactly the two recommended candidates.
- Roles: all five capabilities require minimum role `programmer`; `viewer` holds only `portal.read`.

## 14. Required changes before activation

1. Align the ledger reservation contract — either send the canonical Safe Action `actionType` from the engine, or widen the server enum to capability ids. Server-side validation must stay strict.
2. Add one operator-facing plan producer (Night Plan row action → `buildExecutionPlan` → Confirm dialog → Action Center).
3. Run a fixture execution, then a single bounded real execution, and confirm the Action Ledger row, Action Center entry and Event Spine event all appear.
4. Confirm safe-mode behaviour explicitly permits the two candidates and refuses the rest.

## 15. Technical debt

- `freshdesk.ticket.classify` name vs effect mismatch.
- `work.timer.start` has no verification authority.
- `knowledge.draft.create` is declared executable with no provider — the allowlist over-reports readiness by one.
- `registerSafeActionProviders()` is called lazily inside a UI handler rather than at bootstrap.

## 16. Activation 2 dependencies

Closing the reservation mismatch, adding the plan producer, and a first bounded
real execution with a verified ledger row.
