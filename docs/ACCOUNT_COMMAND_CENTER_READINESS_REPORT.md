# Account Command Center — Full-System Activation Report (Phase 10.5)

## What was attacked

The system was treated as one organism, from operator intent through cognition,
capability resolution, governance, confirmation, execution, reality
verification, recovery, audit and observability. 51 compound adversarial tests
were added in `src/lib/execution/phase105-red-team.test.ts`, on top of the
existing 860.

### Attack classes covered

- **Allowlist inventory** — exactly five executable capabilities; every one
  declares verification, a retry ceiling, non-automatic compensation and a
  confirmation at or above its class floor. Read/prepare capabilities have no
  execution contract at all.
- **Happy path integrity** — a single correlation id survives the full chain and
  the lifecycle phases run in exactly one order.
- **Executed ≠ verified** — unavailable verification, lost responses, partial
  effects and verification mismatches each produce a distinct honest state, and
  never the word "done".
- **Confirmation tampering** — effect edits, target/account swaps, capability-id
  swaps, risk/confirmation downgrades, replays, forged proofs, cross-operator
  reuse, TTL boundaries, dual-confirmation distinctness, exact typed phrase.
- **Authority drift** — role loss, session loss, source-system degradation, kill
  switch and safe mode between confirmation and execution all block before any
  provider call.
- **Concurrency** — pre-state drift, duplicate submits, two tabs racing the same
  plan: exactly one effect, ever.
- **Retry discipline** — idempotent work retries to its ceiling; non-idempotent
  work never retries after an unknown outcome.
- **Dependency loss** — ledger reserve failure blocks execution; ledger write
  failure after the effect keeps the effect discoverable and flags the audit
  gap; missing provider fails closed; missing Guardian fails closed.
- **Escalation and injection** — requests to raise autonomy, extend the
  allowlist, skip confirmation or self-confirm are refused; retrieved text
  claiming authority mints nothing; intelligence signals never authorize.
- **Receipt hygiene** — no prompts, no chain-of-thought, no credentials; hostile
  content stays inert data.

## Defects found and fixed

1. Health was inherited from planning time — now re-derived at execution time.
2. Unverifiable-but-applied effects finalized as clean successes — now annotated.
3. `plan.confirmation` was outside the fingerprint — now covered, so a
   confirmation floor cannot be downgraded after confirmation.

## Result

911/911 tests pass; typecheck clean. Autonomy ceiling unchanged at PREPARE; the
executable allowlist was not expanded.

**ARCHITECTURE ACTIVATION READY**
