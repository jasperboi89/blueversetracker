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
  facts: z
    .array(
      z.object({
        id: z.string().max(240),
        subject: z.object({
          type: z.string().max(30),
          id: z.string().max(80),
          label: z.string().max(200).optional(),
        }),
        predicate: z.string().max(60),
        value: z.union([z.string().max(300), z.number(), z.boolean(), z.null()]),
        origin: z.enum([
          "observed",
          "operator_confirmed",
          "retrieved",
          "inferred",
          "generated",
          "simulated",
          "uncertain",
        ]),
        confidence: z.enum(["verified", "probable", "unknown"]),
        source: z.object({
          type: z.string().max(40),
          id: z.string().max(80).optional(),
          title: z.string().max(200).optional(),
        }),
        observedAt: z.string().max(40).optional(),
        recordedAt: z.string().max(40),
        validFrom: z.string().max(40).optional(),
        validUntil: z.string().max(40).optional(),
        freshness: freshness.optional(),
        supersedes: z.array(z.string().max(240)).max(10).optional(),
        supersededBy: z.array(z.string().max(240)).max(10).optional(),
        status: z.enum(["active", "historical", "superseded", "disputed"]),
        scope: z
          .object({
            accountNumber: z.string().max(40).optional(),
            shiftKey: z.string().max(40).optional(),
            operatorId: z.string().max(80).optional(),
          })
          .optional(),
        metadata: z.record(z.string().max(40), z.union([z.string().max(120), z.number(), z.boolean()])).optional(),
      }),
    )
    .max(40)
    .optional(),
  evidenceConflicts: z
    .array(
      z.object({
        id: z.string().max(240),
        subject: z.object({
          type: z.string().max(30),
          id: z.string().max(80),
          label: z.string().max(200).optional(),
        }),
        predicate: z.string().max(60),
        factIds: z.array(z.string().max(240)).max(10),
        values: z
          .array(
            z.object({
              factId: z.string().max(240),
              value: z.string().max(300),
              origin: z.string().max(30),
              confidence: z.string().max(20),
              at: z.string().max(40).optional(),
            }),
          )
          .max(10),
        interpretation: z.string().max(400).optional(),
        status: z.enum(["unresolved", "resolved"]),
        detectedAt: z.string().max(40),
      }),
    )
    .max(10)
    .optional(),
  memory: z
    .array(
      z.object({
        id: z.string().max(120),
        memoryClass: z.string().max(40),
        title: z.string().max(160),
        summary: z.string().max(900),
        occurredAt: z.string().max(40),
        status: z.string().max(20),
        origin,
        confidence: z.enum(["verified", "probable", "unknown"]).optional(),
        importance: z.number(),
        relevance: z.number(),
        reasons: z.array(z.string().max(60)).max(6).default([]),
        accountNumber: z.string().max(40).optional(),
        ticketId: z.string().max(40).optional(),
      }),
    )
    .max(5)
    .optional(),
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
