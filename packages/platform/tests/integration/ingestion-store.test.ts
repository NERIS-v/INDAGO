import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_NORMALIZATION_CONFIG } from "@indago/contracts";
import type { NormalizedExtraction } from "@indago/contracts";
import { IngestionStore } from "../../src/persistence/ingestion-store.js";
import { deterministicArtifactIdForCase } from "@indago/ingestion";
import type {
  ArtifactWriteRecord,
  AttemptRevision,
} from "../../src/persistence/ingestion-store.js";

// ============================================================================
// I-PR3 IngestionStore — REAL round-trips against TEST_DATABASE_URL.
//
// Purpose: prove the durable persistence boundary (Artifact / IngestionAttempt
// / RawExtraction) end-to-end against a real Postgres instance. Requires
// `TEST_DATABASE_URL` to be set and the schema to be pushed (`pnpm db:push`
// with the test DB). The whole suite skips cleanly when unset.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "I-PR3 IngestionStore integration (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let store: IngestionStore;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const operationId = randomUUID();
    const correlationId = randomUUID();
    const idempotencyKey = `evidence-${investigationId}-a.txt`;

    function contentHashOf(input: string): string {
      return createHash("sha256").update(input, "utf8").digest("hex");
    }

    function makeArtifact(overrides: Partial<ArtifactWriteRecord> = {}): ArtifactWriteRecord {
      return {
        id: randomUUID(),
        contentHash: contentHashOf("fixture-bytes"),
        storagePath: "/tmp/artifacts/ab/abcdef.test",
        detectedMimeType: "text/plain",
        declaredMimeType: "text/plain",
        originalFilename: "a.txt",
        contentSizeBytes: 13,
        sourceType: "UPLOADTHING",
        sourceId: randomUUID(),
        investigationId,
        caseId,
        operationId,
        correlationId,
        idempotencyKey,
        hashVerified: true,
        mimeVerified: true,
        providerMetadata: { fileKey: "a.txt" },
        ...overrides,
      };
    }

    function makeAttempt(status: AttemptRevision["status"], attemptNumber: number): AttemptRevision {
      return {
        investigationId,
        caseId,
        idempotencyKey,
        operationId,
        correlationId,
        attemptNumber,
        status,
        sourceId: undefined,
        artifactId: undefined,
        parserId: undefined,
        parserVersion: undefined,
        format: undefined,
        error: undefined,
      };
    }

    function makeNormalized(attemptId: string, artifactId: string): NormalizedExtraction {
      return {
        attemptId,
        artifactId,
        investigationId,
        caseId,
        normalizerId: "indago-text-canonicalizer",
        normalizerVersion: "1.0.0",
        config: DEFAULT_NORMALIZATION_CONFIG,
        canonicalFields: [
          {
            rawValue: "42",
            normalizedValue: "42",
            type: "integer",
            normalizationStatus: "UNCHANGED",
            confidence: 1,
            sourceReference: { kind: "txt-line", detail: { lineNumber: 1, charStart: 0, charEnd: 2 } },
          },
        ],
        quality: {
          completeness: 1,
          statusCounts: { normalized: 0, unchanged: 1, ambiguous: 0, unparsed: 0, invalid: 0 },
          perFieldConfidence: [1],
          cleanliness: {},
          warnings: { totalCount: 0, byCode: {} },
        },
        lexicalStatistics: {
          tokenCount: 1,
          uniqueTokenCount: 1,
          averageTokenLength: 2,
          topTokens: [{ token: "42", count: 1 }],
          topBigrams: [],
        },
      };
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      store = new IngestionStore(prisma);
      await prisma.normalizedExtraction.deleteMany({});
      await prisma.rawExtraction.deleteMany({});
      await prisma.ingestionAttempt.deleteMany({});
      await prisma.artifact.deleteMany({});
      await prisma.auditEvent.deleteMany({});
      await prisma.agentCheckpoint.deleteMany({});
      await prisma.investigationRun.deleteMany({});
    });

    afterAll(async () => {
      await prisma.normalizedExtraction.deleteMany({});
      await prisma.rawExtraction.deleteMany({});
      await prisma.ingestionAttempt.deleteMany({});
      await prisma.artifact.deleteMany({});
      await prisma.$disconnect();
    });

    it("upserts artifact by (caseId, contentHash) — same case + same hash always resolve to the same row", async () => {
      const first = await store.upsertArtifact(makeArtifact());
      const second = await store.upsertArtifact(
        makeArtifact({ id: randomUUID(), originalFilename: "renamed.txt" }),
      );

      expect(second.id).toBe(first.id);
      expect(
        await prisma.artifact.count({
          where: { caseId, contentHash: first.contentHash! },
        }),
      ).toBe(1);
    });

    it("findArtifactForCase returns the durable row with full provenance", async () => {
      const artifact = await store.upsertArtifact(makeArtifact());
      const found = await store.findArtifactForCase(artifact.caseId, artifact.contentHash!);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(artifact.id);
      expect(found!.storagePath).toBe("/tmp/artifacts/ab/abcdef.test");
      expect(found!.caseId).toBe(caseId);
      expect(found!.investigationId).toBe(investigationId);
      expect(found!.idempotencyKey).toBe(idempotencyKey);
      expect(found!.providerMetadata as unknown).toEqual({ fileKey: "a.txt" });
    });

    it("cross-case isolation — identical bytes under different cases resolve to DIFFERENT rows (dedup stays per case)", async () => {
      const otherCaseId = randomUUID();
      const hash = contentHashOf("shared-bytes");

      const caseA = await store.upsertArtifact(makeArtifact({ id: randomUUID(), contentHash: hash }));
      const caseB = await store.upsertArtifact(
        makeArtifact({ id: randomUUID(), contentHash: hash, caseId: otherCaseId }),
      );

      // Same content, two cases → two durable rows (case-scoped identity),
      // so one case's provenance cannot clobber the other's.
      expect(caseB.id).not.toBe(caseA.id proiektuak
    
      // find is always case-scoped: each case sees exactly its own row.
      expect((await store.findArtifactForCase(caseId, hash))!.id).toBe(caseA.id);
      expect((await store.findArtifactForCase(otherCaseId, hash))!.id).toBe(caseB.id etxek problem identifier `caseId` spans a single enclosing scope at position ...
      expect(
        await prisma.artifact.count({ where: { caseId, contentHash: hash } }),
      ).toBe(1);
      expect(
        await prisma.artifact.count({ where: { caseId: otherCaseId, contentHash: hash } }),
      ).toBe(1);
    });

    it("attempt revisions keep one row per (investigationId, idempotencyKey) and advance attemptNumber", async () => {
      const running = await store.upsertAttempt(makeAttempt("RUNNING", 1));

      const found = await store.findAttempt(investigationId, idempotencyKey);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(running.id);
      expect(found!.status).toBe("RUNNING");
      expect(found!.attemptNumber).toBe(1);

      const afterRetry = await store.upsertAttempt(makeAttempt("SUCCEEDED", 2));
      expect(afterRetry.id).toBe(running.id);
      expect(afterRetry.attemptNumber).toBe(2);
      expect(afterRetry.status).toBe("SUCCEEDED");

      const reloaded = await store.findAttempt(investigationId, idempotencyKey);
      expect(reloaded!.attemptNumber).toBe(2);
      expect(reloaded!.status).toBe("SUCCEEDED");
      expect(
        await prisma.ingestionAttempt.count({
          where: { investigationId, idempotencyKey },
        }),
      ).toBe(1);
    });

    it("distinct idempotencyKeys create distinct attempt rows", async () => {
      await store.upsertAttempt(makeAttempt("RUNNING", 1));
      await store.upsertAttempt({
        ...makeAttempt("RUNNING", 1),
        idempotencyKey: `evidence-${investigationId}-b.txt`,
      });

      expect(
        await prisma.ingestionAttempt.count({ where: { investigationId } }),
      ).toBe(2);
    });

    it("FAILED attempts persist the canonical IngestionError JSON", async () => {
      const failed = await store.upsertAttempt({
        ...makeAttempt("FAILED", 1),
        error: {
          category: "FETCH_FAILED",
          code: "ACQUISITION_FETCH_FAILED",
          message: "network hiccup",
          retryable: true,
          timestamp: new Date().toISOString(),
        },
      });

      const reloaded = await store.findAttempt(investigationId, failed.idempotencyKey!);
      expect(reloaded!.status).toBe("FAILED");
      expect(reloaded!.error as unknown).toEqual({
        category: "FETCH_FAILED",
        code: "ACQUISITION_FETCH_FAILED",
        message: "network hiccup",
        retryable: true,
        timestamp: expect.any(String),
      });
    });

    it("raw extraction round-trips the full JSON with warnings, lossless", async () => {
      const artifact = await store.upsertArtifact(makeArtifact({ id: randomUUID(), contentHash: contentHashOf("rx-bytes-" + Date.now()) }));
      const attempt = await store.upsertAttempt({
        ...makeAttempt("SUCCEEDED", 1),
        artifactId: artifact.id,
        parserId: "txt-parser",
        parserVersion: "1.0.0",
        format: "TXT",
      });

      const extraction = {
        format: "TXT",
        lines: ["line one", "line two"],
        sourceLocations: [
          { line: 1, startOffset: 0, endOffset: 8, text: "line one" },
        ],
        artifactId: artifact.id,
        parserId: "txt-parser",
        parserVersion: "1.0.0",
        extractedAt: new Date().toISOString(),
        warnings: [{ category: "TRUNCATED_OUTPUT", message: "long file", detail: { maxInputLength: 100 } }],
      };

      await store.insertRawExtraction({
        attemptId: attempt.id,
        artifactId: artifact.id,
        parserId: "txt-parser",
        parserVersion: "1.0.0",
        format: "TXT",
        extraction,
        warnings: extraction.warnings,
        extractedAt: extraction.extractedAt,
      });

      const found = await store.findRawExtractionByAttempt(attempt.id);
      expect(found).not.toBeNull();
      expect(found!.parserId).toBe("txt-parser");
      expect(found!.format).toBe("TXT");
      expect(found!.extraction as unknown).toEqual({ ...extraction, warnings: undefined });
      // warnings column round-trips separately
      expect((found!.warnings as unknown)).toEqual([
        { category: "TRUNCATED_OUTPUT", message: "long file", detail: { maxInputLength: 100 } },
      ]);
      expect(found!.extractedAt.toISOString()).toBe(extraction.extractedAt);

      // Immutability: attemptId is unique → second insert for same attempt must fail
      await expect(
        store.insertRawExtraction({
          attemptId: attempt.id,
          artifactId: artifact.id,
          parserId: "txt-parser",
          parserVersion: "1.0.0",
          format: "TXT",
          extraction: { format: "TXT" },
          warnings: undefined,
          extractedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow();
    });

    it("M-A05: upsertNormalizedExtractionByAttempt writes one row per attempt and is idempotent", async () => {
      const artifact = await store.upsertArtifact(
        makeArtifact({ id: randomUUID(), contentHash: contentHashOf(`ne-${Date.now()}`) }),
      );
      const attempt = await store.upsertAttempt({
        ...makeAttempt("SUCCEEDED", 1),
        artifactId: artifact.id,
        parserId: "txt-parser",
        parserVersion: "1.0.0",
        format: "TXT",
      });

      const written = await store.upsertNormalizedExtractionByAttempt(
        makeNormalized(attempt.id, artifact.id),
      );
      expect(written.attemptId).toBe(attempt.id);
      expect(written.normalizerId).toBe("indago-text-canonicalizer");

      // Idempotent repeat with different content → existing row returned unchanged.
      const again = await store.upsertNormalizedExtractionByAttempt(
        makeNormalized(attempt.id, artifact.id),
      );
      expect(again.id).toBe(written.id);
      expect(
        await prisma.normalizedExtraction.count({ where: { attemptId: attempt.id } }),
      ).toBe(1);
    });

    it("M-A05: concurrent upserts on the same attempt (P2002 race) collapse to one row", async () => {
      const artifact = await store.upsertArtifact(
        makeArtifact({ id: randomUUID(), contentHash: contentHashOf(`race-${Date.now()}`) }),
      );
      const attempt = await store.upsertAttempt({
        ...makeAttempt("SUCCEEDED", 1),
        idempotencyKey: `evidence-${investigationId}-race.txt`,
        artifactId: artifact.id,
      });

      const [a, b] = await Promise.all([
        store.upsertNormalizedExtractionByAttempt(makeNormalized(attempt.id, artifact.id)),
        store.upsertNormalizedExtractionByAttempt(makeNormalized(attempt.id, artifact.id)),
      ]);
      expect(a.attemptId).toBe(attempt.id);
      expect(b.attemptId).toBe(attempt.id);
      expect(
        await prisma.normalizedExtraction.count({ where: { attemptId: attempt.id } }),
      ).toBe(1);
    });

    it("M-A05: findNormalizedExtractionByAttempt returns the durable row or null", async () => {
      const artifact = await store.upsertArtifact(
        makeArtifact({ id: randomUUID(), contentHash: contentHashOf(`find-${Date.now()}`) }),
      );
      const attempt = await store.upsertAttempt({
        ...makeAttempt("SUCCEEDED", 1),
        idempotencyKey: `evidence-${investigationId}-find.txt`,
        artifactId: artifact.id,
      });
      await store.upsertNormalizedExtractionByAttempt(makeNormalized(attempt.id, artifact.id));

      const found = await store.findNormalizedExtractionByAttempt(attempt.id);
      expect(found).not.toBeNull();
      expect(found!.attemptId).toBe(attempt.id);
      expect((found!.canonicalFields as Array<{ rawValue: string }>)[0]!.rawValue).toBe("42");

      expect(await store.findNormalizedExtractionByAttempt(randomUUID())).toBeNull();
    });

    it("M-A05: listRawExtractions filters by investigationId, caseId, artifactId and format", async () => {
      const artifact = await store.upsertArtifact(
        makeArtifact({ id: randomUUID(), contentHash: contentHashOf(`list-${Date.now()}`) }),
      );
      const attempt = await store.upsertAttempt({
        ...makeAttempt("SUCCEEDED", 1),
        idempotencyKey: `evidence-${investigationId}-list.txt`,
        artifactId: artifact.id,
        format: "TXT",
        parserId: "txt-parser",
        parserVersion: "1.0.0",
      });
      const extraction = {
        format: "TXT",
        lines: ["ledger", "balance 42000.00"],
      };
      await store.insertRawExtraction({
        attemptId: attempt.id,
        artifactId: artifact.id,
        parserId: "txt-parser",
        parserVersion: "1.0.0",
        format: "TXT",
        extraction,
        warnings: undefined,
        extractedAt: new Date().toISOString(),
      });

      const byAll = await store.listRawExtractions({
        investigationId,
        caseId,
        artifactId: artifact.id,
        format: "TXT",
      });
      expect(byAll.map((r) => r.attemptId)).toContain(attempt.id);

      const byForeignInvestigation = await store.listRawExtractions({
        investigationId: randomUUID(),
      });
      expect(byForeignInvestigation.some((r) => r.attemptId === attempt.id)).toBe(false);

      const byWrongFormat = await store.listRawExtractions({ format: "PDF" });
      expect(byWrongFormat.some((r) => r.attemptId === attempt.id)).toBe(false);
    });
  },
);