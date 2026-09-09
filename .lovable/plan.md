# ScriptIQ — powered by LogicLens

Replaces the retired Script Twin concept with a real Amtelco script analysis workspace, built as a new top-level section of the portal. Everything else in the portal (dispatch, tickets, night plan, Knowledge Vault notes) is untouched.

## What exists today

The current script work lives entirely inside the Knowledge Vault under "IS Script Work":

- **Script Twin** (`twin/` renderer, sample screens, pale Infinity look-alike) — a demo of a screen it cannot really read. Retired.
- **Simulator** — a hand-fed walkthrough of a pasted script. Retired.
- **Script Import (IIF)** — a real, honest parser: dialect detection, a declared construct registry, coverage reporting, unknown-line capture, and mandatory PII redaction before anything is analysed. Strong foundation, kept.
- **Dependency Cortex** — component/dependency graph over parsed text. Refactored into DataTrace.
- **Manuals** — PDF upload to private storage, page-level text extraction, full-text search. Becomes ScriptIQ's document ingestion base.
- **Script Entries** — the snippet library. Stays in the Knowledge Vault, unchanged.

Also reusable as-is: authentication and the authorized-user gate, private file storage with signed URLs, the evidence/provenance vocabulary, the AI gateway wiring, the app shell, and the finding/queue UI patterns.

Removed from the product: the Twin renderer and its samples, the Simulator, the "Enter Script Twin" home tile and its Knowledge Vault tab, and every assumption that a script can be replayed as a fake screen.

## Architecture

New route family `/scriptiq` with its own sidebar group:

```
/scriptiq                    Dashboard — reviews needing action
/scriptiq/accounts           Account list
/scriptiq/accounts/$number   Account Knowledge Profile + interviews
/scriptiq/reviews/$reviewId  Review workspace, tabbed:
     Sources · Findings · Questions · ModeMap · FlowTrace
     DataTrace · DatabaseTrace · ClientMatch · TestBench · Package
```

A **Review** is the unit of work: one account, a set of uploaded sources, one reconstructed script model, and the findings/questions derived from it. Analysis runs server-side and is stored, never recomputed silently in the browser.

Layered so evidence never gets laundered:

```
uploaded source (kept intact in private server-side storage)
  → adapters parse the ORIGINAL, full-fidelity source
  → ScriptModel (screens, elements, branches, fields, actions, SQL calls)
      every node carries provenance + confidence
  → LogicLens rules (deterministic) run against the full model
  → minimization layer builds a redacted derivative for AI only
  → AI pass (labelled inferred) → requirement extraction, question wording
  → Question Engine → answers → Account Knowledge → re-run
```

### Sensitive-data handling

The original source is never destroyed or degraded, and parsing and deterministic rules operate on it directly — accuracy depends on that. Redaction is a **derivative built at the AI boundary**, not a gate on ingestion:

- A minimization step produces an AI-safe projection of only the fragments a given AI call needs. The full source, and the full model, never leave the server for AI convenience.
- Sensitive values are replaced with **stable pseudonyms** (e.g. `CONTACT_A`, `PHONE_3`) held in a server-side, per-review mapping table. The same real value always maps to the same token, so AI can still reason that a value appears in several places without ever seeing it.
- Pseudonyms are re-hydrated server-side before findings and questions are shown to the operator.
- Every AI call records which minimized projection it received, so the evidence trail stays auditable.

## Data model

Records are **workspace-scoped, not personally owned**. A `scriptiq_workspaces` table plus `scriptiq_workspace_members` (member + role, seeded from `authorized_users`) lets one administrator work alone today and several authorized AnSer users share accounts, knowledge and reviews later without a schema change. Every table carries `workspace_id` plus audit fields (`created_by`, `updated_by`). RLS scopes every policy to membership of the row's workspace through a security-definer `is_workspace_member()` helper — never a direct `auth.uid() = user_id` check — so cross-workspace isolation stays strict.

Tables:

- `scriptiq_workspaces`, `scriptiq_workspace_members` — sharing boundary and roles.
- `scriptiq_accounts` — account number, name, notes.
- `scriptiq_account_knowledge` — one row per knowledge item, not one blob: `key`, `value` (JSON), `scope` (`account` | `call_center`), `confirmed_by`, `confirmed_at`, `origin_review_id`, `origin_source_id`, `last_verified_at`, `status` (`active` | `needs_reverification` | `superseded`), `superseded_by`, `supersedes`. Nothing is edited in place — a change writes a new row and supersedes the old one, so the history of what was believed and when is intact.
- `scriptiq_knowledge_invalidation` — the rules that mark items `needs_reverification`: a new IIF or script version, a changed directory or SQL answer, or a re-uploaded source that materially touches the fields an item depends on. Each item records the model/source fingerprints it was confirmed against; when those change, the item is flagged (never silently deleted) and the Question Engine re-asks it.
- `scriptiq_reviews` — account, title, status, parse/coverage summary.
- `scriptiq_source_kinds` — an open registry, not a fixed enum. The first release registers `iif`, `script_pdf`, `account_doc`; `sql_schema`, `stored_procedure`, `sql_query` and `supporting_document` are declared as future kinds with no UI yet. Each kind names its adapter, accepted MIME types and capabilities, so a new source type is a registry entry plus an adapter, not a schema migration.
- `scriptiq_sources` — one row per uploaded file: `kind` (FK to the registry), storage path, size, content hash, parse status, coverage report.
- `scriptiq_pseudonym_map` — per-review token ↔ original value mapping, server-only, never selectable from the browser.
- `scriptiq_script_model` — reconstructed model JSON per review, with a model version and source fingerprints.
- `scriptiq_findings` — type (confirmed defect / probable defect / local policy question / data dependency question / intentional / unresolved), severity, evidence refs, recommended change, impact, test instructions, status.
- `scriptiq_questions` — what was observed, missing evidence, answer, resolution, link to the knowledge item it wrote or re-verified.
- `scriptiq_tests` — generated TestBench scenarios and their state.

**Migration, no data loss.** Nothing is deleted. `is_manuals` / `is_manual_pages` stay and are re-surfaced as ScriptIQ reference documents (a nullable account link is added). `is_script_entries` stays with the Knowledge Vault. `script_versions` rows are retained read-only as history; new work writes to `scriptiq_*`.

Storage: a new private `scriptiq-sources` bucket, workspace-scoped RLS on `storage.objects`, signed short-lived URLs only, size and MIME validation on upload. No production SQL credentials are ever stored — the SQL model records logical shape only.

## Modules

- **IIF adapter** — an adapter registry keyed by detected dialect, extending the existing construct registry. Every construct declares its support level; anything unrecognised becomes an explicit unknown in the coverage report. Nothing is invented to complete the model. Coverage is shown on the review dashboard as a first-class number.
- **PDF / Word ingestion** — page-level text plus heading/question detection for the script PDF; requirement extraction from account documents (AI-assisted, every extracted requirement labelled inferred until a human confirms it).
- **LogicLens** — deterministic rule engine over the model graph: unreachable branches, no exit, paths that never reach Save or Proof Read, fields used before population, shared-field overwrite and stale reuse, missing Copy Field mappings that later logic depends on, contradictory conditions, SQL inputs never populated, outputs never consumed. Every finding names the rule and its evidence.
- **Question Engine** — fires when a rule's confidence depends on operational knowledge. Each question states what was observed, why it matters, what evidence is missing, and what answer is needed. Answers persist into the Account Knowledge Profile so a question is asked once per account.
- **ModeMap** — models enter → filter → branch → nested child → return/merge. Detects missing return points, unreachable required fields, hidden questions referenced later, duplicate questions, paths bypassing Proof Read or Save.
- **ClientMatch** — compares extracted client requirements against modelled behaviour; mismatches become blue findings with an "is this an account exception?" question.
- **FlowTrace / DataTrace / DatabaseTrace** — three views over the same graph: caller path, field lineage (Select Contact → Copy Fields → shared fields → downstream), and script → connection → procedure → table → column → back. A scenario picker highlights one route.
- **TestBench** — turns findings and branch coverage into concrete Test Drive scenarios: happy path, filter combinations, screen-mode visibility, shared-field population/clearing, Select Contact, directory fallbacks, SQL record-found/not-found/multiple/null, save completeness, regression.

## Honesty rules (enforced in code)

No module ever shows fabricated findings. A module with no real analysis yet renders an explicit "not implemented" state rather than placeholder content. Demo fixtures are only reachable behind a visible "demonstration data" banner. The red/yellow/blue/green/comment highlight language always pairs colour with a text label and icon. ScriptIQ never writes to a production Amtelco script or SQL database.

## Phases

1. **Foundation** — routes, shell, accounts, reviews, uploads, storage + RLS, evidence model, source list with parse status. Retire Twin/Simulator from the UI.
2. **Ingestion** — IIF adapter refactor, script PDF extraction, account-document requirement extraction, coverage reporting.
3. **Account knowledge** — Directory, Shared Field, Select Contact / Copy Field, and SQL interviews writing to the profile.
4. **LogicLens + Questions** — rule engine, findings list, question queue, answer-and-re-run loop. **This completes the first usable release.**
5. ModeMap and FlowTrace visualisation.
6. DataTrace and DatabaseTrace.
7. ClientMatch.
8. TestBench and the exportable correction package.

## Testing

Unit tests per rule with fixture models; adapter tests asserting unknowns are reported rather than dropped; redaction tests proving no PII reaches analysis or AI; persistence tests for profile answers surviving logout; RLS tests for cross-user isolation. The existing suite must stay green — Twin tests are removed with the Twin, not deleted around it.

## Risks and unknowns

- **IIF decodability is the biggest unknown.** Some exports may be binary or proprietary; the product must stay useful at partial coverage, which is why coverage is a headline metric.
- Script PDF layouts vary; question-order detection may need per-account tuning.
- Requirement extraction from client documents is inherently inferential and always needs human confirmation.
- Whether one review maps to one script or a script family (main + includes) — assumed one review can hold multiple related sources.

## First release is done when

An account can be created, an IIF plus script PDF plus account document uploaded, parse coverage honestly reported, a script model reconstructed from what was genuinely parsed, LogicLens findings produced with evidence and recommended changes, questions raised and answered into a profile that survives re-review, and no module anywhere shows invented analysis.
