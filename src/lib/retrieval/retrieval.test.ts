import { describe, expect, it } from "vitest";
import { fuseCandidates, parseIdentifiers, RRF_K } from "./fusion";
import {
  changeRecordToRetrievalDocument,
  contentHash,
  chunkText,
  knowledgeToRetrievalDocuments,
  resolutionToRetrievalDocument,
  safeSemanticText,
  ticketToSafeRetrievalDocument,
} from "./projections";
import type { LexicalCandidate, SemanticCandidate } from "./retrieval-types";
import type { ResolutionMemory } from "@/lib/resolution/resolution-types";
import type { AccountChangeRecord } from "@/lib/changes/changes.functions";
import type { KnowledgeNote } from "@/lib/knowledge/knowledge.functions";
import { lovableEmbeddingProvider, type EmbeddingProvider } from "./embedding-provider.server";
import { resolveSemanticText, SemanticBoundaryError } from "./semantic-guard";

const NOW = Date.parse("2026-06-01T00:00:00.000Z");

function lex(id: string, score: number, over: Partial<LexicalCandidate> = {}): LexicalCandidate {
  return {
    id,
    sourceType: "resolution",
    sourceId: id,
    chunkId: "",
    accountNumber: "",
    title: `title ${id}`,
    text: `text ${id}`,
    sourceStatus: "active",
    confidence: "",
    lexicalScore: score,
    ...over,
  } as LexicalCandidate;
}

function sem(id: string, distance: number, over: Partial<SemanticCandidate> = {}): SemanticCandidate {
  return { ...lex(id, 0, over as Partial<LexicalCandidate>), distance } as SemanticCandidate;
}

describe("identifier parsing", () => {
  it("extracts ticket, account and uuid identifiers", () => {
    const ids = parseIdentifiers("#12345 acct 90210 for 6f1b2b6e-9f0a-4c1a-9c11-2f9a1b4c5d6e");
    expect(ids.ticketNumbers).toContain("12345");
    expect(ids.accountNumbers).toContain("90210");
    expect(ids.ids).toHaveLength(1);
  });
});

describe("fusion", () => {
  it("is deterministic and ranks a both-list hit above single-list hits", () => {
    const lexical = [lex("a", 5), lex("b", 4)];
    const semantic = [sem("b", 0.1), sem("c", 0.2)];
    const opts = { identifiers: parseIdentifiers("x"), limit: 10, now: NOW };
    const first = fuseCandidates(lexical, semantic, opts);
    const second = fuseCandidates(lexical, semantic, opts);
    expect(first.map((r) => r.sourceId)).toEqual(second.map((r) => r.sourceId));
    expect(first[0]!.sourceId).toBe("b");
    expect(first[0]!.matchedBy).toEqual(expect.arrayContaining(["lexical", "semantic"]));
    expect(first[0]!.fusionScore).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1), 10);
  });

  it("puts exact identifier matches first even when semantics disagree", () => {
    const lexical = [lex("9001", 0.1, { accountNumber: "9001" })];
    const semantic = [sem("other", 0.01), sem("other2", 0.02)];
    const out = fuseCandidates(lexical, semantic, {
      identifiers: parseIdentifiers("acct 9001"),
      limit: 5,
      now: NOW,
    });
    expect(out[0]!.sourceId).toBe("9001");
    expect(out[0]!.matchedBy[0]).toBe("exact");
  });

  it("ranks verified above merely recent", () => {
    const verifiedOld = lex("verified", 1, {
      confidence: "verified",
      sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
    const unknownNew = lex("fresh", 1.2, {
      confidence: "unknown",
      sourceUpdatedAt: "2026-05-31T00:00:00.000Z",
    });
    const out = fuseCandidates([unknownNew, verifiedOld], [], {
      identifiers: parseIdentifiers("issue"),
      limit: 5,
      now: NOW,
    });
    expect(out[0]!.sourceId).toBe("verified");
  });

  it("demotes superseded results without hiding them", () => {
    const active = lex("active", 1);
    const superseded = lex("old", 2, { sourceStatus: "superseded" });
    const out = fuseCandidates([superseded, active], [], {
      identifiers: parseIdentifiers("issue"),
      limit: 5,
      now: NOW,
    });
    expect(out.map((r) => r.sourceId)).toEqual(["active", "old"]);
    expect(out[1]!.matchedBy).toContain("historical");
  });

  it("boosts same-account results and carries provenance", () => {
    const other = lex("other", 2, { accountNumber: "111" });
    const same = lex("same", 1.9, { accountNumber: "999" });
    const out = fuseCandidates([other, same], [], {
      identifiers: parseIdentifiers("issue"),
      accountNumber: "999",
      limit: 5,
      now: NOW,
    });
    expect(out[0]!.sourceId).toBe("same");
    expect(out[0]!.provenance.source).toBe("resolution");
    expect(out[0]!.provenance.sourceId).toBe("same");
  });

  it("returns lexical-only results unchanged when semantic is unavailable", () => {
    const out = fuseCandidates([lex("a", 3), lex("b", 2)], [], {
      identifiers: parseIdentifiers("issue"),
      limit: 5,
      now: NOW,
    });
    expect(out.map((r) => r.sourceId)).toEqual(["a", "b"]);
    expect(out.every((r) => r.matchedBy.includes("lexical"))).toBe(true);
  });
});

describe("projections and privacy", () => {
  const resolution: ResolutionMemory = {
    id: "r1",
    accountNumber: "999",
    accountName: "Acme",
    problem: "Calls dropping after hours",
    rootCause: "Bad routing entry",
    resolution: "Rebuilt the after-hours routing block",
    testing: "Test call verified",
    rollback: "Restore prior block",
    affectedArea: "routing",
    confidence: "verified",
    source: { ticketId: "12345" },
    status: "active",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
  };

  it("projects a resolution with stable hashing", () => {
    const doc = resolutionToRetrievalDocument(resolution);
    expect(doc.sourceType).toBe("resolution");
    expect(doc.semanticText).toContain("Rebuilt the after-hours routing block");
    expect(doc.contentHash).toBe(resolutionToRetrievalDocument(resolution).contentHash);
    const changed = resolutionToRetrievalDocument({ ...resolution, resolution: "Something else" });
    expect(changed.contentHash).not.toBe(doc.contentHash);
  });

  it("never sends caller details, emails or phone numbers to embeddings", () => {
    const text = safeSemanticText([
      "Caller: Jane Doe",
      "reach her at jane.doe@example.com or 555-867-5309",
      "From: someone",
    ]);
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain("555-867-5309");
    expect(text.toLowerCase()).not.toContain("caller:");
  });

  it("excludes change record before/after blobs from the index", () => {
    const doc = changeRecordToRetrievalDocument({
      id: "c1",
      accountNumber: "999",
      accountName: "Acme",
      title: "Routing update",
      changeType: "routing",
      beforeText: "SECRET BEFORE BLOB",
      afterText: "SECRET AFTER BLOB",
      requester: "someone",
      risk: "low",
      status: "verified",
      rollbackNote: "revert",
      checklist: [],
      ticketNumber: "12345",
      workRef: "",
      testedBy: "",
      notes: "PRIVATE NOTES",
      verifiedAt: null,
      appliedAt: null,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    } as unknown as AccountChangeRecord);
    const all = `${doc.lexicalText} ${doc.semanticText}`;
    expect(all).not.toContain("SECRET BEFORE BLOB");
    expect(all).not.toContain("SECRET AFTER BLOB");
    expect(all).not.toContain("PRIVATE NOTES");
    expect(doc.confidence).toBe("verified");
  });

  it("keeps Freshdesk tickets lexical-only", () => {
    const doc = ticketToSafeRetrievalDocument({
      ticketNumber: "12345",
      subject: "Phones down",
      accountNumber: "999",
    });
    expect(doc.semanticText).toBe("");
  });

  it("chunks long knowledge notes and keeps them referenced to one note", () => {
    const body = "word ".repeat(1200);
    const docs = knowledgeToRetrievalDocuments({
      id: "n1",
      folderId: null,
      title: "Runbook",
      contentHtml: `<p>${body}</p>`,
      noteType: "procedure",
      tags: ["routing"],
      isPinned: false,
      isFavorite: false,
      isArchived: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      attachments: [],
      aiContentHtml: "",
      aiGeneratedAt: null,
      aiSourceFingerprint: "",
      versions: [],
    } as unknown as KnowledgeNote);
    expect(docs.length).toBeGreaterThan(1);
    expect(new Set(docs.map((d) => d.sourceId))).toEqual(new Set(["n1"]));
    expect(new Set(docs.map((d) => d.chunkId)).size).toBe(docs.length);
    expect(docs[0]!.sourceType).toBe("runbook");
  });

  it("chunkText returns nothing for empty content", () => {
    expect(chunkText("   ")).toEqual([]);
    expect(contentHash("a", "b")).toBe(contentHash("a", "b"));
  });
});

describe("embedding provider degradation", () => {
  it("reports a non-retryable failure when no key is configured", async () => {
    const prev = process.env.LOVABLE_API_KEY;
    delete process.env.LOVABLE_API_KEY;
    const res = await lovableEmbeddingProvider.embed(["hello"]);
    if (prev) process.env.LOVABLE_API_KEY = prev;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryable).toBe(false);
  });

  it("a stub provider can stand in for tests", async () => {
    const stub: EmbeddingProvider = {
      model: "stub",
      version: "v1",
      dimensions: 3,
      async embed(inputs) {
        return { ok: true, vectors: inputs.map(() => [0, 0, 1]) };
      },
    };
    const out = await stub.embed(["a", "b"]);
    expect(out.ok && out.vectors).toHaveLength(2);
  });
});

describe("historical resolution handling", () => {
  const opts = { identifiers: parseIdentifiers("printer"), limit: 10, now: NOW };

  it("excludes superseded resolutions when includeHistorical=false", () => {
    const out = fuseCandidates(
      [lex("old", 5, { sourceStatus: "superseded" }), lex("cur", 1)],
      [sem("old", 0.01, { sourceStatus: "superseded" })],
      opts,
    );
    expect(out.map((r) => r.sourceId)).toEqual(["cur"]);
  });

  it("excludes archived resolutions when includeHistorical=false", () => {
    const out = fuseCandidates([lex("arch", 5, { sourceStatus: "archived" })], [], opts);
    expect(out).toHaveLength(0);
  });

  it("semantic similarity cannot resurrect an obsolete resolution", () => {
    const out = fuseCandidates([], [sem("old", 0.0001, { sourceStatus: "superseded" })], opts);
    expect(out).toHaveLength(0);
  });

  it("returns historical resolutions when includeHistorical=true and flags them", () => {
    const out = fuseCandidates(
      [lex("old", 5, { sourceStatus: "superseded" })],
      [],
      { ...opts, includeHistorical: true },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.historical).toBe(true);
    expect(out[0]!.sourceStatus).toBe("superseded");
    expect(out[0]!.matchedBy).toContain("historical");
  });

  it("ranks an active resolution ahead of a comparable historical one", () => {
    const out = fuseCandidates(
      [lex("old", 5, { sourceStatus: "superseded" }), lex("cur", 5)],
      [],
      { ...opts, includeHistorical: true },
    );
    expect(out[0]!.sourceId).toBe("cur");
    expect(out[0]!.historical).toBeUndefined();
    expect(out[1]!.sourceId).toBe("old");
  });

  it("leaves non-resolution source status semantics untouched", () => {
    const out = fuseCandidates(
      [lex("chg", 5, { sourceType: "change_record", sourceStatus: "archived" })],
      [],
      opts,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.historical).toBeUndefined();
  });
});

describe("semantic input boundary", () => {
  it("rejects an arbitrary unsupported source from semantic indexing", () => {
    expect(() =>
      resolveSemanticText({
        sourceType: "freshdesk_ticket",
        sourceId: "123",
        semanticText: "caller said the phone tree is broken",
      }),
    ).toThrow(SemanticBoundaryError);
  });

  it("rejects unapproved text even on an allowed source type", () => {
    expect(() =>
      resolveSemanticText({
        sourceType: "resolution",
        sourceId: "r1",
        semanticText: "arbitrary prompt text",
      }),
    ).toThrow(SemanticBoundaryError);
  });

  it("rejects text mutated after projection", () => {
    const doc = resolutionToRetrievalDocument({
      id: "r1",
      accountNumber: "1001",
      accountName: "Acct",
      problem: "Fax queue stalls",
      rootCause: "Stuck job",
      resolution: "Cleared queue",
      testing: "Sent test fax",
      rollback: "",
      affectedArea: "fax",
      confidence: "verified",
      status: "active",
      source: { ticketId: "555" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    } as unknown as ResolutionMemory);
    expect(() =>
      resolveSemanticText({ ...doc, semanticText: `${doc.semanticText} injected` }),
    ).toThrow(SemanticBoundaryError);
  });

  it("keeps Freshdesk lexical-only", () => {
    const doc = ticketToSafeRetrievalDocument({ ticketNumber: "777", subject: "Phones down" });
    expect(doc.semanticText).toBe("");
    expect(resolveSemanticText(doc)).toBe("");
  });

  it("approved projections still embed normally", () => {
    const doc = resolutionToRetrievalDocument({
      id: "r2",
      accountNumber: "1001",
      accountName: "Acct",
      problem: "Voicemail loops",
      rootCause: "Bad routing",
      resolution: "Fixed routing table",
      testing: "Called in",
      rollback: "",
      affectedArea: "voicemail",
      confidence: "verified",
      status: "active",
      source: { ticketId: "556" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    } as unknown as ResolutionMemory);
    expect(resolveSemanticText(doc)).toContain("Voicemail loops");
  });
});
