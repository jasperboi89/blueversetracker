# Activation 5 — Genuine Amtelco IIF Validation

**Scope:** validate/calibrate the existing IIF ingestion (`src/lib/script/*`)
against a genuine Amtelco `.iif` export. Read / analyze / PREPARE only. No
executable capability added; autonomy unchanged (PREPARE). No architecture
redesign. No invented syntax.

> **Source protection.** The genuine export is sensitive operational data. It
> was analysed in a session-local scratchpad **outside the repository** and is
> **not committed**. This document records **structural facts only** — no line
> of source, no names, accounts, phone numbers, credentials, or caller/patient
> detail appears here or in any test/fixture.

## Artifact classification

**REAL EXPORT — binary.** A genuine Amtelco Intelligent Series script export
(`SampleScript.iif`). Not synthetic, not sanitized text.

## Structural facts observed (no content)

| Property | Value |
| --- | --- |
| Size | ~102 KB (104,994 bytes) — under the 4 MB limit |
| Lines | 289, **CRLF** endings |
| First bytes | `0x14` (DC4) then ASCII `SCRIPT_` — a binary record marker + magic |
| Printable ASCII (0x20–0x7e) | ~37% |
| **High bytes (≥ 0x80)** | **~52%**, and **all 128 high values are present** |
| Control bytes (< 0x20) | ~10% (FS/GS/RS/US 0x1c–0x1f and others), plus NUL & DEL |
| UTF-16? | **No** — only ~0.3% NUL (UTF-16 text would be ~50% NUL) |
| Tab / INI / XML text? | **No** — no ASCII record grammar, no repeating keyword markers |

**Conclusion:** the genuine export is a **proprietary binary serialization**
(packed structures/encoded values), not the text export the Activation 1–4
pipeline was built for. All-128 high-byte coverage is the signature of arbitrary
binary data, not text in any encoding.

## Existing detector / importer result (runtime-verified)

The **real importer** (`importIif`) was run against the genuine file
out-of-band (status only; no content surfaced). Result — **CORRECT refusal**:

| Read mode | Outcome |
| --- | --- |
| `await file.text()` (UTF-8, **how the Script Import UI reads it**) | `accepted: false`, reason **`unreadable_encoding`** |
| byte-preserving (latin1) | `accepted: false`, reason **`binary_content`** |

This is **correct, conservative behavior — not a false negative in the bug
sense.** The file genuinely is not UTF-8 text; the pipeline (validate →
normalize → **REDACT** → parse → map → fingerprint) is text-first by design and
rightly refuses to guess a binary grammar. Detection was never reached because
ingestion stops at the encoding/binary gate.

## Why no parser grammar was added

- The real export is binary; there is **no ASCII grammar to calibrate**.
- Reverse-engineering a proprietary binary format from **one** sample (with all
  128 high-byte values and no published spec) would be **speculative** — exactly
  what Activation 5 forbids ("do not invent syntax", "do not generalize beyond
  observed format without evidence"). It would also risk mis-surfacing
  caller/PHI bytes.
- The text detector correctly returns `unknown` for unrecognised text and the
  importer correctly refuses binary, so there is **no demonstrated parser
  defect** to fix in the text path.

Therefore **no application code was changed** (no detector, parser, contract,
capability, Guardian, Night Plan, allowlist, or autonomy change). The honest
calibration outcome is a **format-scope finding**, not a parser tweak.

## `validatedAgainstRealExport`

**Remains `false`** (hard-coded in `iif-import.ts` / `iif-contract.ts`). The
text-parser conventions have **not** been validated against real text-export
data, because the genuine export is not text. Setting it true would be
dishonest. It becomes `true` only once a genuine or verifiably-sanitized-genuine
**text** export exercises the parser end-to-end.

## Audit outcomes (STEP 5–13)

| Check | Result |
| --- | --- |
| Dialect detection on real file | **N/A** — refused before detection (correct) |
| Redaction-before-parse fidelity | **UNVERIFIABLE** — file refused before redaction |
| Fingerprint stability | **UNVERIFIABLE** — no parse |
| Construct inventory / recognition | **0** recognised (refused); no false positives |
| False positives | **None** — a refused binary yields no structure; plain unknown text yields 0 records, all lines reported unknown |
| False negatives | The refusal is **correct** (binary ≠ text); not a bug |
| Dependency Cortex edges | **N/A** — no structure produced |
| Simulator readiness | **UNSUPPORTED** — no structure |
| Copilot grounding / AI payload | **N/A** — nothing ingested; no payload built |

## Privacy

- Genuine file never entered the repo, logs, docs, AI payload, or Event Ledger.
- No raw line of the export was printed at any point; only aggregate byte/line
  statistics.
- The regression fixtures are **synthetic** (built with `String.fromCharCode`),
  containing no real content.

## Regression test added

`src/lib/script/activation5-real-iif-import.test.ts` locks the verified
behavior (assertions runtime-verified against the real importer):

- binary export decoded as UTF-8 → `unreadable_encoding`
- byte-preserving binary export → `binary_content`
- a refused import exposes no structure / safeText (no fabrication)
- plain text in an unknown layout → accepted, dialect `unknown`, **0 records**,
  every line reported unknown, `validatedAgainstRealExport` still `false`

## Support matrix — evidence labels

| Surface | Evidence label |
| --- | --- |
| Tab / INI / XML text dialects | **SYNTHETIC VERIFIED** (Activation 4 fixtures) |
| Genuine Amtelco `.iif` export (binary) | **REAL-EXPORT VERIFIED: binary, UNSUPPORTED for text parsing** — correctly refused |
| `validatedAgainstRealExport` | **UNVERIFIED (false)** — no real *text* export exercised the parser |

## Recommended next step

1. Obtain a **text** Amtelco export if the IS toolset can produce one
   (tab-delimited / CSV / XML). Only then can the text parser be validated and
   `validatedAgainstRealExport` justifiably flip to `true` for that dialect.
2. If only the binary format exists, the correct path is a **documented binary
   spec** (from Amtelco or reliable reference), fed to a *separate, clearly
   bounded* binary decoder — a future activation, never guessed from one sample.
3. Optional low-risk UX improvement (deferred — not made here, to avoid an
   untested change to a mature module): make the refusal message Amtelco-binary
   aware ("this looks like a binary IS export; re-export as text"), verified by
   running the full suite in an environment that can execute it.

## Environment limitation

This sandbox cannot run the test suite (`vitest` not installed) or a production
build (private registry blocked). The Activation 5 assertions were instead
**executed against the real importer via a `bun` harness** (all pass); the
committed vitest file mirrors those assertions 1:1 and will run in a full
environment. The 996-test baseline was **not** re-run here — no existing test
was modified (a new, isolated test file was added), so the baseline is not at
risk from this change.
