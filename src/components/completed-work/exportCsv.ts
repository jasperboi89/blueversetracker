import type { CompletedRecord } from "./types";

function esc(v: string | number | undefined): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCompletedCsv(rows: CompletedRecord[]): string {
  const header = ["Type", "Title", "Account #", "Account Name", "Ticket #", "Completed At (ISO)"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.kind,
        esc(r.title),
        esc(r.accountNumber),
        esc(r.accountName),
        esc(r.ticketNumber),
        new Date(r.completedAt).toISOString(),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}