import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";
import {
  CHANGE_RISKS,
  CHANGE_STATUSES,
  CHANGE_TYPES,
  type ChangeRisk,
  type ChangeStatus,
  type ChangeType,
} from "./change-types";

export interface ChangeChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface AccountChangeRecord {
  id: string;
  accountNumber: string;
  accountName: string;
  title: string;
  changeType: ChangeType;
  beforeText: string;
  afterText: string;
  requester: string;
  risk: ChangeRisk;
  status: ChangeStatus;
  rollbackNote: string;
  checklist: ChangeChecklistItem[];
  ticketNumber: string;
  workRef: string;
  testedBy: string;
  notes: string;
  verifiedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const SELECT_COLUMNS =
  "id,account_number,account_name,title,change_type,before_text,after_text,requester,risk,status,rollback_note,checklist,ticket_number,work_ref,tested_by,notes,verified_at,applied_at,created_at,updated_at";

const IdSchema = z.string().uuid();

const ChecklistSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      label: z.string().trim().min(1).max(300),
      done: z.boolean(),
    }),
  )
  .max(40);

function mapRecord(row: Record<string, unknown>): AccountChangeRecord {
  return {
    id: row.id as string,
    accountNumber: (row.account_number as string) ?? "",
    accountName: (row.account_name as string) ?? "",
    title: (row.title as string) ?? "",
    changeType: (row.change_type as ChangeType) ?? "other",
    beforeText: (row.before_text as string) ?? "",
    afterText: (row.after_text as string) ?? "",
    requester: (row.requester as string) ?? "",
    risk: (row.risk as ChangeRisk) ?? "low",
    status: (row.status as ChangeStatus) ?? "draft",
    rollbackNote: (row.rollback_note as string) ?? "",
    checklist: Array.isArray(row.checklist) ? (row.checklist as ChangeChecklistItem[]) : [],
    ticketNumber: (row.ticket_number as string) ?? "",
    workRef: (row.work_ref as string) ?? "",
    testedBy: (row.tested_by as string) ?? "",
    notes: (row.notes as string) ?? "",
    verifiedAt: (row.verified_at as string | null) ?? null,
    appliedAt: (row.applied_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const ListSchema = z.object({
  accountNumber: z.string().trim().max(40).optional(),
  ticketNumber: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(500).optional().default(200),
});

export const listChangeRecords = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => ListSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    let query = context.supabase
      .from("account_change_records")
      .select(SELECT_COLUMNS)
      .eq("user_id", context.userId);
    if (data.accountNumber) query = query.eq("account_number", data.accountNumber);
    if (data.ticketNumber) query = query.eq("ticket_number", data.ticketNumber);
    const { data: rows, error } = await query
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { records: (rows ?? []).map((r) => mapRecord(r as Record<string, unknown>)) };
  });

const CreateSchema = z.object({
  accountNumber: z.string().trim().max(40).optional().default(""),
  accountName: z.string().trim().max(200).optional().default(""),
  title: z.string().trim().min(1).max(200).optional().default("Untitled change"),
  changeType: z.enum(CHANGE_TYPES).optional().default("other"),
  ticketNumber: z.string().trim().max(40).optional().default(""),
  workRef: z.string().trim().max(120).optional().default(""),
  requester: z.string().trim().max(200).optional().default(""),
  risk: z.enum(CHANGE_RISKS).optional().default("low"),
  checklist: ChecklistSchema.optional().default([]),
});

export const createChangeRecord = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("account_change_records")
      .insert({
        user_id: context.userId,
        account_number: data.accountNumber,
        account_name: data.accountName,
        title: data.title,
        change_type: data.changeType,
        ticket_number: data.ticketNumber,
        work_ref: data.workRef,
        requester: data.requester,
        risk: data.risk,
        checklist: data.checklist,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return mapRecord(row as Record<string, unknown>);
  });

const UpdateSchema = z.object({
  id: IdSchema,
  accountNumber: z.string().trim().max(40).optional(),
  accountName: z.string().trim().max(200).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  changeType: z.enum(CHANGE_TYPES).optional(),
  beforeText: z.string().max(20000).optional(),
  afterText: z.string().max(20000).optional(),
  requester: z.string().trim().max(200).optional(),
  risk: z.enum(CHANGE_RISKS).optional(),
  status: z.enum(CHANGE_STATUSES).optional(),
  rollbackNote: z.string().max(20000).optional(),
  checklist: ChecklistSchema.optional(),
  ticketNumber: z.string().trim().max(40).optional(),
  workRef: z.string().trim().max(120).optional(),
  testedBy: z.string().trim().max(200).optional(),
  notes: z.string().max(20000).optional(),
  verifiedAt: z.string().max(64).nullable().optional(),
  appliedAt: z.string().max(64).nullable().optional(),
});

export const updateChangeRecord = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { id, ...c } = data;
    const patch: Record<string, unknown> = {};
    if (c.accountNumber !== undefined) patch.account_number = c.accountNumber;
    if (c.accountName !== undefined) patch.account_name = c.accountName;
    if (c.title !== undefined) patch.title = c.title;
    if (c.changeType !== undefined) patch.change_type = c.changeType;
    if (c.beforeText !== undefined) patch.before_text = c.beforeText;
    if (c.afterText !== undefined) patch.after_text = c.afterText;
    if (c.requester !== undefined) patch.requester = c.requester;
    if (c.risk !== undefined) patch.risk = c.risk;
    if (c.status !== undefined) patch.status = c.status;
    if (c.rollbackNote !== undefined) patch.rollback_note = c.rollbackNote;
    if (c.checklist !== undefined) patch.checklist = c.checklist;
    if (c.ticketNumber !== undefined) patch.ticket_number = c.ticketNumber;
    if (c.workRef !== undefined) patch.work_ref = c.workRef;
    if (c.testedBy !== undefined) patch.tested_by = c.testedBy;
    if (c.notes !== undefined) patch.notes = c.notes;
    if (c.verifiedAt !== undefined) patch.verified_at = c.verifiedAt;
    if (c.appliedAt !== undefined) patch.applied_at = c.appliedAt;

    const { data: row, error } = await context.supabase
      .from("account_change_records")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return mapRecord(row as Record<string, unknown>);
  });

export const deleteChangeRecord = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => z.object({ id: IdSchema }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("account_change_records")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });