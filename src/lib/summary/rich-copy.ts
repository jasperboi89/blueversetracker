/**
 * Rich clipboard helpers for embedding snips into summary copies.
 * All snips are appended in an Attachments block at the end of the body.
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

export function buildSummaryHtml(text: string, snips: SnipLike[]): { html: string; truncated: boolean } {
  const bodyHtml = `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; margin:0;">${escapeHtml(
    text,
  )}</pre>`;

  if (snips.length === 0) {
    return {
      html: `<div>${bodyHtml}</div>`,
      truncated: false,
    };
  }

  let budget = MAX_EMBED_BYTES;
  let truncated = false;
  const itemsHtml: string[] = [];

  snips.forEach((s) => {
    const meta = `${s.category ? `[${escapeHtml(s.category)}] ` : ""}${escapeHtml(s.name)}${
      s.label ? ` — ${escapeHtml(s.label)}` : ""
    }`;
    if (s.isImage && s.dataUrl) {
      const size = approxBytes(s.dataUrl);
      if (size <= budget) {
        budget -= size;
        itemsHtml.push(
          `<div style="margin:12px 0;"><div style="font-size:12px; color:#666; margin-bottom:4px;">${meta}</div>` +
            `<img src="${s.dataUrl}" alt="${escapeHtml(s.name)}" style="max-width:600px; height:auto; border:1px solid #ddd; border-radius:6px;" /></div>`,
        );
      } else {
        truncated = true;
        itemsHtml.push(
          `<div style="margin:8px 0;">📎 <a href="${s.dataUrl}" download="${escapeHtml(s.name)}">${meta}</a> <span style="color:#999;">(too large to embed)</span></div>`,
        );
      }
    } else if (s.dataUrl) {
      itemsHtml.push(
        `<div style="margin:8px 0;">📎 <a href="${s.dataUrl}" download="${escapeHtml(s.name)}">${meta}</a></div>`,
      );
    } else {
      itemsHtml.push(`<div style="margin:8px 0;">📎 ${meta}</div>`);
    }
  });

  const attach = `<hr style="margin:16px 0; border:none; border-top:1px solid #ddd;" />` +
    `<div style="font-weight:600; margin-bottom:8px;">Attachments</div>${itemsHtml.join("")}`;

  return { html: `<div>${bodyHtml}${attach}</div>`, truncated };
}

export function buildSummaryMarkdown(text: string, snips: SnipLike[]): string {
  if (snips.length === 0) return text;
  const lines: string[] = [text.trimEnd(), "", "---", "", "**Attachments**", ""];
  snips.forEach((s) => {
    const meta = `${s.category ? `[${s.category}] ` : ""}${s.name}${s.label ? ` — ${s.label}` : ""}`;
    if (s.isImage && s.dataUrl) {
      lines.push(`![${s.name}](${s.dataUrl})`);
      lines.push(`*${meta}*`);
    } else if (s.dataUrl) {
      lines.push(`📎 [${meta}](${s.dataUrl})`);
    } else {
      lines.push(`📎 ${meta}`);
    }
    lines.push("");
  });
  return lines.join("\n");
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