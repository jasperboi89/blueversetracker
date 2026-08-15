import { z } from "zod";

/**
 * Wire schema for the Portal Context Envelope.
 *
 * The server re-validates and *strips* anything it does not recognise, so a
 * client can never smuggle extra fields (ticket bodies, caller details, draft
 * content) into the prompt through the context channel.
 */

const origin = z.enum([
  "observed",
  "retrieved",
  "operator_confirmed",
  "inferred",
  "generated",
  "uncertain",
]);

const freshness = z.enum(["current", "recent", "stale", "historical", "superseded"]);

const activeEntity = z.object({
  id: z.string().max(80),
  label: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  accountId: z.string().max(80).optional(),
  openedAt: z.string().max(40).optional(),
  startedAt: z.string().max(40).optional(),
  collection: z.string().max(120).optional(),
  noteType: z.string().max(60).optional(),
  status: z.string().max(40).optional(),
  updatedAt: z.string().max(40).optional(),
  presentation: z.string().max(30).optional(),
  onScreen: z.boolean().default(false),
  origin,
});

export const PortalContextEnvelopeSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().max(40),
  shiftKey: z.string().max(40),
  location: z.object({
    area: z.string().max(40),
    routeId: z.string().max(60),
    label: z.string().max(80),
    entityType: z.string().max(30).optional(),
    entityId: z.string().max(80).optional(),
  }),
  active: z
    .object({
      ticket: activeEntity.optional(),
      account: activeEntity.optional(),
      workItem: activeEntity.optional(),
      dispatch: activeEntity.optional(),
      knowledgeNote: activeEntity.optional(),
    })
    .default({}),
  workState: z.object({
    running: z.boolean(),
    paused: z.boolean().optional(),
    elapsedMs: z.number().nonnegative().optional(),
    unsavedChanges: z.boolean(),
    unsavedEntities: z.array(z.string().max(30)).max(6).default([]),
    editMode: z.boolean().optional(),
  }),
  blockers: z
    .array(
      z.object({
        id: z.string().max(120),
        type: z.string().max(40),
        label: z.string().max(120),
        since: z.string().max(40),
        entityType: z.string().max(30).optional(),
        entityId: z.string().max(80).optional(),
        origin,
      }),
    )
    .max(10)
    .default([]),
  awareness: z
    .array(
      z.object({
        id: z.string().max(120),
        severity: z.enum(["info", "warning", "critical"]),
        message: z.string().max(300),
        origin,
      }),
    )
    .max(10)
    .default([]),
  recentActivity: z
    .array(
      z.object({
        id: z.string().max(80),
        kind: z.string().max(30),
        label: z.string().max(160),
        at: z.string().max(40),
        complete: z.boolean().optional(),
      }),
    )
    .max(10)
    .default([]),
  accountContext: z
    .object({
      accountNumber: z.string().max(40),
      name: z.string().max(160).optional(),
      generatedAt: z.string().max(40),
      freshness,
      counts: z.object({
        recentTickets: z.number(),
        recentChanges: z.number(),
        knownFixes: z.number(),
        warnings: z.number(),
      }),
      summary: z.string().max(3000),
      unavailable: z.array(z.string().max(40)).max(12).default([]),
      origin,
    })
    .optional(),
  evidence: z
    .array(
      z.object({
        id: z.string().max(160),
        sourceType: z.enum([
          "account_context",
          "resolution",
          "knowledge",
          "runbook",
          "change_record",
          "freshdesk_ticket",
          "similar_work",
        ]),
        sourceId: z.string().max(80),
        title: z.string().max(200).optional(),
        summary: z.string().max(400),
        origin,
        confidence: z.enum(["verified", "probable", "unknown"]).optional(),
        status: z.string().max(40).optional(),
        observedAt: z.string().max(40).optional(),
        updatedAt: z.string().max(40).optional(),
        freshness: freshness.optional(),
        historical: z.boolean().optional(),
        superseded: z.boolean().optional(),
        relevance: z.number().optional(),
      }),
    )
    .max(24)
    .default([]),
  warnings: z
    .array(
      z.object({
        code: z.string().max(40),
        source: z.string().max(40).optional(),
        message: z.string().max(300),
      }),
    )
    .max(12)
    .default([]),
  budget: z
    .object({
      evidenceAvailable: z.number().default(0),
      assemblyMs: z.number().optional(),
    })
    .default({ evidenceAvailable: 0 }),
});

export type WirePortalContextEnvelope = z.infer<typeof PortalContextEnvelopeSchema>;
