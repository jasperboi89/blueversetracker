/**
 * Rich clipboard helpers for embedding snips into summary copies.
 * Snips are embedded INLINE wherever the body text contains a
 * `[[SNIP:<id>]]` marker line. Any snips not referenced by a marker
 * fall back to an "Other Snips" block at the end (only when non-empty).
 * - Images embed inline via data: URLs.
 * - Non-image files render as 📎 name with a download anchor.
 */
import { toast } from "sonner";

export interface SnipLike {
  id: string;
  name: string;
  category?: string;
  label?: string;
  dataUrl?: string;
  isImage: boolean;
}

const MAX_EMBED_BYTES = 8 * 1024 * 1024; // ~8MB cap on embedded data: payloads

function escapeHtml(s: string): string {
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

export function snipCounts(snips: SnipLike[]): { images: number; files: number } {
  let images = 0;
  let files = 0;
  snips.forEach((s) => {
    if (s.isImage && s.dataUrl) images += 1;
    else files += 1;
  });
  return { images, files };
}

const SNIP_MARKER = /^(\s*)\[\[SNIP:([A-Za-z0-9_-]+)\]\]\s*$/;

interface RenderState {
  budget: number;
  truncated: boolean;
}

function snipMeta(s: SnipLike, escape: (v: string) => string): string {
  return `${s.category ? `[${escape(s.category)}] ` : ""}${escape(s.name)}${
    s.label ? ` — ${escape(s.label)}` : ""
  }`;
}

function renderSnipHtml(s: SnipLike, state: RenderState, indentPx = 0): string {
  const meta = snipMeta(s, escapeHtml);
  const pad = indentPx ? ` margin-left:${indentPx}px;` : "";
  if (s.isImage && s.dataUrl) {
    const size = approxBytes(s.dataUrl);
    if (size <= state.budget) {
      state.budget -= size;
      return (
        `<div style="margin:8px 0;${pad}"><div style="font-size:11px;color:#666;margin-bottom:3px;">${meta}</div>` +
        `<img src="${s.dataUrl}" alt="${escapeHtml(s.name)}" style="max-width:600px;height:auto;border:1px solid #ddd;border-radius:6px;" /></div>`
      );
    }
    state.truncated = true;
    return `<div style="margin:6px 0;${pad}">📎 <a href="${s.dataUrl}" download="${escapeHtml(s.name)}">${meta}</a> <span style="color:#999;">(too large to embed)</span></div>`;
  }
  if (s.dataUrl) {
    return `<div style="margin:6px 0;${pad}">📎 <a href="${s.dataUrl}" download="${escapeHtml(s.name)}">${meta}</a></div>`;
  }
  return `<div style="margin:6px 0;${pad}">📎 ${meta}</div>`;
}

export function buildSummaryHtml(text: string, snips: SnipLike[]): { html: string; truncated: boolean } {
  const byId = new Map(snips.map((s) => [s.id, s]));
  const consumed = new Set<string>();
  const state: RenderState = { budget: MAX_EMBED_BYTES, truncated: false };

  // Walk the text line-by-line, accumulating runs of plain text into <pre>
  // blocks and replacing [[SNIP:id]] markers with inline image/file HTML.
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    const joined = buf.join("\n");
    out.push(
      `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; margin:0;">${escapeHtml(joined)}</pre>`,
    );
    buf = [];
  };

  text.split("\n").forEach((line) => {
    const m = line.match(SNIP_MARKER);
    if (m) {
      const id = m[2];
      const snip = byId.get(id);
      if (snip) {
        flush();
        const indent = Math.min(m[1].length * 6, 60);
        out.push(renderSnipHtml(snip, state, indent));
        consumed.add(id);
        return;
      }
      // Unknown id: drop the marker silently (don't leak `[[SNIP:..]]` into pasted output).
      return;
    }
    buf.push(line);
  });
  flush();

  const leftover = snips.filter((s) => !consumed.has(s.id));
  if (leftover.length) {
    out.push(
      `<hr style="margin:16px 0;border:none;border-top:1px solid #ddd;" />` +
        `<div style="font-weight:600;margin-bottom:8px;">Other Snips</div>` +
        leftover.map((s) => renderSnipHtml(s, state)).join(""),
    );
  }

  return { html: `<div>${out.join("")}</div>`, truncated: state.truncated };
}

function renderSnipMarkdown(s: SnipLike): string[] {
  const meta = `${s.category ? `[${s.category}] ` : ""}${s.name}${s.label ? ` — ${s.label}` : ""}`;
  if (s.isImage && s.dataUrl) return [`![${s.name}](${s.dataUrl})`, `*${meta}*`];
  if (s.dataUrl) return [`📎 [${meta}](${s.dataUrl})`];
  return [`📎 ${meta}`];
}

export function buildSummaryMarkdown(text: string, snips: SnipLike[]): string {
  const byId = new Map(snips.map((s) => [s.id, s]));
  const consumed = new Set<string>();
  const out: string[] = [];

  text.split("\n").forEach((line) => {
    const m = line.match(SNIP_MARKER);
    if (m) {
      const id = m[2];
      const snip = byId.get(id);
      if (snip) {
        renderSnipMarkdown(snip).forEach((l) => out.push(`${m[1]}${l}`));
        consumed.add(id);
      }
      return;
    }
    out.push(line);
  });

  const leftover = snips.filter((s) => !consumed.has(s.id));
  if (leftover.length) {
    out.push("", "---", "", "**Other Snips**", "");
    leftover.forEach((s) => {
      renderSnipMarkdown(s).forEach((l) => out.push(l));
      out.push("");
    });
  }
  return out.join("\n");
}

export async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  // Legacy fallback: hidden contenteditable + execCommand('copy')
  try {
    const div = document.createElement("div");
    div.contentEditable = "true";
    div.style.position = "fixed";
    div.style.left = "-9999px";
    div.style.top = "0";
    div.innerHTML = html;
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand("copy");
    sel?.removeAllRanges();
    document.body.removeChild(div);
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** One-call helper used by buttons. Shows a toast on success/failure. */
export async function copyRichSummary(text: string, snips: SnipLike[]) {
  const { html, truncated } = buildSummaryHtml(text, snips);
  const ok = await copyRich(html, text);
  if (!ok) {
    toast.error("Copy failed. Try Copy Text Only.");
    return;
  }
  const { images, files } = snipCounts(snips);
  const parts: string[] = ["Copied with snips."];
  if (images || files) parts.push(`${images} image${images === 1 ? "" : "s"}, ${files} file${files === 1 ? "" : "s"}.`);
  if (truncated) parts.push("Some snips were too large to embed — included as links instead.");
  toast.success(parts.join(" "));
}

export async function copyMarkdownSummary(text: string, snips: SnipLike[]) {
  const md = buildSummaryMarkdown(text, snips);
  const ok = await copyText(md);
  if (!ok) {
    toast.error("Copy failed.");
    return;
  }
  toast.success("Copied markdown.");
}