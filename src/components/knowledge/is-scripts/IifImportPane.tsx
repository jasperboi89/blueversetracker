import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Info,
  ListTree,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { importIif, classifyAgainstExisting, complexityForImport } from "@/lib/script/iif-import";
import { recognitionMatrix } from "@/lib/script/iif-map";
import { DIALECT_LABELS, type IifDialect, type IifImportResult } from "@/lib/script/iif-contract";
import { listIsScriptEntries } from "@/lib/is-scripts/is-scripts.functions";
import {
  listScriptVersions,
  recordScriptVersion,
} from "@/lib/script/script-versions.functions";
import { eventSpine } from "@/lib/core/event-spine";

/**
 * Activation 4 — Amtelco script import.
 *
 * Operator-controlled by design: the file is parsed locally, the coverage
 * report is shown, and nothing is written to the version record until the
 * operator explicitly records it. No control on this pane modifies, deploys or
 * executes a script anywhere.
 */
export function IifImportPane() {
  const [result, setResult] = useState<IifImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [dialect, setDialect] = useState<IifDialect | "auto">("auto");
  const [targetId, setTargetId] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  const listEntries = useServerFn(listIsScriptEntries);
  const listVersions = useServerFn(listScriptVersions);
  const recordVersion = useServerFn(recordScriptVersion);

  const entriesQuery = useQuery({
    queryKey: ["is-script-entries"],
    queryFn: () => listEntries(),
  });
  const entries = useMemo(
    () => (entriesQuery.data?.entries ?? []).filter((e) => !e.isArchived),
    [entriesQuery.data],
  );

  const versionsQuery = useQuery({
    queryKey: ["script-versions", targetId],
    queryFn: () => listVersions({ data: { scriptId: targetId, limit: 20 } }),
    enabled: Boolean(targetId),
  });

  function runImport(name: string, text: string, size: number, forced: IifDialect | "auto") {
    const next = importIif({
      fileName: name,
      text,
      sizeBytes: size,
      ...(forced === "auto" ? {} : { dialect: forced }),
    });
    setResult(next);
    if (!next.accepted) toast.error(next.detail);
    else if (next.coverage.dialect === "unknown") {
      toast.warning("Layout not recognised — every line is reported as unknown.");
    } else {
      toast.success(
        `Read ${next.coverage.recordCount} record(s) · ${Math.round(next.coverage.lineCoverage * 100)}% of lines classified`,
      );
    }
  }

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setRawText(text);
    runImport(file.name, text, file.size, dialect);
  }

  const duplicate = useMemo(() => {
    if (!result?.accepted) return null;
    const versions = versionsQuery.data ?? [];
    if (!targetId || versions.length === 0) return null;
    return classifyAgainstExisting(
      {
        contentFingerprint: result.provenance.contentFingerprint,
        structureFingerprint: result.structureFingerprint,
      },
      versions,
    );
  }, [result, versionsQuery.data, targetId]);

  const complexity = useMemo(() => (result ? complexityForImport(result) : null), [result]);

  const record = useMutation({
    mutationFn: () => {
      if (!result?.accepted) throw new Error("Nothing to record");
      const entry = entries.find((e) => e.id === targetId);
      return recordVersion({
        data: {
          scriptId: targetId,
          kind: entry?.kind ?? "is_script",
          // Only the redacted text ever leaves this pane.
          title: `${entry?.title ?? "Imported script"} — ${result.provenance.fileName}`,
          source: result.safeText,
        },
      });
    },
    onSuccess: (res) => {
      if (res.created && result?.accepted) {
        // Structural references only — never file content or component names.
        eventSpine.emit({
          type: "script.version_recorded",
          source: "script",
          metadata: {
            entityType: "script",
            entityId: targetId,
            kind: result.provenance.dialect,
            sourceType: "iif_import",
            scriptVersion: res.version.versionNumber,
            structureFingerprint: res.version.structureFingerprint,
            complexityBand: res.version.complexity.band,
            count: result.coverage.recordCount,
            confidence: Math.round(result.coverage.lineCoverage * 100),
          },
        });
      }
      toast.success(
        res.created
          ? `Recorded version ${res.version.versionNumber} from ${result?.accepted ? result.provenance.fileName : "import"}`
          : "Identical to the last recorded version — nothing new recorded",
      );
      void queryClient.invalidateQueries({ queryKey: ["script-versions", targetId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const matrix = useMemo(() => recognitionMatrix(), []);

  return (
    <div className="space-y-3">
      {/* Standing honesty banner — visible before any file is chosen. */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
        <p>
          Import reads structure only. Credentials and caller details are removed before parsing,
          and nothing here modifies, deploys or runs a script. This importer has{" "}
          <span className="text-foreground">not been validated against a genuine Amtelco export</span>{" "}
          — recognised structure is a reading of the file's layout, not certified IS semantics.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-6 text-center transition",
          dragging && "border-cyan-300/50 bg-cyan-300/[0.06]",
        )}
      >
        <FileUp className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm text-foreground">Drop an IS script export here</p>
        <p className="text-xs text-muted-foreground">
          .iif, .txt, .xml or .ini — parsed in your browser, never uploaded as-is
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Choose file
          </Button>
          <Select
            value={dialect}
            onValueChange={(v) => {
              const next = v as IifDialect | "auto";
              setDialect(next);
              if (rawText) runImport(fileName, rawText, rawText.length, next);
            }}
          >
            <SelectTrigger className="h-8 w-[260px] text-xs">
              <SelectValue placeholder="Layout" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Detect layout automatically</SelectItem>
              <SelectItem value="tab_records">{DIALECT_LABELS.tab_records}</SelectItem>
              <SelectItem value="ini_sections">{DIALECT_LABELS.ini_sections}</SelectItem>
              <SelectItem value="xml_elements">{DIALECT_LABELS.xml_elements}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".iif,.txt,.xml,.ini,.csv,text/plain"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {result && !result.accepted && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
          <div>
            <p className="text-foreground">Import rejected — {result.reason.replace(/_/g, " ")}</p>
            <p className="text-muted-foreground">{result.detail}</p>
          </div>
        </div>
      )}

      {result?.accepted && (
        <>
          {/* Provenance */}
          <Section title="Source provenance" icon={Info}>
            <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <Row label="File" value={result.provenance.fileName} />
              <Row label="Layout" value={DIALECT_LABELS[result.provenance.dialect]} />
              <Row label="Imported" value={new Date(result.provenance.importedAt).toLocaleString()} />
              <Row label="Importer" value={result.provenance.importerVersion} />
              <Row label="Content fingerprint" value={result.provenance.contentFingerprint} />
              <Row label="Structure fingerprint" value={result.structureFingerprint} />
              <Row label="Lines" value={String(result.provenance.lineCount)} />
              <Row label="Records" value={String(result.provenance.recordCount)} />
              <Row
                label="Redacted before parsing"
                value={
                  Object.entries(result.provenance.redactions)
                    .filter(([, n]) => n > 0)
                    .map(([k, n]) => `${k} ×${n}`)
                    .join(", ") || "none detected"
                }
              />
              <Row label="Validated against a real export" value="No" />
            </dl>
          </Section>

          {/* Coverage */}
          <Section title="Structural coverage" icon={ListTree}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">
                {Math.round(result.coverage.lineCoverage * 100)}% of lines classified
              </Badge>
              <Badge variant="outline">{result.coverage.mappedComponentCount} components</Badge>
              <Badge variant="outline">{result.structure.dependencies.length} dependencies</Badge>
              <Badge variant="outline">{result.coverage.unknownCount} unknown</Badge>
              {complexity && <Badge variant="outline">complexity: {complexity.band}</Badge>}
            </div>

            <div className="overflow-hidden rounded-lg border border-white/8">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Construct</th>
                    <th className="px-2 py-1.5 font-medium">Support</th>
                    <th className="px-2 py-1.5 font-medium">Seen</th>
                    <th className="px-2 py-1.5 font-medium">Mapped</th>
                    <th className="px-2 py-1.5 font-medium">First line</th>
                  </tr>
                </thead>
                <tbody>
                  {result.coverage.constructs.map((c) => (
                    <tr key={c.typeId} className="border-t border-white/6">
                      <td className="px-2 py-1.5 text-foreground">{c.label}</td>
                      <td className="px-2 py-1.5">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5",
                            c.support === "recognized" && "bg-emerald-400/12 text-emerald-200",
                            c.support === "partial" && "bg-amber-300/12 text-amber-200",
                            c.support === "unrecognized" && "bg-rose-400/12 text-rose-200",
                          )}
                        >
                          {c.support}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{c.count}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{c.mappedCount}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{c.firstLine}</td>
                    </tr>
                  ))}
                  {result.coverage.constructs.length === 0 && (
                    <tr>
                      <td className="px-2 py-3 text-muted-foreground" colSpan={5}>
                        No records were recognised in this file.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {result.coverage.limitations.map((l) => (
                <li key={l} className="flex gap-1.5">
                  <span className="text-amber-300/70">•</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Unknowns */}
          {result.unknowns.length > 0 && (
            <Section title={`Unrecognised lines (${result.unknowns.length})`} icon={AlertTriangle}>
              <ul className="max-h-56 space-y-1 overflow-auto text-xs">
                {result.unknowns.slice(0, 60).map((u, i) => (
                  <li key={`${u.line}-${i}`} className="flex gap-2">
                    <span className="w-12 shrink-0 text-muted-foreground">L{u.line}</span>
                    <span className="w-44 shrink-0 text-amber-200/80">
                      {u.reason.replace(/_/g, " ")}
                    </span>
                    <code className="truncate text-muted-foreground">{u.excerpt}</code>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Record */}
          <Section title="Record this import" icon={CheckCircle2}>
            <p className="mb-2 text-xs text-muted-foreground">
              Recording appends a version to the append-only script record so the Dependency Cortex
              can diff and analyse it. Only the redacted text is stored.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="h-8 w-[320px] text-xs">
                  <SelectValue placeholder="Attach to an IS script entry…" />
                </SelectTrigger>
                <SelectContent>
                  {entries.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!targetId || record.isPending || duplicate?.kind === "duplicate"}
                onClick={() => record.mutate()}
              >
                Record version
              </Button>
            </div>
            {duplicate && duplicate.kind !== "new" && (
              <p className="mt-2 text-xs text-amber-200/90">
                {duplicate.kind === "duplicate"
                  ? `Identical content to version ${duplicate.matchedVersion} — nothing to record.`
                  : `Same structure as version ${duplicate.matchedVersion}; only wording changed.`}
              </p>
            )}
          </Section>

          {/* Support matrix */}
          <Section title="Declared recognition surface" icon={ShieldCheck}>
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              {matrix.map((m) => (
                <li key={m.id} className="flex gap-2">
                  <span className="w-28 shrink-0 text-foreground">{m.label}</span>
                  <span className="text-muted-foreground">
                    {m.support}
                    {m.mapsTo ? ` → ${m.mapsTo}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Info;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-cyan-300/80" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-48 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-foreground">{value}</dd>
    </div>
  );
}
