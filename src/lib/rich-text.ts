import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "code",
  "pre",
  "span",
  "mark",
  "div",
];

const ALLOWED_ATTR = ["style", "class"];

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
  });
}

export function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") {
    // very light server-side fallback
    return html
      .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const el = document.createElement("div");
  el.innerHTML = sanitizeHtml(html);
  // Insert newlines for block boundaries so plain text stays readable.
  el.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, br").forEach((n) => {
    n.append("\n");
  });
  return (el.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

export function isEmptyHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  return htmlToPlainText(html).trim().length === 0;
}

/**
 * Convert a plain-text string into minimal HTML so it renders as paragraphs
 * inside the editor / RichText viewer. Preserves blank-line paragraph breaks.
 * Already-HTML input is returned untouched.
 */
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return text;
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const blocks = escaped.split(/\n{2,}/);
  return blocks
    .map((b) => `<p>${b.replace(/\n/g, "<br>")}</p>`)
    .join("");
}