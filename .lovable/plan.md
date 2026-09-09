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
sources (IIF / script PDF / account docs)
  → adapters (parse + redact + coverage, per format)
  → ScriptModel (screens, elements, branches, fields, actions, SQL calls)
      every node carries provenance + confidence
  → LogicLens rules (deterministic) → findings
  → AI pass (labelled inferred) → requirement extraction, question wording
  → Question Engine → answers → Account Knowledge Profile → re-run
```

## Data model

New tables, all user-scoped with RLS and grants:

- `scriptiq_accounts` — account number, name, notes.
- `scriptiq_account_knowledge` — versioned JSON profile: directory fields, statuses, contact methods, contact order, shared fields, Select Contact / Copy Field conventions, SQL connections, tables, stored procedures, confirmed exceptions. Each entry records who confirmed it and when, and whether it is account-scoped or promoted to a call-center rule.
- `scriptiq_reviews` — account, title, status, parse/coverage summary.
- `scriptiq_sources` — one row per uploaded file: kind (iif / script_pdf / account_doc), storage path, size, hash, parse status, coverage report.
- `scriptiq_script_model` — the reconstructed model JSON per review, with a model version.
- `scriptiq_findings` — type (confirmed defect / probable defect / local policy question / data dependency question / intentional / unresolved), severity, evidence refs, recommended change, impact, test instructions, status.
- `scriptiq_questions` — question text, what was observed, missing evidence, answer, resolution, link to the profile entry it wrote.
- `scriptiq_tests` — generated TestBench scenarios and their pass/fail state.

**Migration, no data loss.** Nothing is deleted. `is_manuals` / `is_manual_pages` stay and are re-surfaced as ScriptIQ reference documents (a nullable `account_id` is added). `is_script_entries` stays with the Knowledge Vault. `script_versions` rows are retained read-only as history; new work writes to `scriptiq_*`.

Storage: a new private `scriptiq-sources` bucket, owner-scoped RLS on `storage.objects`, signed URLs only, size and MIME validation on upload. No production SQL credentials are ever stored — the SQL model records logical shape only.

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
