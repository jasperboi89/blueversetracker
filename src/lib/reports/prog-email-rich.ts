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

// ---------- formatters mirrored from prog-email-format.ts ----------

function ticketSummary(t: Ticket): string {
  const s = ticketsStore.getSession(t.id);
  return s.issueText.trim() || t.details.subject || "(no summary)";
}
function ticketProgrammingNotes(t: Ticket): string {
  const s = ticketsStore.getSession(t.id);
  const lines: string[] = [];
  if (s.changesText.trim()) lines.push(`Changes: ${s.changesText.trim()}`);
  if (s.failureReason.trim()) lines.push(`Failure Reason: ${s.failureReason.trim()}`);
  if (s.waitingReason.trim()) lines.push(`Waiting Reason: ${s.waitingReason.trim()}`);
  if (s.resultNotes.trim()) lines.push(`Notes: ${s.resultNotes.trim()}`);
  return lines.join("\n");
}
function dispatchSummary(s: DispatchSession): string {
  const reasons = s.reasons.map((r) => r.text).filter(Boolean);
  if (reasons.length) return reasons.join(" / ");
  return s.summaryNotes.split("\n")[0] || "(no summary)";
}
function dispatchNotes(s: DispatchSession): string {
  const lines: string[] = [];
  if (s.statusReason.trim()) lines.push(s.statusReason.trim());
  if (s.summaryNotes.trim()) lines.push(s.summaryNotes.trim());
  return lines.join("\n");
}
function workSummary(a: AdditionalWork): string {
  return a.completionSummary?.trim() || a.whatNeedsDone.trim() || "(no summary)";
}
function workNotes(a: AdditionalWork): string {
  const lines: string[] = [];
  if (a.notes.trim()) lines.push(a.notes.trim());
  if (a.programmingStatusNotes.trim()) lines.push(`Programming Status Notes: ${a.programmingStatusNotes.trim()}`);
  if (a.completionFinalNotes?.trim()) lines.push(a.completionFinalNotes.trim());
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
          `<div style="margin:8px 0;"><div style="font-size:11px;color:#666;margin-bottom:3px;">${meta}</div>` +
            `<img src="${s.dataUrl}" alt="${esc(s.name)}" style="max-width:600px;height:auto;border:1px solid #ddd;border-radius:6px;" /></div>`,
        );
      } else {
        ctx.truncated = true;
        ctx.files += 1;
        items.push(
          `<div style="margin:6px 0;">📎 <a href="${s.dataUrl}" download="${esc(s.name)}">${meta}</a> <span style="color:#999;">(too large to embed)</span></div>`,
        );
      }
    } else if (s.dataUrl) {
      ctx.files += 1;
      items.push(
        `<div style="margin:6px 0;">📎 <a href="${s.dataUrl}" download="${esc(s.name)}">${meta}</a></div>`,
      );
    } else {
      ctx.files += 1;
      items.push(`<div style="margin:6px 0;">📎 ${meta}</div>`);
    }
  });
  return (
    `<div style="margin:6px 0 12px 0;padding:8px 10px;background:#fafafa;border-left:3px solid #ccc;border-radius:4px;">` +
    `<div style="font-size:11px;color:#555;font-weight:600;margin-bottom:4px;">Snips (${snips.length})</div>` +
    items.join("") +
    `</div>`
  );
}

function notesBlock(label: string, text: string): string {
  if (!text) return `<div><strong>${label}:</strong> (none documented)</div>`;
  const lines = text.split("\n").map((l) => `<div style="margin-left:14px;">${esc(l)}</div>`).join("");
  return `<div><strong>${label}:</strong></div>${lines}`;
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
      out.push(`<h3 style="margin:18px 0 8px;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px;">${SECTION_KEYS.worked_freshdesk}</h3>`);
      worked.forEach((t) => {
        out.push(
          `<div style="margin:10px 0 4px;"><strong>Ticket #${esc(t.number)} — Account ${esc(t.accountNumber)} / ${esc(t.accountName)}</strong></div>`,
        );
        out.push(`<div>Summary: ${esc(ticketSummary(t))}</div>`);
        out.push(`<div>Status: ${esc(STATUS_LABEL[t.status])}</div>`);
        out.push(notesBlock("Programming Notes", ticketProgrammingNotes(t)));
        out.push(renderSnips(ctx, (t.hubSnips ?? []) as AnySnip[]));
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
      out.push(`<h3 style="margin:18px 0 8px;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px;">${SECTION_KEYS.dispatch}</h3>`);
      cd.forEach((s) => {
        out.push(
          `<div style="margin:10px 0 4px;"><strong>Account ${esc(s.accountNumber)} / ${esc(s.accountName)}</strong></div>`,
        );
        out.push(`<div>Summary: ${esc(dispatchSummary(s))}</div>`);
        out.push(`<div>Final Status: ${esc(s.status ? DISPATCH_STATUS_LABEL[s.status] : "(no final status)")}</div>`);
        out.push(notesBlock("Notes", dispatchNotes(s)));
        out.push(renderSnips(ctx, (s.snips ?? []) as AnySnip[]));
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
      out.push(`<h3 style="margin:18px 0 8px;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px;">${SECTION_KEYS.additional}</h3>`);
      aw.forEach((a) => {
        const acct = a.accountNumber ? ` — Account ${esc(a.accountNumber)} / ${esc(a.accountName ?? "")}` : "";
        out.push(`<div style="margin:10px 0 4px;"><strong>${esc(a.title)}${acct}</strong></div>`);
        out.push(`<div>Summary: ${esc(workSummary(a))}</div>`);
        out.push(notesBlock("Notes", workNotes(a)));
        out.push(renderSnips(ctx, (a.snips ?? []) as AnySnip[]));
      });
      np.forEach((n) => {
        out.push(`<div style="margin:10px 0 4px;"><strong>${esc(n.task)}</strong></div>`);
        out.push(notesBlock("Notes", n.notes ?? ""));
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
        `<h2 style="margin:24px 0 8px;font-size:16px;padding:6px 10px;background:#eef3fa;border-radius:4px;">Shift: ${esc(w.label)} <span style="font-weight:400;color:#666;font-size:12px;">(${esc(w.timeLabel)})</span></h2>`,
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
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#222;">` +
    sections.join("") +
    (tail
      ? `<hr style="border:none;border-top:1px solid #ddd;margin:18px 0;" />` +
        `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;margin:0;font-size:12px;background:#f7f7f9;padding:12px;border-radius:6px;">${esc(tail.trimStart())}</pre>`
      : "") +
    `</div>`;

  return { html, imageCount: ctx.images, fileCount: ctx.files, truncated: ctx.truncated };
}