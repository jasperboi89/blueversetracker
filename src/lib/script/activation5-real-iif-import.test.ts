import { describe, expect, it } from "vitest";
import { importIif } from "./iif-import";

/**
 * Activation 5 — validation against a GENUINE Amtelco `.iif` export.
 *
 * A real Amtelco Intelligent Series script export was supplied and analysed
 * (structural facts only — no source content is reproduced here or committed):
 *
 *   - ~102 KB, 289 lines, CRLF line endings
 *   - first byte 0x14 (DC4) immediately followed by the ASCII marker "SCRIPT_"
 *   - ~52% of bytes are high bytes (>= 0x80), ALL 128 high values present
 *   - NUL and DEL bytes present; ~10% ASCII control bytes (FS/GS/RS/US framing)
 *   - NOT UTF-16 (only ~0.3% NUL), NOT tab/INI/XML text
 *
 * Conclusion: the genuine export is a PROPRIETARY BINARY serialization, not the
 * text export the Activation 1-4 pipeline was designed for. The importer is
 * TEXT-first by design, so it correctly refuses the file rather than guessing at
 * a binary grammar. Running the real importer against the genuine file
 * (verified out-of-band) rejects it:
 *   - as the UI reads it (`await file.text()`, UTF-8) → `unreadable_encoding`
 *   - byte-preserving                                  → `binary_content`
 *
 * These tests lock that safe behavior with SYNTHETIC mirrors (no real content),
 * and confirm the text path still has no false positives. They do NOT assert a
 * binary grammar — none has been validated, and `validatedAgainstRealExport`
 * stays `false`. See docs/ACTIVATION_5_REAL_IIF_VALIDATION.md.
 */

const cc = String.fromCharCode;

// UTF-8 decoding of a binary file yields U+FFFD replacement characters — this is
// exactly what the Script Import UI (`file.text()`) produces for the real export.
const BINARY_AS_UTF8 = "SCRIPT_" + cc(0xfffd) + cc(0xfffd) + " body " + cc(0xfffd) + " end";

// A byte-preserving read keeps the control framing bytes (0x14 record marker,
// 0x1e/0x1f record/unit separators) the genuine file uses.
const BINARY_BYTE_FRAMED =
  "SCRIPT_" + cc(0x14) + "screen" + cc(0x1e) + "field" + cc(0x1f) + "value" + cc(0x1d) + "next";

// A plain-text export in an unrecognised layout — the conservative baseline.
const PLAIN_UNKNOWN_TEXT = "SCRIPT_ greeting\nverify caller\ndispatch on-call";

describe("Activation 5 — genuine binary Amtelco export is safely refused", () => {
  it("rejects a binary export decoded as UTF-8 (the UI read path)", () => {
    const r = importIif({ fileName: "SampleScript.iif", text: BINARY_AS_UTF8, sizeBytes: 104994 });
    expect(r.accepted).toBe(false);
    if (!r.accepted) expect(r.reason).toBe("unreadable_encoding");
  });

  it("rejects a byte-preserving binary export as binary_content", () => {
    const r = importIif({
      fileName: "SampleScript.iif",
      text: BINARY_BYTE_FRAMED,
      sizeBytes: 104994,
    });
    expect(r.accepted).toBe(false);
    if (!r.accepted) expect(r.reason).toBe("binary_content");
  });

  it("never fabricates structure from a refused binary export", () => {
    const r = importIif({ fileName: "SampleScript.iif", text: BINARY_AS_UTF8, sizeBytes: 104994 });
    // A refused import exposes no structure, no safe text, no fingerprint.
    expect("structure" in r).toBe(false);
    expect("safeText" in r).toBe(false);
  });

  it("has no false positive: plain text in an unknown layout is accepted but yields zero records", () => {
    const r = importIif({ fileName: "notes.iif", text: PLAIN_UNKNOWN_TEXT });
    expect(r.accepted).toBe(true);
    if (r.accepted) {
      expect(r.provenance.dialect).toBe("unknown");
      expect(r.provenance.recordCount).toBe(0);
      // Honest failure: every substantive line is reported as unknown, not guessed.
      expect(r.unknowns.length).toBeGreaterThan(0);
      // The real-export flag is never set by ingestion.
      expect(r.provenance.validatedAgainstRealExport).toBe(false);
    }
  });
});
