# Account Cortex — Operator UI

**Phase 3, Part 3/4/7/9** — `src/components/intelligence/*`, mounted on the Account page.
Status: **BUILT NOW** (extends the existing Account page; no duplicate app).

## Where it lives

An **Account Intelligence** section (`AccountIntelligenceTab`) is added to the
existing `accounts/$accountNumber` route, above the account timeline. It does not
replace anything — it extends the page and reuses the loaded Account Context Pack
(`useAccountContext`) plus the durable ledger.

## Sections

1. **Observations (derived)** — pattern observations rendered through the
   `ClaimInspector` (Part 9): STATUS (confidence class), BASIS (concise reasoning
   — never chain-of-thought), linked SOURCES (evidence), last-observed, and a
   feedback row. Empty state is explicit ("appears as … accumulates — never
   invented").
2. **What fixed this before?** (Part 7) — ranked prior resolutions for the
   account, labelled "investigative evidence — verify before applying".
3. **Intelligence timeline (canonical)** (Part 4) — a chronological, filterable,
   provenance-tagged list merged from canonical facts + ledger-only (AI /
   intelligence) events. Each row is evidence-linked; no fabricated history.

## Fact / observation / synthesis separation

The UI distinguishes:

- **CANONICAL FACT** — timeline items with provenance `canonical`.
- **DERIVED OBSERVATION** — pattern observations (ClaimInspector), always
  carrying a confidence class + evidence.
- **AI SYNTHESIS** — intentionally **absent** in Phase 3. The Account Cortex UI
  surfaces grounded, deterministic intelligence only; nothing here is model-
  generated prose.

## Claim Inspector (Part 9)

`ClaimInspector` is reusable across patterns / radar / resolution matches. It
shows evidence + a concise reasoning summary and hides evidence behind an
"Evidence" toggle so everyday UI stays quiet. It never shows hidden
chain-of-thought.

## Persistence

Visiting an account evaluates its observations and reconciles them into
`account-cortex-store` (Part 11): active observations (ids + evidence ids +
confidence), plus a bounded history of resolved/expired ones. Canonical facts
stay in their canonical stores — the record only projects and connects.

## FOUNDATION ONLY

- Observations come from the two pack-supported detectors (repeated-issue,
  change/incident proximity). More activate as signals land (see
  `PATTERN_INTELLIGENCE.md`).
- "What fixed this before?" here uses same-account pack resolutions; cross-
  account / Freshdesk / Knowledge tiers are wired in `what-fixed-this.ts` and
  surface as those retrievers come online.

## FUTURE

Overview/Resolutions/Knowledge as dedicated Cortex tabs; a persistent scored
world model; adaptive layout. Not built.
