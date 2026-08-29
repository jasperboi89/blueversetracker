# Governed Agentic Operations (Phase 10)

Account Command Center can now **execute** a narrow, allowlisted set of
operations — and only through one governed path. It is still not an autonomous
agent. The autonomy ceiling remains **PREPARE**: cognition may resolve, plan,
explain and prepare; only a human turns a plan into an effect.

## The one execution path

```
resolve → precondition → authorize (Guardian, re-checked now)
        → confirm (bound, single-use proof) → reserve (idempotency)
        → conflict check (TOCTOU) → apply → verify → audit → recover
```

There is no second write path and no "execute anything" escape hatch. A
capability that is not on the executable allowlist can only ever be prepared
for the operator to do manually.

| Module | Responsibility |
| --- | --- |
| `execution-contract.ts` | Operation classes, risk classes, confirmation modes, failure classes, receipts |
| `executable-registry.ts` | The allowlist; floors each confirmation mode by class + risk |
| `execution-plan.ts` | Immutable, fingerprinted plans; integrity re-check |
| `confirmation.ts` | Confirmation proofs: bound, time-limited, single use |
| `execution-guard.ts` | Guardian gate re-evaluated at execution time |
| `kill-switch.ts` | Global off switch and safe mode |
| `execution-engine.ts` | The lifecycle, retries, verification, recovery |
| `execution-provider.ts` | Adapter port — effects only, never governance |
| `execution-store.ts` | Bounded, in-session Action Center state |

## Why each guard exists

**Immutable plans.** A plan is fingerprinted over exactly the fields that
determine the effect. A confirmation is bound to that fingerprint, so an edited
plan can never reuse an old approval — the fingerprint moves and validation
fails.

**Confirmation as proof, not a flag.** `confirmed: true` does not exist in the
execution path. A `ConfirmationProof` carries the plan fingerprint, the
operator, an expiry and a one-time token. High-risk work requires a typed
phrase; critical/external work requires a second, different operator.

**Guardian re-check.** Role, capability lifecycle, allowlist membership, kill
switch and preconditions are all re-evaluated immediately before reservation.
An authorization from planning time proves nothing about now.

**TOCTOU.** The target's execution-relevant state is fingerprinted at plan time
and re-read before apply. Drift, or an unreadable target, stops the change.

**Idempotency.** The key is derived from the effect, not the attempt, and is
claimed server-side. Only a *proven* prior success reports a duplicate; an
expired lease reports **uncertain**.

## Honest outcomes

Failure is classified, never flattened. Three outcomes are deliberately not
success and not failure:

- `timeout_unknown_state` — the source system gave no decisive answer.
- `partial_effect` — some effects landed, others did not; both lists are shown.
- `verification_unavailable` — the change was submitted but could not be
  independently confirmed.

Each carries a recovery recommendation (`verify_manually`, `retry_safe`,
`compensate`, `escalate`) that is **always** `automatic: false`. The system
proposes; the operator decides.

## Verification is separate from execution

A provider saying "applied" is a claim. Verification re-reads the declared
authority (`database`, `provider`, or `operator`). If verification contradicts
the intent, the run ends in `compensation_available` with the capability's
declared compensation step — there is no automatic rollback.

## Retries

Retries are attempted only when *all* of these hold: the capability declares
idempotency support, the failure class is retry-safe (`provider_unavailable`),
and the attempt ceiling has not been reached. Unknown outcomes are never
retried.

## Kill switch and safe mode

`executionControl.disable(reason)` refuses every execution before any
reservation or provider call. `safeMode` narrows execution to low-risk,
reversible operations. Planning, preview and confirmation UX keep working so an
operator can still see what *would* happen.

## Audit

Every execution reserves and finalizes a row in the server-side action ledger
(RLS-scoped to the operator) and emits sanitized `capability.*` events on the
Event Spine. The Action Center is observability only — bounded, in-session, and
never a substitute for the durable ledger.
