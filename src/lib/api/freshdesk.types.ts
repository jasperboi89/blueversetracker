export interface FreshdeskTicketDTO {
  id: number;
  subject: string;
  description_text?: string;
  status: number;
  priority: number;
  group_id?: number | null;
  responder_id?: number | null;
  requester_id?: number | null;
  company_id?: number | null;
  type?: string | null;
  due_by?: string | null;
  fr_due_by?: string | null;
  created_at: string;
  updated_at: string;
  custom_fields?: Record<string, unknown>;
  tags?: string[];
  requester?: { id: number; name: string; email?: string };
  company?: { id: number; name: string };
  attachments?: FreshdeskAttachmentDTO[];
}

export interface FreshdeskAttachmentDTO {
  id: number;
  name: string;
  content_type?: string;
  size?: number;
  created_at: string;
  attachment_url?: string;
}

export interface FreshdeskConversationDTO {
  id: number;
  body_text?: string;
  body?: string;
  user_id?: number;
  from_email?: string;
  private: boolean;
  incoming: boolean;
  created_at: string;
  updated_at: string;
  attachments?: FreshdeskAttachmentDTO[];
}

/** Friendly DTO returned to client (no raw secrets, normalized). */
export interface NormalizedTicket {
  number: string;
  subject: string;
  description: string;
  status: "working" | "waiting-cs" | "waiting-prog" | "completed";
  priority?: "Low" | "Medium" | "High" | "Urgent";
  groupName?: string;
  agentName?: string;
  requesterName?: string;
  companyName?: string;
  type?: string;
  dueAt?: number;
  freshdeskUrl: string;
  createdAt: number;
  updatedAt: number;
  accountNumber?: string;
  accountName?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  searchableText?: string;
}

export interface NormalizedNote {
  freshdeskId: string;
  author: string;
  createdAt: number;
  body: string;
  isPrivate: boolean;
}

export interface NormalizedAttachment {
  freshdeskId: string;
  name: string;
  size?: string;
  createdAt: number;
  url?: string;
  contentType?: string;
}

export interface SyncResult {
  ok: boolean;
  ticket?: NormalizedTicket;
  newNotes: NormalizedNote[];
  newAttachments: NormalizedAttachment[];
  alreadyHadNotes: number;
  alreadyHadAttachments: number;
  syncedAt: number;
  error?: string;
}