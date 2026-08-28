/**
 * Phase 4 — component & dependency extraction.
 *
 * IS scripts have no published grammar, so this is a **conservative recogniser**,
 * not a parser. It matches a bounded set of constructs that operators actually
 * write, and records every line it cannot classify as an explicit
 * `ScriptUnknown`. It never guesses a dependency it did not literally see.
 *
 * Consequences of that choice, on purpose:
 * - Coverage below `MIN_TRUSTED_COVERAGE` marks the whole analysis partial.
 * - A branch target that does not match any component is `unresolved`, not
 *   quietly dropped — an unresolved jump is exactly the kind of thing an
 *   operator wants flagged.
 */

import {
  SCRIPT_LIMITS,
  componentId,
  normalizeKey,
  type ScriptComponent,
  type ScriptComponentKind,
  type ScriptDependency,
  type ScriptDependencyKind,
  type ScriptStructure,
  type ScriptUnknown,
  type ScriptUnknownReason,
} from "./script-contract";
import { safeExcerpt } from "./script-redact";

/* ------------------------------------------------------------------ */
/* Construct patterns                                                  */
/* ------------------------------------------------------------------ */

/** A line that declares something: `[Intake]`, `## Intake`, `Section: Intake`. */
const SECTION_PATTERNS: RegExp[] = [
  /^\[([^\]\n]{1,120})\]\s*$/,
  /^#{1,4}\s+(.{1,120}?)\s*$/,
  /^(?:section|label|step|node|page)\s*[:=]\s*(.{1,120}?)\s*$/i,
];

/** Declarations that introduce a named component of a specific kind. */
const DECLARATIONS: Array<{ kind: ScriptComponentKind; pattern: RegExp }> = [
  { kind: "prompt", pattern: /^(?:prompt|ask|say|question)\s*[:=]\s*(.{1,120}?)\s*$/i },
  { kind: "field", pattern: /^(?:field|input|capture|collect)\s*[:=]\s*(.{1,120}?)\s*$/i },
  { kind: "message", pattern: /^(?:message|msg|deliver|page)\s*[:=]\s*(.{1,120}?)\s*$/i },
  { kind: "action", pattern: /^(?:action|do|run|execute)\s*[:=]\s*(.{1,120}?)\s*$/i },
  { kind: "calculation", pattern: /^(?:calc|calculate|compute|formula)\s*[:=]\s*(.{1,120}?)\s*$/i },
];

/** Reference patterns — each yields a dependency from the enclosing component. */
const REFERENCES: Array<{ kind: ScriptDependencyKind; pattern: RegExp }> = [
  { kind: "branches_to", pattern: /\b(?:goto|go to|branch(?:es)? to|jump to|next)\s*[:=]?\s*\[?([A-Za-z0-9 _.-]{1,80}?)\]?\s*(?:$|[,;])/gi },
  { kind: "branches_to", pattern: /->\s*\[?([A-Za-z0-9 _.-]{1,80}?)\]?\s*(?:$|[,;])/g },
  { kind: "calls", pattern: /\b(?:call|invoke|subroutine)\s*[:=]?\s*\[?([A-Za-z0-9 _.-]{1,80}?)\]?\s*(?:$|[,;()])/gi },
  { kind: "includes", pattern: /\b(?:include|import|insert script)\s*[:=]?\s*\[?([A-Za-z0-9 _.-]{1,80}?)\]?\s*(?:$|[,;])/gi },
  { kind: "transfers_to", pattern: /\b(?:transfer(?:s)? to|dispatch to|route to|escalate to)\s*[:=]?\s*\[?([A-Za-z0-9 _.-]{1,80}?)\]?\s*(?:$|[,;])/gi },
];

/** Variable interpolation: {Name}, %Name%, $Name, [[Name]]. */
const VARIABLE_PATTERNS: RegExp[] = [
  /\{\{?([A-Za-z0-9_. -]{1,60})\}?\}/g,
  /%([A-Za-z0-9_. -]{1,60})%/g,
  /\$([A-Za-z0-9_.]{1,60})\b/g,
];

/** Assignment to a variable — a write rather than a read. */
const ASSIGNMENT = /^\s*(?:set\s+)?[{%$]?([A-Za-z0-9_. -]{1,60})[}%]?\s*(?::?=)\s*(.+)$/i;

/** A conditional introduces a branch component. */
const CONDITIONAL = /^\s*(?:if|when|else\s*if|elif)\b(.{0,160})$/i;

/** Lines that are structurally inert and should not count as unknown. */
const IGNORABLE = /^\s*(?:$|[/#;*-]{1,3}\s|\/\/|<!--)/;

/* ------------------------------------------------------------------ */
/* Extraction                                                          */
/* ------------------------------------------------------------------ */

interface Ctx {
  components: Map<string, ScriptComponent>;
  dependencies: ScriptDependency[];
  unknowns: ScriptUnknown[];
  current: string;
  depSeq: number;
}

function addComponent(
  ctx: Ctx,
  kind: ScriptComponentKind,
  name: string,
  line: number,
): string | undefined {
  const key = normalizeKey(name);
  if (!key) return undefined;
  const id = componentId(kind, key);
  const existing = ctx.components.get(id);
  if (existing) {
    existing.occurrences += 1;
    return id;
  }
  if (ctx.components.size >= SCRIPT_LIMITS.maxComponents) return undefined;
  ctx.components.set(id, { id, kind, name: name.trim(), key, line, occurrences: 1 });
  return id;
}

function addDependency(
  ctx: Ctx,
  kind: ScriptDependencyKind,
  fromId: string,
  toRaw: string,
  line: number,
): void {
  const toKey = normalizeKey(toRaw);
  if (!toKey || ctx.dependencies.length >= SCRIPT_LIMITS.maxDependencies) return;
  // Self-edges are noise, not intelligence.
  if (componentId("section", toKey) === fromId) return;
  ctx.depSeq += 1;
  ctx.dependencies.push({
    id: `d${ctx.depSeq}`,
    kind,
    fromId,
    toKey,
    resolution: "unresolved",
    line,
  });
}

function addUnknown(
  ctx: Ctx,
  line: number,
  reason: ScriptUnknownReason,
  text: string,
): void {
  if (ctx.unknowns.length >= SCRIPT_LIMITS.maxUnknowns) return;
  ctx.unknowns.push({ line, reason, excerpt: safeExcerpt(text, SCRIPT_LIMITS.maxExcerpt) });
}

function matchFirst(patterns: RegExp[], line: string): string | undefined {
  for (const pattern of patterns) {
    const m = pattern.exec(line);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/** Unbalanced brackets usually mean a truncated paste, not a construct we lack. */
function hasUnbalancedDelimiters(line: string): boolean {
  const pairs: Array<[string, string]> = [
    ["[", "]"],
    ["{", "}"],
    ["(", ")"],
  ];
  return pairs.some(([open, close]) => {
    const o = line.split(open).length - 1;
    const c = line.split(close).length - 1;
    return o !== c;
  });
}

/**
 * Extract structure from **already redacted** script text.
 *
 * @param redacted Output of `redactScript`. Passing raw source here would leak
 *   secrets into components, dependencies and unknown excerpts.
 */
export function extractStructure(redacted: string): ScriptStructure {
  const allLines = redacted.split("\n");
  const lines = allLines.slice(0, SCRIPT_LIMITS.maxLines);

  const ctx: Ctx = {
    components: new Map(),
    dependencies: [],
    unknowns: [],
    current: componentId("section", "script root"),
    depSeq: 0,
  };
  // Every script has an implicit root so dependencies declared before the first
  // explicit section still have a valid owner.
  ctx.components.set(ctx.current, {
    id: ctx.current,
    kind: "section",
    name: "Script root",
    key: "script root",
    line: 1,
    occurrences: 1,
  });

  let recognized = 0;

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const truncated = rawLine.length > SCRIPT_LIMITS.maxLineLength;
    const line = truncated ? rawLine.slice(0, SCRIPT_LIMITS.maxLineLength) : rawLine;

    if (IGNORABLE.test(line)) return;

    let matched = false;

    // 1. Section header — becomes the enclosing component for what follows.
    const section = matchFirst(SECTION_PATTERNS, line);
    if (section) {
      const id = addComponent(ctx, "section", section, lineNo);
      if (id) ctx.current = id;
      matched = true;
    }

    // 2. Typed declarations.
    if (!matched) {
      for (const decl of DECLARATIONS) {
        const m = decl.pattern.exec(line);
        if (m?.[1]) {
          const id = addComponent(ctx, decl.kind, m[1], lineNo);
          if (id) addDependency(ctx, "references", ctx.current, m[1], lineNo);
          matched = true;
          break;
        }
      }
    }

    // 3. Conditionals become branch components owned by the current section.
    if (!matched && CONDITIONAL.test(line)) {
      // Identity is the condition text, deliberately NOT the line number: a
      // branch that moved because blank lines were added is the same branch,
      // and line-bearing ids would make every reformat look structural.
      // Repeated identical conditions merge and raise `occurrences`.
      addComponent(ctx, "branch", safeExcerpt(line, 60), lineNo);
      matched = true;
    }

    // 4. Assignment — a write to a variable.
    if (!matched) {
      const assign = ASSIGNMENT.exec(line);
      if (assign?.[1] && /[{%$]/.test(line)) {
        const id = addComponent(ctx, "variable", assign[1], lineNo);
        if (id) addDependency(ctx, "writes", ctx.current, assign[1], lineNo);
        matched = true;
      }
    }

    // 5. Named references (goto / call / include / transfer). These can appear
    //    on an otherwise-recognised line, so they are additive.
    for (const ref of REFERENCES) {
      ref.pattern.lastIndex = 0;
      let m = ref.pattern.exec(line);
      while (m) {
        if (m[1] && m[1].trim()) {
          addDependency(ctx, ref.kind, ctx.current, m[1], lineNo);
          matched = true;
        }
        m = ref.pattern.global ? ref.pattern.exec(line) : null;
      }
    }

    // 6. Variable reads.
    for (const pattern of VARIABLE_PATTERNS) {
      pattern.lastIndex = 0;
      let m = pattern.exec(line);
      while (m) {
        if (m[1] && m[1].trim() && !/^redacted:/i.test(m[1])) {
          const id = addComponent(ctx, "variable", m[1], lineNo);
          if (id) addDependency(ctx, "reads", ctx.current, m[1], lineNo);
          matched = true;
        }
        m = pattern.exec(line);
      }
    }

    if (matched) {
      recognized += 1;
      return;
    }

    // Nothing matched — say so, with a reason.
    if (truncated) {
      addUnknown(ctx, lineNo, "truncated_line", line);
    } else if (hasUnbalancedDelimiters(line)) {
      addUnknown(ctx, lineNo, "unbalanced_delimiter", line);
    } else if (/[<>|&]{2,}|\bregex\b|\bexec\b/i.test(line)) {
      addUnknown(ctx, lineNo, "unsupported_syntax", line);
    } else {
      addUnknown(ctx, lineNo, "unrecognized_construct", line);
    }
  });

  const components = [...ctx.components.values()];

  // Resolve dependency targets against the components we actually found.
  const byKey = new Map<string, ScriptComponent>();
  for (const c of components) {
    if (!byKey.has(c.key)) byKey.set(c.key, c);
  }
  for (const dep of ctx.dependencies) {
    const target = byKey.get(dep.toKey);
    if (target) {
      dep.toId = target.id;
      dep.resolution = "internal";
    } else if (dep.kind === "includes" || dep.kind === "transfers_to") {
      // Pointing at another script or a dispatch destination is expected —
      // outside this script's text, but not a defect.
      dep.resolution = "external";
    } else {
      dep.resolution = "unresolved";
    }
  }

  return {
    components,
    dependencies: ctx.dependencies,
    unknowns: ctx.unknowns,
    lineCount: lines.filter((l) => !IGNORABLE.test(l)).length,
    recognizedLines: recognized,
  };
}
