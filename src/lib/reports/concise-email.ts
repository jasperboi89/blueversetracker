/**
 * Reusable summarization + rendering service for the concise Programming
 * Status Email. The portal keeps the full record; this module produces the
 * executive-summary presentation layer.
 */
import { aiWorkSummaries } from "../ai/ai.functions";
import type { ConciseCollection, ConciseItem, ConciseSnip } from "./concise-collect";
import { allItems } from "./concise-collect";

export interface ConciseSummary {
  issue: string;
  changes: string;
  notes: string;
}
export type SummaryMap = Record<string, ConciseSummary>;

export function fallbackSummary(item: ConciseItem): ConciseSummary {
  return { ...item.fallback };
}

/** Summarize a batch of items. Falls back to deterministic trimming on failure. */
export async function summarizeItems(
  items: ConciseItem[],
  opts: { style?: string; useAI?: boolean } = {},
): Promise<{ summaries: SummaryMap; aiUsed: boolean; error?: string }> {
  const summaries: SummaryMap = {};
  items.forEach((i) => { summaries[i.key] = fallbackSummary(i); });
  if (!items.length) return { summaries, aiUsed: false };
  if (opts.useAI === false) return { summaries, aiUsed: false };

  try {
    const res = await aiWorkSummaries({
      data: {
        items: items.slice(0, 40).map((i) => ({
          key: i.key,
          kind: i.kind,
          title: i.title,
          context: i.context.slice(0, 4000),
        })),
        ...(opts.style ? { style: opts.style } : {}),
      },
    });
    if (!res.ok) return { summaries, aiUsed: false, error: res.error };
    res.summaries.forEach((s) => {
      if (!summaries[s.key]) return;
      summaries[s.key] = {
        issue: s.issue || summaries[s.key].issue,
        changes: s.changes || summaries[s.key].changes,
        notes: s.notes,
      };
    });
    return { summaries, aiUsed: true };
  } catch (e) {
    return { summaries, aiUsed: false, error: e instanceof Error ? e.message : "AI failed." };
  }
}

/* --------------------------------- Text ---------------------------------- */

export interface RenderOptions {
  collection: ConciseCollection;
  summaries: SummaryMap;
  excludedKeys: string[];
  headerLabel: string;
  headerTime: string;
}

interface Section { title: string; items: ConciseItem[]; showIssue: boolean }

function sections(o: RenderOptions): Section[] {
  const keep = (i: ConciseItem) => !o.excludedKeys.includes(i.key);
  return [
    { title: "Freshdesk Tickets Worked", items: o.collection.freshdesk.filter(keep), showIssue: true },
    { title: "Additional Work Completed", items: o.collection.additional.filter(keep), showIssue: false },
    { title: "Contact Dispatch", items: o.collection.dispatch.filter(keep), showIssue: false },
  ].filter((s) => s.items.length > 0);
}

export function buildConciseText(o: RenderOptions): { body: string; empty: boolean } {
  const secs = sections(o);
  const lines: string[] = [];
  lines.push("Programming Status Update");
  lines.push(`Shift: ${o.headerLabel}`);
  lines.push(`Window: ${o.headerTime}`);

  secs.forEach((sec) => {
    lines.push("");
    lines.push(sec.title);
    lines.push("");
    sec.items.forEach((item, idx) => {
      const s = o.summaries[item.key] ?? fallbackSummary(item);
      lines.push(`${idx + 1}) ${item.title}`);
      if (sec.showIssue) {
        lines.push("");
        lines.push("Issue:");
        lines.push(s.issue || "(not documented)");
        lines.push("");
        lines.push("Changes Made:");
        lines.push(s.changes || "(not documented)");
        if (s.notes.trim()) {
          lines.push("");
          lines.push("Other Notes:");
          lines.push(s.notes.trim());
        }
      } else {
        const text = [s.changes, s.notes.trim()].filter(Boolean).join(" ");
        lines.push(text || "(not documented)");
      }
      lines.push("");
    });
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
  });

  return { body: lines.join("\n"), empty: secs.length === 0 };
}

/* --------------------------------- HTML ---------------------------------- */

const MAX_EMBED_BYTES = 8 * 1024 * 1024;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function approxBytes(dataUrl?: string): number {
  if (!dataUrl) return 0;
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

interface Ctx { budget: number; truncated: boolean; images: number; files: number }

function renderSnips(ctx: Ctx, snips: ConciseSnip[]): string {
  if (!snips.length) return "";
  const items = snips.map((s) => {
    const meta = `${s.category ? `[${esc(s.category)}] ` : ""}${esc(s.name)}${s.label ? ` — ${esc(s.label)}` : ""}`;
    if (s.isImage && s.dataUrl) {
      const size = approxBytes(s.dataUrl);
      if (size <= ctx.budget) {
        ctx.budget -= size;
        ctx.images += 1;
        return `<div style="margin:8px 0;"><div style="font-size:12px;color:#666;margin-bottom:4px;">${meta}</div><img src="${s.dataUrl}" alt="${esc(s.name)}" style="max-width:600px;width:100%;height:auto;border:1px solid #ddd;border-radius:6px;" /></div>`;
      }
      ctx.truncated = true;
      ctx.files += 1;
      return `<div style="margin:6px 0;font-size:13px;">📎 <a href="${s.dataUrl}" download="${esc(s.name)}">${meta}</a></div>`;
    }
    ctx.files += 1;
    return s.dataUrl
      ? `<div style="margin:6px 0;font-size:13px;">📎 <a href="${s.dataUrl}" download="${esc(s.name)}">${meta}</a></div>`
      : `<div style="margin:6px 0;font-size:13px;">📎 ${meta}</div>`;
  });
  return `<div style="margin:10px 0 0 0;">${items.join("")}</div>`;
}

export interface ConciseHtmlResult {
  html: string;
  imageCount: number;
  fileCount: number;
  truncated: boolean;
}

export function buildConciseHtml(o: RenderOptions & { includeSnips?: boolean }): ConciseHtmlResult {
  const ctx: Ctx = { budget: MAX_EMBED_BYTES, truncated: false, images: 0, files: 0 };
  const secs = sections(o);
  const out: string[] = [];

  out.push(
    `<div style="margin-bottom:18px;"><div style="font-size:18px;font-weight:700;color:#111;">Programming Status Update</div>` +
      `<div style="font-size:13px;color:#555;">Shift: ${esc(o.headerLabel)} · ${esc(o.headerTime)}</div></div>`,
  );

  secs.forEach((sec) => {
    out.push(
      `<h3 style="margin:26px 0 12px;font-size:16px;color:#111;border-bottom:2px solid #d8dee8;padding-bottom:6px;">${esc(sec.title)}</h3>`,
    );
    sec.items.forEach((item, idx) => {
      const s = o.summaries[item.key] ?? fallbackSummary(item);
      out.push(`<div style="margin:0 0 18px 0;">`);
      out.push(`<div style="font-weight:700;color:#111;">${idx + 1}) ${esc(item.title)}</div>`);
      if (sec.showIssue) {
        out.push(
          `<div style="margin:8px 0 0 0;"><span style="font-weight:600;">Issue:</span><br/>${esc(s.issue || "(not documented)")}</div>`,
        );
        out.push(
          `<div style="margin:8px 0 0 0;"><span style="font-weight:600;">Changes Made:</span><br/>${esc(s.changes || "(not documented)")}</div>`,
        );
        if (s.notes.trim()) {
          out.push(
            `<div style="margin:8px 0 0 0;"><span style="font-weight:600;">Other Notes:</span><br/>${esc(s.notes.trim())}</div>`,
          );
        }
      } else {
        const text = [s.changes, s.notes.trim()].filter(Boolean).join(" ");
        out.push(`<div style="margin:6px 0 0 0;">${esc(text || "(not documented)")}</div>`);
      }
      if (o.includeSnips !== false) out.push(renderSnips(ctx, item.snips ?? []));
      out.push(`</div>`);
    });
  });

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;font-size:15px;line-height:1.6;">` +
    out.join("") +
    `</div>`;
  return { html, imageCount: ctx.images, fileCount: ctx.files, truncated: ctx.truncated };
}

export function countSnips(c: ConciseCollection, excludedKeys: string[]): number {
  return allItems(c)
    .filter((i) => !excludedKeys.includes(i.key))
    .reduce((n, i) => n + (i.snips?.length ?? 0), 0);
}
