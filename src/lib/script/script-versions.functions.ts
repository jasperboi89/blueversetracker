import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SCRIPT_LIMITS } from "./script-contract";
import { ingestScript } from "./script-ingest";
import { rowToVersion, versionInsert } from "./script-version-map";

const SELECT =
  "id, script_id, version_number, kind, title, content_fingerprint, structure_fingerprint, structure, complexity, ingested_at";

/**
 * Records a structural snapshot of a script. Idempotent by content: re-ingesting
 * unchanged text returns the existing version instead of inflating history.
 *
 * The raw source is analysed and discarded — only redacted structural metadata
 * is persisted, and the table is insert+select only.
 */
export const recordScriptVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scriptId: z.string().uuid(),
        kind: z.string().min(1).max(60).default("is_script"),
        title: z.string().max(200).default(""),
        source: z.string().max(SCRIPT_LIMITS.maxLines * SCRIPT_LIMITS.maxLineLength),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const analysis = ingestScript(data.source);

    const existing = await supabase
      .from("script_versions")
      .select(SELECT)
      .eq("script_id", data.scriptId)
      .eq("content_fingerprint", analysis.contentFingerprint)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      return { created: false, version: rowToVersion(existing.data), analysis };
    }

    const latest = await supabase
      .from("script_versions")
      .select("version_number")
      .eq("script_id", data.scriptId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) throw new Error(latest.error.message);

    const inserted = await supabase
      .from("script_versions")
      .insert(
        versionInsert({
          operatorUserId: userId,
          scriptId: data.scriptId,
          versionNumber: (latest.data?.version_number ?? 0) + 1,
          kind: data.kind,
          title: data.title,
          analysis,
        }),
      )
      .select(SELECT)
      .single();
    if (inserted.error) throw new Error(inserted.error.message);

    return { created: true, version: rowToVersion(inserted.data), analysis };
  });

/** Version history for one script, newest first. */
export const listScriptVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ scriptId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(20) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("script_versions")
      .select(SELECT)
      .eq("script_id", data.scriptId)
      .order("version_number", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map(rowToVersion);
  });

/** Latest recorded version of every script the operator has analysed. */
export const listLatestScriptVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("script_versions")
      .select(SELECT)
      .order("version_number", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    const latest = [];
    for (const row of rows ?? []) {
      if (seen.has(row.script_id)) continue;
      seen.add(row.script_id);
      latest.push(rowToVersion(row));
    }
    return latest;
  });
