# Activation 6 — Real Operational Calibration

**Scope:** measure how useful and trustworthy the *existing* intelligence is
against real operational history, and calibrate conservatively. No architecture
expansion, no new engines, no new autonomy. Model-driven autonomy stays capped
at **PREPARE**. The numbered architecture program is closed — this is
calibration only.

> **Honesty rule applied throughout.** `REAL EVIDENCE` (facts drawn from the
> committed code, and the one genuine artifact seen in Activation 5) is kept
> strictly separate from `SYNTHETIC TEST COVERAGE` (regression fixtures). No
> historical incident, ticket pattern, anomaly sequence, forecast outcome, or
> resolution was fabricated to make calibration look successful. Where genuine
> history is required and absent, the category is reported
> `INSUFFICIENT REAL EVIDENCE`, not filled with a manufactured number.

---

## 0. Environment reality (determines what calibration is possible)

Two hard limits shape this activation. Both are environmental, not defects.

1. **No real operational history is reachable from this sandbox.**
   - The intelligence engines are pure functions; real data enters only at
     **runtime** from Freshdesk and Supabase server functions
     (`src/lib/api/freshdesk*.functions.ts`, `src/lib/core/ledger.functions.ts`).
   - Freshdesk access requires `FRESHDESK_DOMAIN` + `FRESHDESK_API_KEY`
     (`freshdesk.functions.ts:14-15`). **Neither is present** in this
     environment, so no real ticket, dispatch, or resolution history can be
     pulled.
   - No real operational history is committed to the repo (correctly — it is
     sensitive internal data). The only genuine artifact ever supplied was the
     Activation 5 Amtelco `.iif`, which is **binary and unsupported** by the
     text parser.
   - Account Cortex / anomaly / forecast state is browser-persisted
     (`account-cortex-store.ts` → `localStorage` + cloud blob sync); there is no
     server-side historical corpus available here to replay.
   - **Even if a live connection existed, pulling real caller/patient/ticket
     content into this sandbox would breach the Activation 6 privacy boundary
     (§4).** Calibration must not exfiltrate sensitive operational data.

   → All **empirical, data-dependent** calibration (measured anomaly precision,
   forecast backtests, investigation quality on real cases, resolution retrieval
   relevance on real recurrences, Test-Intelligence vs. real failures) is
   **`INSUFFICIENT REAL EVIDENCE`** in this environment.

2. **The verification toolchain cannot execute here.** The private package
   registry (`lovable-core-prod`) returns **403**, so `bun install` fails →
   `vitest` (full suite) and `vite build` cannot run, and `tsc` cannot resolve
   dependencies (188 missing-module errors, all environmental). See §Verification.

Because of (1), no empirical threshold/parameter tuning is justified — tuning
without real evidence is exactly the fabrication the activation forbids. Because
of (2), any code change would be unverifiable against the 1000-test baseline.
**Therefore Activation 6 makes no code changes**; its deliverable is this
evidence-based calibration inventory and confidence/causal-honesty audit, which
records what was inspected, what the confidence models actually are, and what
real evidence each category still needs.

---

## 1. Calibration inventory (what exists, and its confidence model)

All facts below are `REAL EVIDENCE` read directly from the committed source at
canonical `main` (`5d948a5`).

| Subsystem | Key modules | Confidence model | Honesty posture observed |
| --- | --- | --- | --- |
| **Anomaly** | `core/anomaly-contract.ts`, `anomaly-detectors.ts`, `anomaly-engine.ts`, `anomaly-store.ts` | Robust **median/MAD** (IQR fallback) z-score vs. a per-account baseline; `robustZThreshold: 3.5`, elevated at 5; bounded `ConfidenceClass` (no numeric %). | Strong. `insufficient_baseline` is a first-class state (never a silent "normal"); guards against all-zero baselines (`minActiveBuckets`); descriptions self-qualify ("whether it continues is unknown"; "does not establish that the change produced the activity"). |
| **Forecast** | `core/forecast-contract.ts`, `forecast-engine.ts`, `forecast-evaluation.ts`, `forecast-store.ts` | **Comparative, not probabilistic** — "No probabilities … deliberately"; bounded `ConfidenceClass` bands; `insufficient_evidence` first-class. | Strong. Framed as "comparable past states were more often followed by X", never "this will happen"/"this is because". `forecast-evaluation.ts` already exists for backtesting when history is present. |
| **Investigation** | `investigation/*` (`hypothesis-contract.ts`, `hypothesis-strength.ts`, `hypothesis-generation.ts`, `investigation-engine.ts`, `counterfactual.ts`, `discriminating-tests.ts`) | Hypothesis strength from evidence for/against; `insufficient_evidence` conclusion; forbidden causal-phrase list (`"root cause is"`, `"caused by"`, `"because of the change"`). | Strong. Distinguishes OBSERVED / CORRELATED / LIKELY-CAUSAL / UNKNOWN; "No supported causal explanation yet" is an explicit, respectable outcome; counterfactual is labelled "structural plausibility … not causal proof". |
| **Resolution Memory** | `resolution/resolution-types.ts`, `resolution-service.ts`, `what-fixed-this.ts`, `resolution-map.ts` | Operator-judged bounded confidence **verified / probable / unknown**; status **active / superseded / archived** + `supersedesId`. | Strong. "Nothing here is AI-authored"; deterministic ranking (active before superseded, verified before probable); field caps + DB CHECK keep ticket bodies out. |
| **Script Intelligence** | `script/*` (`script-contract.ts`, `dependency-graph.ts`, `change-impact.ts`, `script-diff.ts`, `test-intelligence.ts`, `iif-*.ts`) | Structural coverage fraction (whole-percent display); `validatedAgainstRealExport: false`. | Strong. Refuses binary IIF fail-closed (Activation 5); reports unrecognised lines as unknown rather than guessing; coverage gaps stated plainly. |
| **Test Intelligence** | `script/test-intelligence.ts` | Priority bands **required / recommended / optional**; `coverageOfImpact` fraction; `MAX_CASES: 40`. | Strong. A case is proposed only when it can name the structural reason; unresolved targets become required manual checks; explicitly "a starting point, not a complete plan". No count-maximizing. |

**Cross-cutting confidence audit (STEP 13).** The system already prefers
**bounded confidence classes over pseudo-precise percentages**. The curator
contract states the rule outright (`curator-contract.ts:235`: *"Plain, auditable
reasons — never 'AI confidence: 87%'"*). Copilot tool descriptions
(`ai/copilot-tools.server.ts`) repeatedly instruct non-causal, non-probabilistic
wording and "say the baseline is still forming rather than implying behavior is
normal". Missing evidence is treated as *insufficient*, never as neutral/normal.
**No fake-precision or confidence-inflation defect was found that real evidence
would be needed to justify changing.**

The one place a 2-decimal number is shown to a human is the Freshdesk **search**
inclusion reason (`freshdesk-search.functions.ts:1161,1279`: `AI confidence
0.75 — <reason>`). This is a raw AI *match* score in the retrieval path, labelled
as such and paired with a reason string — not an operational-intelligence
confidence claim. It is noted here as a minor observation; changing it is a
retrieval-UX judgement that has **no real-evidence basis** in this activation, so
it is left unchanged rather than tuned speculatively.

---

## 2. Per-category calibration result

### Anomaly calibration (STEP 5)
- **Code audit:** conservative by construction (robust z ≥ 3.5; insufficient
  baseline is explicit; no threshold is "lowered to generate detections").
- **Empirical usefulness / noise / misses / severity accuracy:**
  `INSUFFICIENT REAL EVIDENCE` — needs a real per-account event history to
  measure true vs. noisy detections. Not fabricated.

### Forecast calibration (STEP 6)
- **Code audit:** comparative, non-probabilistic; `forecast-evaluation.ts`
  already supports backtesting when anchors exist.
- **Backtest:** `INSUFFICIENT REAL HISTORY` — no real past-state → outcome pairs
  are reachable here. Directional accuracy / lead time / false-warning rates are
  **not** manufactured.

### Investigation quality (STEP 7)
- **Code audit:** already distinguishes OBSERVED / CORRELATED / LIKELY-CAUSAL /
  UNKNOWN, with a forbidden-causal-phrase guard and "no supported causal
  explanation yet" as a first-class conclusion. No causal-overreach defect found.
- **Real-case evaluation:** `INSUFFICIENT REAL EVIDENCE` — needs real
  investigations to judge hypothesis usefulness in practice.

### Resolution Memories (STEP 8)
- **Code audit:** verified/probable/unknown + active/superseded/archived +
  supersede links + deterministic relevance ranking already exist. A prior
  resolution does **not** become authoritative merely by existing (unknown ranks
  last; superseded ranks below active).
- **Gap noted, not built:** there is no explicit `failed` state (a fix that was
  tried and did not work) or `context-mismatch` marker. Adding either is a **DB
  CHECK-constraint + server + client schema change** that (a) cannot be verified
  in this sandbox and (b) has **no real-evidence** demonstrating operators are
  being misled by its absence. Per STEP 8 ("only if the existing model requires
  them … do not create a new subsystem unnecessarily") and STEP 14 (no
  architecture creep), it is **recorded as a candidate for a future,
  evidence-backed change**, not implemented now.
- **Retrieval relevance / stale / mismatch rates:** `INSUFFICIENT REAL EVIDENCE`.

### Script Intelligence (STEP 9)
- **VERIFIED:** structural summary, dependency reporting, unresolved-reference
  listing, structural diff, impact analysis, and regression guidance all operate
  on structures the parser actually recognises, and degrade honestly (unknown
  lines, coverage gaps) — confirmed by reading the modules and by Activation 5.
- **PARTIAL:** structural recognition depends on text dialects; coverage < 100%
  is surfaced as such.
- **UNSUPPORTED:** the genuine Amtelco `.iif` is a **binary serialization** the
  text parser does not decode. `validatedAgainstRealExport` **remains `false`**
  (`iif-import.ts:104`, `iif-contract.ts:263`) — correct, and **not** flipped to
  close this activation. No portal surface implies binary-grammar understanding;
  the importer refuses binary with a factual "not currently supported" message.

### Test Intelligence (STEP 10)
- **Code audit:** relevance-first (structural reason required), redundancy-capped
  (dedupe + `MAX_CASES`), honest about coverage gaps and false confidence.
- **Vs. real failure modes:** `INSUFFICIENT REAL EVIDENCE` — needs known real
  operational failures to judge would-have-caught / missed / irrelevant.

---

## 3. Operator usefulness (STEP 11, qualitative)

Based on the code and framing (not on real outcome data):

- **Strongest / most trustworthy by design:** Resolution Memories (operator-authored,
  verified/superseded model) and Script structural analysis (deterministic,
  fail-closed). These are `ACTIONABLE` / `USEFUL CONTEXT` when their inputs exist.
- **Most dependent on real history to prove value:** Anomaly and Forecast — sound
  and conservative in code, but their real-world usefulness/noise balance is
  **unmeasured here** (`INSUFFICIENT REAL EVIDENCE`).
- **Highest-noise risk area:** none identified in code; the anti-noise guards
  (insufficient-baseline/evidence states, robust thresholds) are already present.
  A real-noise measurement is not possible without history.

No UX redesign was performed (Activation 7 owns that). No clarity change was
necessary to expose these calibration results — this document exposes them.

---

## 4. Governance & privacy (STEP 14, STEP 4)

- **PREPARE ceiling:** unchanged. No code changed; no autonomy widened.
- **Executable allowlist:** unchanged. **No Amtelco write, no script deployment,
  no new capability, no second anomaly/forecast engine, no new agent framework.**
- **Confirmation architecture / Action Ledger / Capability Registry / Guardian:**
  unchanged.
- **Governance chain intact:** INTELLIGENCE PROPOSES → POLICY AUTHORIZES →
  HUMAN CONFIRMS → CAPABILITY EXECUTES → REALITY VERIFIES.
- **Privacy:** no operational data was pulled, printed, logged, or committed. No
  caller/patient info, phone numbers, credentials, or message contents were
  accessed. `.env` values were never read or exposed (only key *names* were
  listed to confirm which credentials are absent).

---

## 5. What real evidence would complete each category

To move any `INSUFFICIENT REAL EVIDENCE` category to a genuine result, run
calibration in an environment that has **read** access to real history under the
existing privacy safeguards (normalized events, categories, timestamps,
anonymized ids, counts — never raw caller content):

1. **Anomaly:** a real per-account event stream long enough to exceed
   `minBaselineBuckets`; measure useful vs. noisy detections and severity fit.
2. **Forecast:** real past-state → outcome pairs; use `forecast-evaluation.ts`
   to backtest directional/lead-time accuracy and confidence reliability.
3. **Investigation:** real investigations to judge hypothesis usefulness and
   confirm no causal-overreach in practice.
4. **Resolution:** real recurrences to measure retrieval relevance and decide,
   with evidence, whether a `failed` / `context-mismatch` state is warranted.
5. **Test Intelligence:** known real script failures to measure would-have-caught.
6. **Script Intelligence:** a genuine **text** Amtelco export would let
   `validatedAgainstRealExport` flip to `true` for that dialect (a binary spec is
   a separate, future, evidence-backed effort — never guessed from one sample).

---

## Verification (this activation)

- **Full suite (`vitest run`):** could not execute — `vitest` not installed,
  `bun install` → 403. Baseline entering A6 (reported by the task): 1000/1000.
  This activation adds **no code and no tests**, so it cannot change that total;
  the number was **not** re-run here and is not re-asserted as measured.
- **Full typecheck (`tsc`):** 188 errors, **all** environmental missing-module
  (no source changed). Not clean in-sandbox; no A6-attributable error (there is
  no A6 code change).
- **Production build (`vite build`):** cannot start — registry-blocked
  `@lovable.dev/*` imports in `vite.config.ts`.
- **This document is Markdown**, outside the TypeScript build/test graph, so it
  cannot regress the suite, typecheck, or build.

## Classification

**`ACTIVATION 6 PARTIAL`.** The tractable work was done honestly: all six
subsystems inspected, confidence/causal-honesty audited against the code (found
already-disciplined), real-data availability determined, governance confirmed
unchanged. The empirical, data-dependent calibration is
`INSUFFICIENT REAL EVIDENCE` because no real operational history is reachable in
this environment, and the completion gates (full suite / typecheck / build) can
not be executed here. No evidence-backed code change was justified, so none was
made — tuning without real evidence would fabricate calibration, which the
activation forbids.
