/**
 * Activation 4 — deterministic IIF layout parser.
 *
 * This module answers exactly one question: "what discrete records does this
 * file contain, and on which line does each start?" It does NOT interpret
 * meaning — mapping to script components happens in `iif-map.ts`, driven by the
 * declared registry in `iif-contract.ts`.
 *
 * Two rules make the parser safe to point at an unfamiliar vendor export:
 *
 * 1. **Detection is layout-only.** `detectDialect` looks at punctuation shape,
 *    never at record names. A file it cannot place becomes `unknown` and every
 *    line becomes a reported unknown — a loud failure, not a quiet one.
 * 2. **Nothing is discarded.** Every non-blank, non-ignorable line either
 *    becomes a record or becomes a `ScriptUnknown` with a reason and a short
 *    excerpt. `recognizedLines + unknown lines + ignorable lines === lineCount`.
 *
 * The input MUST already be redacted (see `iif-import.ts`); excerpts stored in
 * unknowns are copied straight from it.
 */

import { SCRIPT_LIMITS, type ScriptUnknown, type ScriptUnknownReason } from "./script-contract";
import { IIF_LIMITS, canonicalType, type IifDialect } from "./iif-contract";

export interface IifRecord {
  /** 1-based line where the record starts. */
  line: number;
  /** Registry id after alias folding (see `canonicalType`). */
  type: string;
  /** Raw type token as written in the file, for the coverage report. */
  rawType: string;
  /** Named values. Empty when a tab record has no matching header row. */
  fields: Record<string, string>;
  /** Positional values, for headerless tab records. */
  values: string[];
}

export interface IifParseResult {
  dialect: IifDialect;
  records: IifRecord[];
  unknowns: ScriptUnknown[];
  /** Total lines read (after the line cap). */
  lineCount: number;
  /** Non-blank lines positively classified as a record. */
  recognizedLines: number;
  /** Blank lines and comments — neither recognised nor unknown. */
  ignoredLines: number;
  /** Column names per record type, from `!TYPE` header rows. */
  headers: Record<string, string[]>;
  /** True when the file exceeded the line cap and was cut short. */
  truncated: boolean;
}

const COMMENT = /^\s*(?:\/\/|#|;|--|<!--|\/\*)/;
const BLANK = /^\s*$/;

function excerpt(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > SCRIPT_LIMITS.maxExcerpt
    ? `${trimmed.slice(0, SCRIPT_LIMITS.maxExcerpt)}…`
    : trimmed;
}

function clampValue(value: string): string {
  const t = value.trim();
  return t.length > IIF_LIMITS.maxValueLength ? `${t.slice(0, IIF_LIMITS.maxValueLength)}…` : t;
}

function normalizeFieldName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 60);
}

/* ------------------------------------------------------------------ */
/* Dialect detection                                                   */
/* ------------------------------------------------------------------ */

const TAB_HEADER = /^!\S+\t/;
const XML_LINE = /^\s*<\/?[A-Za-z][\w.:-]*(\s|\/?>)/;
const INI_SECTION = /^\s*\[([^\]]{1,120})\]\s*$/;
const INI_PAIR = /^\s*([A-Za-z][\w .\-]{0,60})\s*=\s*(.*)$/;

/**
 * Scores the first slice of the file on punctuation shape alone. Ties resolve
 * to `unknown` rather than to a favourite — a coin-flip guess would produce
 * confident nonsense.
 */
export function detectDialect(text: string): IifDialect {
  const sample = text.split("\n").slice(0, 400);
  let tab = 0;
  let xml = 0;
  let ini = 0;
  let considered = 0;

  for (const line of sample) {
    if (BLANK.test(line) || COMMENT.test(line)) continue;
    considered += 1;
    if (TAB_HEADER.test(line) || (line.includes("\t") && line.split("\t").length > 2)) tab += 1;
    else if (XML_LINE.test(line)) xml += 1;
    else if (INI_SECTION.test(line) || INI_PAIR.test(line)) ini += 1;
  }

  if (considered === 0) return "unknown";
  const best = Math.max(tab, xml, ini);
  // Require a clear majority of classified lines before claiming a dialect.
  if (best === 0 || best / considered < 0.5) return "unknown";
  if (best === tab && tab > xml && tab > ini) return "tab_records";
  if (best === xml && xml > tab && xml > ini) return "xml_elements";
  if (best === ini && ini > tab && ini > xml) return "ini_sections";
  return "unknown";
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

interface Ctx {
  records: IifRecord[];
  unknowns: ScriptUnknown[];
  headers: Record<string, string[]>;
  recognized: number;
  ignored: number;
}

function pushUnknown(ctx: Ctx, line: number, reason: ScriptUnknownReason, raw: string) {
  if (ctx.unknowns.length >= SCRIPT_LIMITS.maxUnknowns) return;
  ctx.unknowns.push({ line, reason, excerpt: excerpt(raw) });
}

function pushRecord(ctx: Ctx, record: IifRecord) {
  if (ctx.records.length >= SCRIPT_LIMITS.maxComponents) return;
  ctx.records.push(record);
  ctx.recognized += 1;
}

function parseTabRecords(lines: string[], ctx: Ctx) {
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    if (BLANK.test(raw) || COMMENT.test(raw)) {
      ctx.ignored += 1;
      continue;
    }

    const cells = raw.split("\t").map((c) => c.trim());
    const head = cells[0] ?? "";

    // `!TYPE  col1  col2` — a header row declaring the columns for TYPE.
    if (head.startsWith("!")) {
      const type = canonicalType(head);
      ctx.headers[type] = cells
        .slice(1, IIF_LIMITS.maxFieldsPerRecord + 1)
        .map(normalizeFieldName)
        .filter(Boolean);
      ctx.ignored += 1;
      continue;
    }

    if (cells.length < 2 || !head) {
      pushUnknown(ctx, lineNo, "unrecognized_construct", raw);
      continue;
    }

    const type = canonicalType(head);
    const columns = ctx.headers[type];
    const values = cells.slice(1, IIF_LIMITS.maxFieldsPerRecord + 1).map(clampValue);
    const fields: Record<string, string> = {};
    if (columns) {
      columns.forEach((name, idx) => {
        const v = values[idx];
        if (name && v) fields[name] = v;
      });
    }

    pushRecord(ctx, { line: lineNo, type, rawType: head, fields, values });
  }
}

function parseIniSections(lines: string[], ctx: Ctx) {
  let current: IifRecord | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    if (BLANK.test(raw) || COMMENT.test(raw)) {
      ctx.ignored += 1;
      continue;
    }

    const section = INI_SECTION.exec(raw);
    if (section) {
      // `[Prompt: Greeting]` and `[Prompt.Greeting]` both name a type and an
      // instance; a bare `[Greeting]` names only an instance.
      const label = section[1]!.trim();
      const split = /^([A-Za-z][\w ]{0,40})\s*[:.]\s*(.+)$/.exec(label);
      const typeToken = split ? split[1]!ature() : label;
      const name = split ? split[2]!.trim() : label;
      current = {
        line: lineNo,
        type: canonicalType(typeToken),
        rawType: typeToken,
        fields: { name: clampValue(name) },
        values: [],
      };
      pushRecord(ctx, current);
      continue;
    }

    const pair = INI_PAIR.exec(raw);
    if (pair) {
      const key = normalizeFieldName(pair[1]!);
      const value = clampValue(pair[2] ?? "");
      if (!current) {
        // A key/value before any section still carries export metadata.
        current = {
          line: lineNo,
          type: "metadata",
          rawType: "metadata",
          fields: {},
          values: [],
        };
        pushRecord(ctx, current);
      }
      if (key && Object.keys(current.fields).length < IIF_LIMITS.maxFieldsPerRecord) {
        current.fields[key] = value;
      }
      ctx.recognized += 1;
      continue;
    }

    pushUnknown(ctx, lineNo, "unrecognized_construct", raw);
  }
}

const XML_OPEN = /^\s*<([A-Za-z][\w.:-]*)([^>]*?)\/?>\s*(?:<\/[A-Za-z][\w.:-]*>)?\s*$/;
const XML_CLOSE = /^\s*<\/[A-Za-z][\w.:-]*>\s*$/;
const XML_ATTR = /([A-Za-z][\w.:-]*)\s*=\s*"([^"]*)"|([A-Za-z][\w.:-]*)\s*=\s*'([^']*)'/g;

function parseXmlElements(lines: string[], ctx: Ctx) {
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    if (BLANK.test(raw) || COMMENT.test(raw)) {
      ctx.ignored += 1;
      continue;
    }
    if (XML_CLOSE.test(raw) || /^\s*<\?/.test(raw)) {
      ctx.ignored += 1;
      continue;
    }

    const open = XML_OPEN.exec(raw);
    if (!open) {
      // Multi-line elements and mixed text content are outside the recognised
      // surface. We locate them rather than guess at their shape.
      const reason: ScriptUnknownReason = raw.includes("<") && !raw.includes(">")
        ? "unbalanced_delimiter"
        : "unsupported_syntax";
      pushUnknown(ctx, lineNo, reason, raw);
      continue;
    }

    const tag = open[1]!;
    const fields: Record<string, string> = {};
    const attrText = open[2] ?? "";
    XML_ATTR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = XML_ATTR.exec(attrText)) !== null) {
      const key = normalizeFieldName(m[1] ?? m[3] ?? "");
      const value = clampValue(m[2] ?? m[4] ?? "");
      if (key && Object.keys(fields).length < IIF_LIMITS.maxFieldsPerRecord) fields[key] = value;
    }

    // `<Prompt>Greeting</Prompt>` — inline text becomes the name.
    const inline = /^\s*<[^>]+>([^<]{1,200})<\/[^>]+>\s*$/.exec(raw);
    if (inline && !fields["name"]) fields["name"] = clampValue(inline[1]!);

    pushRecord(ctx, {
      line: lineNo,
      type: canonicalType(tag),
      rawType: tag,
      fields,
      values: [],
    });
  }
}

/**
 * Parses redacted export text into located records.
 *
 * @param text  Redacted, normalised source. Never raw file content.
 */
export function parseIif(text: string, forcedDialect?: IifDialect): IifParseResult {
  const allLines = text.split("\n");
  const truncated = allLines.length > IIF_LIMITS.maxLines;
  const lines = truncated ? allLines.slice(0, IIF_LIMITS.maxLines) : allLines;

  const dialect = forcedDialect ?? detectDialect(text);
  const ctx: Ctx = { records: [], unknowns: [], headers: {}, recognized: 0, ignored: 0 };

  if (dialect === "tab_records") parseTabRecords(lines, ctx);
  else if (dialect === "ini_sections") parseIniSections(lines, ctx);
  else if (dialect === "xml_elements") parseXmlElements(lines, ctx);
  else {
    // Unknown layout: report every substantive line as unknown. An empty
    // structure with a full unknown list is the honest outcome.
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i]!;
      if (BLANK.test(raw) || COMMENT.test(raw)) ctx.ignored += 1;
      else pushUnknown(ctx, i + 1, "unsupported_syntax", raw);
    }
  }

  return {
    dialect,
    records: ctx.records,
    unknowns: ctx.unknowns,
    lineCount: lines.length,
    recognizedLines: ctx.recognized,
    ignoredLines: ctx.ignored,
    headers: ctx.headers,
    truncated,
  };
}
