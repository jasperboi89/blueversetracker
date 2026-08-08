import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";

export const IS_SCRIPT_KINDS = [
  "prompt",
  "tree-help",
  "calculation",
  "snippet",
  "other",
] as const;

export type IsScriptKind = (typeof IS_SCRIPT_KINDS)[number];

export interface IsScriptAttachment {
  id: string;
  name: string;
  mimeType: string;
  isImage: boolean;
  dataUrl: string;
  sizeBytes: number;
  createdAt: string;
  label?: string;
}

export interface IsScriptEntry {
  id: string;
  kind: IsScriptKind;
  title: string;
  scriptBody: string;
  usageHtml: string;
  reasonHtml: string;
  exampleHtml: string;
  tags: string[];
  isPinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  attachments: IsScriptAttachment[];
  createdAt: string;
  updatedAt: string;
}

const SELECT_COLUMNS =
  "id,kind,title,script_body,usage_html,reason_html,example_html,tags,is_pinned,is_favorite,is_archived,attachments,created_at,updated_at";

const IdSchema = z.string().uuid();
const TagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(12)
  .transform((tags) => Array.from(new Set(tags.map((tag) => tag.toLocaleLowerCase()))));

const AttachmentSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(150),
  isImage: z.boolean(),
  dataUrl: z.string().min(1).max(7_500_000),
  sizeBytes: z.number().int().min(0).max(10_000_000),
  createdAt: z.string().min(1).max(64),
  label: z.string().trim().max(200).optional(),
});

function mapEntry(row: {
  id: string;
  kind: string;
  title: string;
  script_body: string;
  usage_html: string;
  reason_html: string;
  example_html: string;
  tags: string[];
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  attachments?: unknown;
  created_at: string;
  updated_at: string;
}): IsScriptEntry {
  return {
    id: row.id,
    kind: row.kind as IsScriptKind,
    title: row.title,
    scriptBody: row.script_body,
    usageHtml: row.usage_html,
    reasonHtml: row.reason_html,
    exampleHtml: row.example_html,
    tags: row.tags ?? [],
    isPinned: row.is_pinned,
    isFavorite: row.is_favorite,
    isArchived: row.is_archived,
    attachments: Array.isArray(row.attachments) ? (row.attachments as IsScriptAttachment[]) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const listIsScriptEntries = createServerFn({ method: "GET" })
  .middleware([requireActiveAuthorizedUser])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("is_script_entries")
      .select(SELECT_COLUMNS)
      .eq("user_id", context.userId)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return { entries: (data ?? []).map(mapEntry) };
  });

const CreateEntrySchema = z.object({
  kind: z.enum(IS_SCRIPT_KINDS).optional().default("prompt"),
  title: z.string().trim().min(1).max(200).optional().default("Untitled entry"),
  scriptBody: z.string().max(250000).optional().default(""),
  usageHtml: z.string().max(60000).optional().default(""),
});

export const createIsScriptEntry = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => CreateEntrySchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("is_script_entries")
      .insert({
        user_id: context.userId,
        kind: data.kind,
        title: data.title,
        script_body: data.scriptBody,
        usage_html: data.usageHtml,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return mapEntry(row);
  });

const UpdateEntrySchema = z.object({
  id: IdSchema,
  kind: z.enum(IS_SCRIPT_KINDS).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  scriptBody: z.string().max(250000).optional(),
  usageHtml: z.string().max(60000).optional(),
  reasonHtml: z.string().max(60000).optional(),
  exampleHtml: z.string().max(60000).optional(),
  tags: TagsSchema.optional(),
  isPinned: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  attachments: z.array(AttachmentSchema).max(30).optional(),
});

export const updateIsScriptEntry = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => UpdateEntrySchema.parse(input))
  .handler(async ({ context, data }) => {
    const { id, ...changes } = data;
    const patch = {
      ...(changes.kind !== undefined ? { kind: changes.kind } : {}),
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.scriptBody !== undefined ? { script_body: changes.scriptBody } : {}),
      ...(changes.usageHtml !== undefined ? { usage_html: changes.usageHtml } : {}),
      ...(changes.reasonHtml !== undefined ? { reason_html: changes.reasonHtml } : {}),
      ...(changes.exampleHtml !== undefined ? { example_html: changes.exampleHtml } : {}),
      ...(changes.tags !== undefined ? { tags: changes.tags } : {}),
      ...(changes.isPinned !== undefined ? { is_pinned: changes.isPinned } : {}),
      ...(changes.isFavorite !== undefined ? { is_favorite: changes.isFavorite } : {}),
      ...(changes.isArchived !== undefined ? { is_archived: changes.isArchived } : {}),
      ...(changes.attachments !== undefined ? { attachments: changes.attachments } : {}),
    };
    const { data: row, error } = await context.supabase
      .from("is_script_entries")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return mapEntry(row);
  });

export const deleteIsScriptEntry = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => z.object({ id: IdSchema }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("is_script_entries")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });