import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";

export const KNOWLEDGE_NOTE_TYPES = [
  "work-note",
  "training",
  "prompt",
  "procedure",
  "reference",
] as const;

export type KnowledgeNoteType = (typeof KNOWLEDGE_NOTE_TYPES)[number];

export interface KnowledgeAttachment {
  id: string;
  name: string;
  mimeType: string;
  isImage: boolean;
  dataUrl: string;
  sizeBytes: number;
  createdAt: string;
  label?: string;
}

export interface KnowledgeFolder {
  id: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeNoteVersion {
  id: string;
  label: string;
  html: string;
  createdAt: string;
}

export interface KnowledgeNote {
  id: string;
  folderId: string | null;
  title: string;
  contentHtml: string;
  noteType: KnowledgeNoteType;
  tags: string[];
  isPinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: KnowledgeAttachment[];
  aiContentHtml: string;
  aiGeneratedAt: string | null;
  aiSourceFingerprint: string;
  versions: KnowledgeNoteVersion[];
}

const IdSchema = z.string().uuid();
const FolderNameSchema = z.string().trim().min(1).max(80);
const FolderColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
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
const AttachmentsSchema = z.array(AttachmentSchema).max(30);

/** Accepts any parseable timestamp (Postgres "+00:00" or ISO "Z") and normalizes it. */
const FlexibleTimestamp = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), { message: "Invalid datetime" })
  .transform((value) => new Date(value).toISOString());

const VersionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  html: z.string().max(250000),
  createdAt: FlexibleTimestamp,
});
const VersionsSchema = z.array(VersionSchema).max(30);

function mapFolder(row: {
  id: string;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}): KnowledgeFolder {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNote(row: {
  id: string;
  folder_id: string | null;
  title: string;
  content_html: string;
  note_type: string;
  tags: string[];
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  attachments?: unknown;
  ai_content_html?: string;
  ai_generated_at?: string | null;
  ai_source_fingerprint?: string;
  versions?: unknown;
}): KnowledgeNote {
  return {
    id: row.id,
    folderId: row.folder_id,
    title: row.title,
    contentHtml: row.content_html,
    noteType: row.note_type as KnowledgeNoteType,
    tags: row.tags,
    isPinned: row.is_pinned,
    isFavorite: row.is_favorite,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: Array.isArray(row.attachments) ? (row.attachments as KnowledgeAttachment[]) : [],
    aiContentHtml: row.ai_content_html ?? "",
    aiGeneratedAt: row.ai_generated_at ?? null,
    aiSourceFingerprint: row.ai_source_fingerprint ?? "",
    versions: Array.isArray(row.versions) ? (row.versions as KnowledgeNoteVersion[]) : [],
  };
}

export const listKnowledgeVault = createServerFn({ method: "GET" })
  .middleware([requireActiveAuthorizedUser])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [foldersResult, notesResult] = await Promise.all([
      supabase
        .from("knowledge_folders")
        .select("id,name,description,color,sort_order,created_at,updated_at")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("knowledge_notes")
        .select(
          "id,folder_id,title,content_html,note_type,tags,is_pinned,is_favorite,is_archived,created_at,updated_at,attachments,ai_content_html,ai_generated_at,ai_source_fingerprint,versions",
        )
        .eq("user_id", userId)
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1000),
    ]);
    const error = foldersResult.error ?? notesResult.error;
    if (error) throw new Error(error.message);
    return {
      folders: (foldersResult.data ?? []).map(mapFolder),
      notes: (notesResult.data ?? []).map(mapNote),
    };
  });

const CreateFolderSchema = z.object({
  name: FolderNameSchema,
  description: z.string().trim().max(500).optional().default(""),
  color: FolderColorSchema.optional().default("#22d3ee"),
});

export const createKnowledgeFolder = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => CreateFolderSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("knowledge_folders")
      .insert({
        user_id: context.userId,
        name: data.name,
        description: data.description,
        color: data.color,
      })
      .select("id,name,description,color,sort_order,created_at,updated_at")
      .single();
    if (error)
      throw new Error(
        error.code === "23505" ? "A folder with that name already exists." : error.message,
      );
    return mapFolder(row);
  });

const UpdateFolderSchema = z.object({
  id: IdSchema,
  name: FolderNameSchema.optional(),
  description: z.string().trim().max(500).optional(),
  color: FolderColorSchema.optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const updateKnowledgeFolder = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => UpdateFolderSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { id, sortOrder, ...rest } = data;
    const patch = {
      ...rest,
      ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
    };
    const { data: row, error } = await context.supabase
      .from("knowledge_folders")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select("id,name,description,color,sort_order,created_at,updated_at")
      .single();
    if (error)
      throw new Error(
        error.code === "23505" ? "A folder with that name already exists." : error.message,
      );
    return mapFolder(row);
  });

export const deleteKnowledgeFolder = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => z.object({ id: IdSchema }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("knowledge_folders")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const CreateNoteSchema = z.object({
  folderId: IdSchema.nullable().optional().default(null),
  noteType: z.enum(KNOWLEDGE_NOTE_TYPES).optional().default("work-note"),
  title: z.string().trim().min(1).max(200).optional().default("Untitled note"),
});

export const createKnowledgeNote = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => CreateNoteSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("knowledge_notes")
      .insert({
        user_id: context.userId,
        folder_id: data.folderId,
        note_type: data.noteType,
        title: data.title,
      })
      .select(
        "id,folder_id,title,content_html,note_type,tags,is_pinned,is_favorite,is_archived,created_at,updated_at,attachments,ai_content_html,ai_generated_at,ai_source_fingerprint,versions",
      )
      .single();
    if (error) throw new Error(error.message);
    return mapNote(row);
  });

const UpdateNoteSchema = z.object({
  id: IdSchema,
  folderId: IdSchema.nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  contentHtml: z.string().max(250000).optional(),
  noteType: z.enum(KNOWLEDGE_NOTE_TYPES).optional(),
  tags: TagsSchema.optional(),
  isPinned: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  attachments: AttachmentsSchema.optional(),
  aiContentHtml: z.string().max(250000).optional(),
  aiGeneratedAt: FlexibleTimestamp.nullable().optional(),
  aiSourceFingerprint: z.string().max(64).optional(),
  versions: VersionsSchema.optional(),
});

export const updateKnowledgeNote = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => UpdateNoteSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { id, ...changes } = data;
    const patch = {
      ...(changes.folderId !== undefined ? { folder_id: changes.folderId } : {}),
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.contentHtml !== undefined ? { content_html: changes.contentHtml } : {}),
      ...(changes.noteType !== undefined ? { note_type: changes.noteType } : {}),
      ...(changes.tags !== undefined ? { tags: changes.tags } : {}),
      ...(changes.isPinned !== undefined ? { is_pinned: changes.isPinned } : {}),
      ...(changes.isFavorite !== undefined ? { is_favorite: changes.isFavorite } : {}),
      ...(changes.isArchived !== undefined ? { is_archived: changes.isArchived } : {}),
      ...(changes.attachments !== undefined ? { attachments: changes.attachments } : {}),
      ...(changes.aiContentHtml !== undefined
        ? { ai_content_html: changes.aiContentHtml }
        : {}),
      ...(changes.aiGeneratedAt !== undefined
        ? { ai_generated_at: changes.aiGeneratedAt }
        : {}),
      ...(changes.aiSourceFingerprint !== undefined
        ? { ai_source_fingerprint: changes.aiSourceFingerprint }
        : {}),
      ...(changes.versions !== undefined ? { versions: changes.versions } : {}),
    };
    const { data: row, error } = await context.supabase
      .from("knowledge_notes")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select(
        "id,folder_id,title,content_html,note_type,tags,is_pinned,is_favorite,is_archived,created_at,updated_at,attachments,ai_content_html,ai_generated_at,ai_source_fingerprint,versions",
      )
      .single();
    if (error) throw new Error(error.message);
    return mapNote(row);
  });

export const deleteKnowledgeNote = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => z.object({ id: IdSchema }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("knowledge_notes")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
