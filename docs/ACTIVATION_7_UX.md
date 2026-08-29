# Activation 7 — Major UX / Command Center Polish

**Intent:** make the existing intelligence *visibly* intelligent — Command Center
information architecture, evidence-honest presentation, and a Script Twin visual
& interactive foundation. No new backend architecture, no authority creep,
autonomy stays capped at **PREPARE**.

> **Environment note that shapes this activation.** This sandbox cannot
> `bun install` (private registry → 403), so it cannot run `vitest`, `vite
> build`, the dev server, or **render the live portal**. Activation 7's
> completion gates (run the suite, typecheck, build, and *visually review the
> rendered portal*) therefore cannot be executed here. Shipping a large volume
> of blind React across existing high-traffic surfaces — which can neither be
> type-checked (React types are not installed) nor rendered — would risk the
> 1000-test baseline and the live workflows it must not break. So this
> activation delivers the **verifiable, load-bearing foundation** now and
> records the visual wiring that needs a building environment as an explicit,
> honest hand-off. See §Status.

---

## 1. UX inventory (what exists today)

Read from canonical `main` (`5d948a5`). The portal is already substantially
built; Activation 7 is polish and exposure, not a rebuild.

| Area | Current surface | Assessment |
| --- | --- | --- |
| Command Center home | `routes/_authenticated/index.tsx` — hierarchy stack (Greeting, Shift, Next-Best-Action, AI Briefings, Alert Center, Night Plan, Lookup, Overview) + Operational Radar band + Night Forecast, plus an optional floating Power Workspace (`PaneCanvas`) and a stable narrow fallback. | Strong bones. NOW/OUTLOOK/RADAR concepts already exist but are spread across equal-weight panels; the win is *ranking and framing*, not new panels. |
| Navigation | `layout/AppShell.tsx`, `AppSidebar.tsx` | Works; desktop-first. |
| Intelligence surfaces | `components/intelligence/*` — `RadarBand`, `OutlookPanel`, `AnomalyPanel`, `InvestigatePanel`, `ClaimInspector`, `AccountIntelligenceTab` | Present and grounded (real signals, suppression, calm empty states). Under-exposed on the home surface. |
| Script Intelligence | `components/knowledge/is-scripts/*` — `IsScriptWorkspace`, `IifImportPane`, `DependencyCortexPane`, `SimulatorPane`, `IsScriptEntriesPane`, `ManualExplainPanel` | Rich but utilitarian. Prime candidate for the Script Twin upgrade. |
| Atmosphere | `layout/GalaxyBackground.tsx`, `HoloQuietBackground.tsx` | Already provides restrained depth; reduced-motion aware. |
| Night Plan / Freshdesk / Accounts / Additional Work / Contact Dispatch / Knowledge | dedicated routes under `_authenticated/*` | High-traffic; must not regress. Activation 7 touches them minimally, if at all. |

**Intelligence that exists but is visually buried:** anomaly baselines,
comparative forecasts, causal investigations (hypotheses + missing evidence),
Resolution Memories, dependency/unresolved-reference findings, Test-Intelligence
suggestions. The Command Center framing (this activation) surfaces them under
NOW / OUTLOOK / RADAR / INVESTIGATIONS / GOVERNED ACTIONS.

---

## 2. Delivered in this activation (verifiable, additive)

### 2.1 Evidence-state vocabulary — `src/lib/script/twin/evidence-state.ts`
One honest vocabulary for the whole portal:
`verified · observed · partial · inferred · insufficient_history · unknown ·
unsupported`. Each carries a label, help text, a **tone + a Lucide icon name**
(so status is never colour-only — accessibility), and a stable rank. Helpers:
`isTrustworthy` (only `verified` reads as "true"), `weakestEvidence` (a summary
is never more confident than its weakest part), `byEvidenceRank`.

### 2.2 Script Twin normalized screen model — `src/lib/script/twin/twin-model.ts`
A **source-independent** `TwinScriptModel → TwinScreen → TwinElement` model
(STEP 11). Every element, option, visibility rule, navigation link and screen
carries **provenance** (`SCREENSHOT · PDF · MANUAL · STRUCTURAL_IMPORT ·
INFERRED`) and an evidence state. Element types mirror the Infinity grammar
(prompt, instruction, guidance_panel, text, textarea, list, combo, readonly,
name_pair, phone_pair, review_panel, action, navigation). Bounded builders
enforce caps; `validatedAgainstRealExport` can never be set true by the Twin
itself.

### 2.3 Bounded, isolated simulation — `src/lib/script/twin/twin-simulation.ts`
Pure, deterministic sandbox (STEP 12/14): `createSimState`, `applyValue`,
`clearValue`, `navigate`, `visibleElements`, `pendingReveals`, `summarizeSim`.
**Progressive reveal** follows only the model's declared visibility rules (each
provenanced, so the UI can label a reveal `inferred` vs `verified`). Safety by
construction: no I/O, no store, no network; every transition returns a *new*
state and never mutates the model; navigation only reaches *defined* screens;
hidden/read-only elements reject values. **There is no function here that writes
to Amtelco, deploys, or executes anything.**

### 2.4 Honest structural adapter — `src/lib/script/twin/twin-from-structure.ts`
Projects a recognised `ScriptStructure` into a Twin model (source
`STRUCTURAL_IMPORT`): sections → screens, components → elements, a component with
an **unresolved** dependency is marked `partial` (never `verified`), sequential
section links are `inferred` (not a verified branch), and the result is always
`validatedAgainstRealExport: false`.

### 2.5 Tests — `src/lib/script/twin/twin.test.ts`
33 assertions covering evidence honesty, progressive reveal, value/nav guards,
twin isolation, screen-level evidence, and the structural adapter's honesty.
**Verified in-sandbox via a `bun` harness: 33/33 pass.** The four pure modules
type-check clean under `tsc` (the only `twin/` error is the repo-wide missing
`vitest` types in the test file, identical to every other test).

### 2.6 Design reference (rendered) — `Command Center Twin` artifact
Because the live portal cannot be rendered here, the visual direction is
delivered as a **rendered mockup** for review (STEP 25's "visual review" in the
only form this sandbox allows): the Command Center hierarchy (NOW / Outlook /
Radar / Investigations / Governed Actions), the evidence-state chips, honest
"awaiting sufficient history" empty states, the PROPOSED→CONFIRMED→EXECUTED→
VERIFIED lifecycle, and the Script Twin **Classic ⇄ Enhanced** workspace with
provenance, dependencies, a simulation trace, and a live progressive-reveal
demo that mirrors `twin-simulation.ts`. Palette: graphite/midnight base,
controlled cyan glow, restrained violet, gold for final-hour urgency; glass
depth; reduced-motion respected.

---

## 3. Script Twin component model (spec for the React layer)

The renderer consumes the normalized model above; components stay presentational
and carry no account logic (STEP 10). Target components and the model field each
reads:

| Component | Consumes | Notes |
| --- | --- | --- |
| `InfinityShell` | `TwinScriptModel` + sim state | Classic⇄Enhanced toggle; classic view stays visually dominant. |
| `InfinityScreen` | `TwinScreen` + visible elements | Pale-gray canvas, Windows-style chrome. |
| `PromptText`/`InstructionText`/`GuidancePanel` | element `text` | Italic prompt / green guidance / emphasis block. |
| `FieldRow` + `TextField`/`TextAreaField`/`ListField`/`ComboField`/`ReadOnlyField`/`NameFieldPair`/`PhoneFieldPair` | `TwinElement` | Type → control map already defined by `TwinElementType`. |
| `ActionButton`/`NavigationControl` | `TwinNavigation` | Red Save, neutral actions, Back. |
| `ReviewPanel` | `review_panel` element | Proofread block. |
| `TwinOverlay`/`ProvenanceBadge`/`DependencyBadge`/`SimulationMarker` | `provenance`, deps, sim state | Enhanced-mode overlays; readable + optional. |
| `EvidenceBadge` | `EvidenceState` | Renders `EVIDENCE_STATE_META` (icon + label + tone). Portal-wide. |

**Update — the React layer is now implemented and wired** (Live UI Completion).
The components above ship under `src/components/knowledge/is-scripts/twin/`
(`twin-components.tsx`, `InfinityScreen.tsx`, `ScriptTwinWorkspace.tsx`,
`twin-pair.ts`, `twin-samples.ts`) and an **ENTER SCRIPT TWIN** tab is added to
`IsScriptWorkspace` — no new route was needed (the workspace already mounts
inside the `knowledge-vault` route via `KnowledgeVault`), which avoids the
registry-blocked `routeTree.gen.ts` regeneration. All new TSX **type-checks
clean** (react/radix/lucide/tanstack now resolve in this environment; zero new
non-`vitest` errors) and **lints clean** (`eslint` exit 0). What still cannot run
here: the `vitest` suite (`vitest` not installed; install 403s on markdown
deps), the production build (`vite.config.ts` imports the missing
`@lovable.dev/vite-tanstack-config`), and therefore the **rendered-portal visual
review**. Those keep the activation at PARTIAL.

---

## 4. Intelligence honesty (STEP 5, 13, 20)

- **Evidence states** are text + icon + colour, never colour alone; `green`
  (`verified`) is reserved for genuinely verified facts.
- **Insufficient history** is a first-class, dignified state — "Forecast
  intelligence is gathering operating history…", "Baseline still forming…" — not
  an error, and never backfilled with fake sample intelligence.
- **No fabricated accuracy.** OUTLOOK distinguishes `FORECAST AVAILABLE` from
  `AWAITING SUFFICIENT HISTORY`; no percentage is shown without a defensible
  model (consistent with Activation 6).
- **Causal honesty** preserved: investigations show OBSERVED / CORRELATED /
  LIKELY-CAUSAL / UNKNOWN and "no supported causal explanation yet" as a
  respectable outcome; visual emphasis never manufactures certainty.
- **Lifecycle clarity:** PROPOSED → CONFIRMED → EXECUTED → VERIFIED is visually
  distinct; a proposal never looks like a completed action.

## 5. Script Twin reality (STEP 7 / 9 preserved)

Genuine Amtelco `.iif` is **binary and unsupported**; the text parser does not
decode it; `validatedAgainstRealExport` stays **false**; the Twin never implies
otherwise. The Twin's only automatic data path today is the honest structural
projection (§2.4). Screenshot / PDF / manual sources are first-class provenance
values for hand-mapped screens, each labelled by evidence — the simulator stays
useful without lying. No binary decoding, no Amtelco runtime, no write/deploy.

## 6. Governance & privacy

PREPARE ceiling unchanged; executable allowlist unchanged; confirmation
architecture unchanged; **no Amtelco writes, no script deployment**; no new
engine/agent/route wired. Chain intact: INTELLIGENCE PROPOSES → POLICY
AUTHORIZES → HUMAN CONFIRMS → CAPABILITY EXECUTES → REALITY VERIFIES. The Twin
simulation is a sandbox with no I/O; test values never leave the browser and
never reach Amtelco.

## Status

**`ACTIVATION 7 PARTIAL`.** Delivered and verified: the portal-wide evidence
vocabulary; the Script Twin normalized model, bounded/isolated simulation with
progressive reveal, and honest structural adapter (46 assertions passing via
bun); **the full Script Twin React layer (Classic + Enhanced views, bounded
simulation, provenance) wired into the Script Intelligence workspace via an
ENTER SCRIPT TWIN tab**; a live Command Center evidence-key legend; and a
rendered design reference. All new TSX type-checks clean (zero new non-`vitest`
errors) and lints clean. **Blocker keeping this PARTIAL:** the sandbox cannot run
the `vitest` suite (not installed; install 403s), the production build
(`vite.config.ts` imports the missing `@lovable.dev/vite-tanstack-config`), or
render the live portal — so the completion gates (full suite, build) and the
rendered-portal visual review could not be executed. The React code is written,
typechecked, and linted; it needs a registry-capable environment to build, run
the suite, and complete the visual review.
