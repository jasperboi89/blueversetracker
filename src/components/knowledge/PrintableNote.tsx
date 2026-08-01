import DOMPurify from "dompurify";
import type { KnowledgeNote } from "@/lib/knowledge/knowledge.functions";

function sanitize(html: string): string {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html || "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_LABEL: Record<string, string> = {
  "work-note": "Work note",
  training: "Training",
  prompt: "Prompt",
  procedure: "Procedure",
  reference: "Reference",
};

/**
 * Paper-styled render of a knowledge note. Hidden on screen; only visible in
 * the print stylesheet (see the @media print block in src/styles.css).
 */
export function PrintableNote({
  note,
  folderName,
}: {
  note: KnowledgeNote;
  folderName?: string;
}) {
  const attachments = note.attachments ?? [];
  const images = attachments.filter((a) => a.isImage);
  const files = attachments.filter((a) => !a.isImage);
  const updated = new Date(note.updatedAt);

  return (
    <div id="knowledge-print-root" className="knowledge-print-root">
      <header className="kp-header">
        <h1 className="kp-title">{note.title || "Untitled note"}</h1>
        <div className="kp-meta">
          <span>{TYPE_LABEL[note.noteType] ?? note.noteType}</span>
          {folderName ? <span>Folder: {folderName}</span> : <span>Unfiled</span>}
          <span>
            Updated{" "}
            {updated.toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
        {note.tags.length > 0 && (
          <div className="kp-tags">{note.tags.map((t) => `#${t}`).join("  ")}</div>
        )}
      </header>

      <section className="kp-section">
        <div
          className="kp-body"
          dangerouslySetInnerHTML={{ __html: sanitize(note.contentHtml) }}
        />
      </section>

      {note.aiContentHtml ? (
        <section className="kp-section">
          <h2 className="kp-h2">Organized version</h2>
          <div
            className="kp-body"
            dangerouslySetInnerHTML={{ __html: sanitize(note.aiContentHtml) }}
          />
        </section>
      ) : null}

      {images.length > 0 && (
        <section className="kp-section">
          <h2 className="kp-h2">Attachments</h2>
          {images.map((a) => (
            <figure key={a.id} className="kp-figure">
              <img src={a.dataUrl} alt={a.label || a.name} />
              <figcaption>{a.label || a.name}</figcaption>
            </figure>
          ))}
        </section>
      )}

      {files.length > 0 && (
        <section className="kp-section">
          <h2 className="kp-h2">Files</h2>
          <ul className="kp-files">
            {files.map((a) => (
              <li key={a.id}>
                {a.label || a.name} — {formatBytes(a.sizeBytes)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
