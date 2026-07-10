/**
 * Rich-HTML builder for the Programming Status Email.
 *
 * Walks the same data as buildEmail, but renders HTML so each item's snips
 * embed inline (images as <img data:>; other files as 📎 links). One or more
 * shifts may be combined; each shift gets a heading.
 */
import { ticketsStore, STATUS_LABEL, type Ticket } from "../tickets-store";
import {
  dispatchStore,
  DISPATCH_STATUS_LABEL,
  type DispatchSession,
} from "../dispatch-store";
import { additionalWorkStore, type AdditionalWork } from "../additional-work-store";
import type { ShiftWindow } from "./shift-window";
import { isInWindow } from "./shift-window";
import { parseAttentionId, type AttentionId, SECTION_KEYS, type SectionKey } from "./prog-email-format";
import { nightPlanHistory } from "./night-plan-history";
import { nightPlanStore } from "../night-plan-store";
import { htmlToPlainText } from "../rich-text";

const MAX_EMBED_BYTES = 8 * 1024 * 1024;

interface AnySnip {
  id: string;
  name: string;
  category?: string;
  label?: string;
  dataUrl?: string;
  isImage: boolean;
}

export interface RichBuildResult {
  html: string;
  imageCount: number;
  fileCount: number;
  truncated: boolean;
}

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
function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  const text = /<\/?[a-z][\s\S]*>/i.test(value) ? htmlToPlainText(value) : value;
  return text.replace(/\u00a0/g, " ").trim();
}

// ---------- formatters mirrored from prog-email-format.ts ----------

function ticketSummary(t: Ticket): string {
  const s = ticketsStore.getSession(t.id);
  return cleanText(s.issueText) || t.details.subject || "(no summary)";
}
function ticketProgrammingNotes(t: Ticket): string {
  const s = ticketsStore.getSession(t.id);
  const lines: string[] = [];
  const changes = cleanText(s.changesText);
  const failure = cleanText(s.failureReason);
  const waiting = cleanText(s.waitingReason);
  const result = cleanText(s.resultNotes);
  if (changes) lines.push(`Changes: ${changes}`);
  if (failure) lines.push(`Failure Reason: ${failure}`);
  if (waiting) lines.push(`Waiting Reason: ${waiting}`);
  if (result) lines.push(`Notes: ${result}`);
  return lines.join("\n");
}
function dispatchSummary(s: DispatchSession): string {
  const reasons = s.reasons.map((r) => cleanText(r.text)).filter(Boolean);
  if (reasons.length) return reasons.join(" / ");
  return cleanText(s.summaryNotes).split("\n")[0] || "(no summary)";
}
function dispatchNotes(s: DispatchSession): string {
  const lines: string[] = [];
  const statusReason = cleanText(s.statusReason);
  const summaryNotes = cleanText(s.summaryNotes);
  if (statusReason) lines.push(statusReason);
  if (summaryNotes) lines.push(summaryNotes);
  return lines.join("\n");
}
function workSummary(a: AdditionalWork): string {
  return cleanText(a.completionSummary) || cleanText(a.whatNeedsDone) || "(no summary)";
}
function workNotes(a: AdditionalWork): string {
  const lines: string[] = [];
  const notes = cleanText(a.notes);
  const programmingNotes = cleanText(a.programmingStatusNotes);
  const finalNotes = cleanText(a.completionFinalNotes);
  if (notes) lines.push(notes);
  if (programmingNotes) lines.push(`Programming Status Notes: ${programmingNotes}`);
  if (finalNotes) lines.push(finalNotes);
  return lines.join("\n");
}

// ---------- snip rendering with shared embed budget ----------

interface RenderCtx {
  budget: number;
  truncated: boolean;
  images: number;
  files: number;
}

function renderSnips(ctx: RenderCtx, snips: AnySnip[]): string {
  if (!snips.length) return "";
  const items: string[] = [];
  snips.forEach((s) => {
    const meta = `${s.category ? `[${esc(s.category)}] ` : ""}${esc(s.name)}${s.label ? ` — ${esc(s.label)}` : ""}`;
    if (s.isImage && s.dataUrl) {
      const size = approxBytes(s.dataUrl);
      if (size <= ctx.budget) {
        ctx.budget -= size;
        ctx.images += 1;
        items.push(
          `<div style="margin:10px 0;"><div style="font-size:12px;color:#555;margin-bottom:4px;">${meta}</div>` +
            `<img src="${s.dataUrl}" alt="${esc(s.name)}" style="max-width:640px;width:100%;height:auto;border:1px solid #ddd;border-radius:6px;" /></div>`,
        );
      } else {
        ctx.truncated = true;
        ctx.files += 1;
        items.push(
          `<div style="margin:8px 0;font-size:14px;">📎 <a href="${s.dataUrl}" download="${esc(s.name)}">${meta}</a> <span style="color:#999;">(too large to embed)</span></div>`,
        );
      }
    } else if (s.dataUrl) {
      ctx.files += 1;
      items.push(
        `<div style="margin:8px 0;font-size:14px;">📎 <a href="${s.dataUrl}" download="${esc(s.name)}">${meta}</a></div>`,
      );
    } else {
      ctx.files += 1;
      items.push(`<div style="margin:8px 0;font-size:14px;">📎 ${meta}</div>`);
    }
  });
  return (
    `<div style="margin:18px 0 4px 0;padding:14px 16px;background:#fafafa;border-left:4px solid #9ca3af;border-radius:6px;">` +
    `<div style="font-size:13px;color:#444;font-weight:700;margin-bottom:8px;">Snips (${snips.length})</div>` +
    items.join("") +
    `</div>`
  );
}

function notesBlock(label: string, text: string): string {
  if (!text) return `<div style="margin:14px 0;"><div style="font-weight:700;margin-bottom:5px;">${label}:</div><div style="margin-left:18px;">(none documented)</div></div>`;
  const lines = text
    .split("\n")
    .map((l) => `<div style="margin:4px 0 4px 18px;">${esc(l)}</div>`)
    .join("");
  return `<div style="margin:14px 0 4px 0;font-weight:700;">${label}:</div>${lines}`;
}

function cardOpen(num: number, titleHtml: string): string {
  return (
    `<div style="margin:22px 0;padding:18px 20px;border:1px solid #d8dee8;border-left:6px solid #4b5563;border-radius:8px;background:#fff;">` +
    `<div style="font-size:17px;line-height:1.45;font-weight:800;margin-bottom:14px;color:#111;">${num}. ${titleHtml}</div>`
  );
}
function cardClose(): string {
  return `</div>`;
}
function line(html: string): string {
  return `<div style="margin:10px 0;">${html}</div>`;
}

function sectionHeading(label: string): string {
  return (
    `<div style="margin:30px 0 14px;padding:12px 14px;background:#eef2f7;border:1px solid #d8dee8;border-radius:8px;">` +
    `<h3 style="margin:0;font-size:18px;line-height:1.35;letter-spacing:0;color:#111;">${esc(label)}</h3>` +
    `</div>`
  );
}

// ---------- per-window section renderers ----------

function renderWindow(
  ctx: RenderCtx,
  w: ShiftWindow,
  attentionIds: string[],
  hiddenSectionKeys: string[],
): string {
  const { tickets } = ticketsStore.getState();
  const { sessions } = dispatchStore.getState();
  const { items: works } = additionalWorkStore.getState();
  const hidden = (k: SectionKey) => hiddenSectionKeys.includes(k);

  const out: string[] = [];

  // 1) Freshdesk
  if (!hidden("worked_freshdesk")) {
    const worked = tickets.filter(
      (t) =>
        (t.status === "completed" && isInWindow(t.completedAt, w)) ||
        (t.status !== "completed" && isInWindow(t.updatedAt, w)),
    );
    if (worked.length) {
      out.push(`<h3 style="margin:22px 0 10px;font-size:16px;border-bottom:2px solid #d1d5db;padding-bottom:6px;">${SECTION_KEYS.worked_freshdesk}</h3>`);
      worked.forEach((t, i) => {
        out.push(cardOpen(i + 1, `Ticket #${esc(t.number)} — Account ${esc(t.accountNumber)} / ${esc(t.accountName)}`));
        out.push(line(`<strong>Summary:</strong> ${esc(ticketSummary(t))}`));
        out.push(line(`<strong>Status:</strong> ${esc(STATUS_LABEL[t.status])}`));
        out.push(notesBlock("Programming Notes", ticketProgrammingNotes(t)));
        out.push(renderSnips(ctx, (t.hubSnips ?? []) as AnySnip[]));
        out.push(cardClose());
      });
    }
  }

  // 2) Contact Dispatch
  if (!hidden("dispatch")) {
    const cd = sessions.filter(
      (s) =>
        (s.status === "ready" && isInWindow(s.completedAt, w)) ||
        (s.status !== "ready" && isInWindow(s.updatedAt, w)),
    );
    if (cd.length) {
      out.push(`<h3 style="margin:22px 0 10px;font-size:16px;border-bottom:2px solid #d1d5db;padding-bottom:6px;">${SECTION_KEYS.dispatch}</h3>`);
      cd.forEach((s, i) => {
        out.push(cardOpen(i + 1, `Account ${esc(s.accountNumber)} / ${esc(s.accountName)}`));
        out.push(line(`<strong>Summary:</strong> ${esc(dispatchSummary(s))}`));
        out.push(line(`<strong>Final Status:</strong> ${esc(s.status ? DISPATCH_STATUS_LABEL[s.status] : "(no final status)")}`));
        out.push(notesBlock("Notes", dispatchNotes(s)));
        out.push(renderSnips(ctx, (s.snips ?? []) as AnySnip[]));
        out.push(cardClose());
      });
    }
  }

  // 3) Additional Work + attention night-plan
  if (!hidden("additional")) {
    const aw = works.filter(
      (a) =>
        (a.status === "completed" && isInWindow(a.completedAt, w)) ||
        (a.status === "working" && isInWindow(a.updatedAt, w)),
    );
    const np = collectAttentionNightPlan(attentionIds);
    if (aw.length || np.length) {
      out.push(`<h3 style="margin:22px 0 10px;font-size:16px;border-bottom:2px solid #d1d5db;padding-bottom:6px;">${SECTION_KEYS.additional}</h3>`);
      let idx = 0;
      aw.forEach((a) => {
        idx += 1;
        const acct = a.accountNumber ? ` — Account ${esc(a.accountNumber)} / ${esc(a.accountName ?? "")}` : "";
        out.push(cardOpen(idx, `${esc(a.title)}${acct}`));
        out.push(line(`<strong>Summary:</strong> ${esc(workSummary(a))}`));
        out.push(notesBlock("Notes", workNotes(a)));
        out.push(renderSnips(ctx, (a.snips ?? []) as AnySnip[]));
        out.push(cardClose());
      });
      np.forEach((n) => {
        idx += 1;
        out.push(cardOpen(idx, esc(n.task)));
        out.push(notesBlock("Notes", n.notes ?? ""));
        out.push(cardClose());
      });
    }
  }

  // 4 + 5: waiting and attention rendered as plain text-ish blocks (no snips needed beyond items above)
  // Reuse text from buildEmail-style output? We keep the rich version focused on snip embedding.
  // For sections without snips, defer to plain text fallback so users still see them on paste.

  return out.join("");
}

function collectAttentionNightPlan(attentionIds: string[]) {
  const all = nightPlanHistory.getAll();
  const liveActive = nightPlanStore.get().items;
  return attentionIds
    .map(parseAttentionId)
    .filter((i): i is AttentionId => !!i && i.kind === "night-plan")
    .map((i) => {
      const fromHist = all.find((n) => n.id === i.id);
      if (fromHist) return { task: fromHist.task, notes: fromHist.notes };
      const fromLive = liveActive.find((n) => n.id === i.id);
      if (fromLive) return { task: fromLive.task, notes: fromLive.notes };
      return null;
    })
    .filter(Boolean) as { task: string; notes?: string }[];
}

// ---------- public API ----------

export function buildEmailHtml(opts: {
  windows: ShiftWindow[];
  attentionIds: string[];
  hiddenSectionKeys?: string[];
  /** Plain text body to use as fallback wrapper at the top (so non-snip sections still appear). */
  plainBody: string;
}): RichBuildResult {
  const { windows, attentionIds, hiddenSectionKeys = [], plainBody } = opts;
  const ctx: RenderCtx = { budget: MAX_EMBED_BYTES, truncated: false, images: 0, files: 0 };
  const sorted = [...windows].sort((a, b) => a.start.getTime() - b.start.getTime());

  const sections: string[] = [];
  sorted.forEach((w) => {
    if (sorted.length > 1) {
      sections.push(
        `<h2 style="margin:28px 0 10px;font-size:18px;padding:8px 12px;background:#eef3fa;border-radius:6px;">Shift: ${esc(w.label)} <span style="font-weight:400;color:#666;font-size:13px;">(${esc(w.timeLabel)})</span></h2>`,
      );
    }
    sections.push(renderWindow(ctx, w, attentionIds, hiddenSectionKeys));
  });

  // Render the structured per-item sections (with inline snips). The Waiting and
  // Attention sections, which currently lack rich rendering and have no snips,
  // are appended at the end as a plain-text block so they still travel through.
  const tailRegex = /\n(Items Still In Progress \/ Waiting|Items Needing Attention)\n[\s\S]*$/;
  const tailMatch = plainBody.match(tailRegex);
  const tail = tailMatch ? tailMatch[0] : "";

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;font-size:15px;line-height:1.6;">` +
    sections.join("") +
    (tail
      ? `<hr style="border:none;border-top:1px solid #ddd;margin:18px 0;" />` +
        `<pre style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;white-space:pre-wrap;margin:0;font-size:14px;line-height:1.6;color:#111;background:#f7f7f9;padding:14px;border-radius:6px;">${esc(tail.trimStart())}</pre>`
      : "") +
    `</div>`;

  return { html, imageCount: ctx.images, fileCount: ctx.files, truncated: ctx.truncated };
}