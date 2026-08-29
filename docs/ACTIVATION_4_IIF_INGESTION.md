# Activation 4 — Real IIF Script Ingestion

Amtelco script import, structural recognition, provenance, and operational
script intelligence.

Autonomy is unchanged: **OBSERVE / EXPLAIN / RECOMMEND / PREPARE**. Nothing in
this activation modifies, deploys, executes, or writes back to any IS system.

## What this is

Operators can drop an IS script export into the Knowledge Vault → IS Script
Work → **Script Import** pane. The file is validated, redacted, parsed, mapped
onto the existing Phase 4 script structure, and reported on — locally, in the
browser — before anything is recorded.

Once recorded, the imported structure flows into the machinery that already
exists: the Dependency Cortex, structural diffing, change impact analysis,
regression suite generation, static path enumeration, and version history.
Those modules learned nothing about IIF; the importer speaks their vocabulary.

## Pipeline

```text
validate → normalize → REDACT → parse → map → fingerprint → provenance
```

The order is a security property. Redaction runs before the parser sees a
single character, so no component name, dependency key, unknown-line excerpt,
coverage sample, fingerprint, or AI-bound payload derived from this pipeline
can carry a credential or caller/patient detail. `safeText` — the only text the
importer exposes — is post-redaction by construction.

Validation rejects, without parsing: empty files, files over 4 MB, binary
payloads, and content that failed UTF-8 decoding.

## Honesty about the format

There is no published IIF grammar available to this project, and inventing one
would be worse than useless: it would produce confident structure that no
operator could audit. Three mechanisms keep the importer honest.

**1. Detection is layout-only.** `detectDialect` scores punctuation shape —
tab-delimited `!HDR` record rows, bracketed `[Section]` / `key = value` blocks,
or single-line XML-style elements. Record *names* never influence the decision,
and a file without a clear majority shape is classified `unknown`, at which
point every substantive line is reported as unrecognised and no structure is
extracted at all. A loud failure, not a quiet guess.

**2. Recognition is registry-driven.** `IIF_CONSTRUCTS` declares every construct
the importer claims to understand, each with a support level:

| Level | Meaning |
| --- | --- |
| `recognized` | Parsed and mapped into the dependency graph |
| `partial` | Located and counted, deliberately not graphed (comments, export metadata) |
| `unrecognized` | Not understood; recorded as an unknown |

Adding a row to that registry is the only way to widen recognition, so the
parser, the mapper and the operator-facing coverage report cannot drift apart.
Unfamiliar record types are never coerced into the nearest-looking kind.

**3. Edges are declared, never inferred.** Only field names in `EDGE_FIELDS`
(`goto`, `next`, `then`, `else`, `call`, `include`, `dest`, …) create
dependencies. An invented edge is worse than a missing one because it silently
widens every downstream impact analysis.

Every non-blank line is accounted for: `recognizedLines + unknown lines +
ignorable lines === lineCount`, pinned by test.

## Provenance

Each import produces an `IifProvenance` record derived entirely from the file —
nothing operator-supplied, so it cannot be back-dated or relabelled: file name
(sanitised), byte size, content fingerprint of the *redacted* text, detected
dialect, importer version, timestamp, line and record counts, and redaction
counts by category.

`validatedAgainstRealExport` is hard-coded `false` and shown in the UI as
"Validated against a real export: No". It flips only after the importer has
been exercised against a genuine Amtelco export and the dialect confirmed by an
operator. The coverage report leads with the same statement.

## Coverage report

Per-construct counts (seen / mapped / first line), the share of substantive
lines classified, unrecognised record types, the full unknown-line list with
reasons and short redacted excerpts, and plain-language limitations covering
detection confidence, truncation, unresolved cross-script references, and the
fact that conditions, formulas and action bodies are recorded as structure only
and never evaluated.

## Duplicate and drift detection

`classifyAgainstExisting` compares a candidate against recorded versions:
identical content fingerprint → `duplicate` (recording is blocked); identical
structure fingerprint with different content → `cosmetic_revision` (wording
changed only); otherwise `new`.

## Event Spine

Recording emits `script.version_recorded` with structural references only —
entity id, dialect, version number, structure fingerprint, complexity band,
record count, coverage percentage. Script source, file content and component
names never reach the ledger.

## Files

| File | Role |
| --- | --- |
| `src/lib/script/iif-contract.ts` | Dialects, construct registry, provenance, coverage and import result types, limits |
| `src/lib/script/iif-parse.ts` | Layout detection and deterministic record location |
| `src/lib/script/iif-map.ts` | Records → canonical `ScriptStructure` + coverage report |
| `src/lib/script/iif-import.ts` | Validate → redact → parse → map → fingerprint pipeline, duplicate classification |
| `src/components/knowledge/is-scripts/IifImportPane.tsx` | Operator surface |
| `src/lib/script/activation4-iif-import.test.ts` | 18 tests pinning the safety properties |

## Known gaps

- **Not validated against a real Amtelco export.** The three supported layouts
  are the observable interchange conventions, not a confirmed vendor spec. The
  first real export should be run through the pane and the coverage report used
  to extend `IIF_CONSTRUCTS` and `EDGE_FIELDS`.
- Multi-line XML elements and mixed text content are located as unknowns rather
  than parsed.
- Headerless tab records keep positional values only; naming depends on a
  matching `!TYPE` header row.
- Conditions and formulas are not parsed into expressions.

---

## Activation 5 update — validated against a genuine export (2026-08)

A **genuine Amtelco `.iif` export** was analysed against this pipeline. Finding:
the real export is a **proprietary binary serialization** (~52% high bytes, all
128 high-byte values present, `0x14`+`SCRIPT_` marker, CRLF, ~102 KB), **not**
the text export (tab/INI/XML) this ingestion assumes.

The importer **correctly refuses** the genuine file — `unreadable_encoding` as
the UI reads it (`file.text()`, UTF-8), `binary_content` byte-preserving. This
is the intended conservative behavior, not a bug: the text-first pipeline
declines to guess a binary grammar.

Consequences:
- The tab/INI/XML dialects remain **SYNTHETIC VERIFIED** only.
- `validatedAgainstRealExport` **stays `false`** — no real *text* export has
  exercised the parser.
- No binary grammar was invented; no parser/detector/contract code changed.

See `docs/ACTIVATION_5_REAL_IIF_VALIDATION.md` for the full evidence, the added
regression test (`src/lib/script/activation5-real-iif-import.test.ts`), and the
recommended next step (obtain a text export, or a documented binary spec for a
separate bounded decoder).
