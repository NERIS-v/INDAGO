import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { IngestionStore } from "../../src/persistence/ingestion-store.js";
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

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      store = new IngestionStore(prisma);
      await prisma.rawExtraction.deleteMany({});
      await prisma.ingestionAttempt.deleteMany({});
      await prisma.artifact.deleteMany({});
      await prisma.auditEvent.deleteMany({});
      await prisma.agentCheckpoint.deleteMany({});
      await prisma.investigationRun.deleteMany({});
    });

    afterAll(async () => {
      await prisma.rawExtraction.deleteMany({});
      await prisma.ingestionAttempt.deleteMany({});
      await prisma.artifact.deleteMany({});
      await prisma.$disconnect();
    });

    it("upserts artifact by contentHash — same hash always resolves to the same row", async () => {
      const first = await store.upsertArtifact(makeArtifact());
      const second = await store.upsertArtifact(
        makeArtifact({ id: randomUUID(), originalFilename: "renamed.txt" }),
      );

      expect(second.id).toBe(first.id);
      expect(
        await prisma.artifact.count({
          where: { contentHash: first.contentHash! },
        }),
      ).toBe(1);
    });

    it("findArtifactByContentHash returns the durable row with full provenance", async () => {
      const artifact = await store.upsertArtifact(makeArtifact());
      const found = await store.findArtifactByContentHash(artifact.contentHash!);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(artifact.id);
      expect(found!.storagePath).toBe("/tmp/artifacts/ab/abcdef.test");
      expect(found!.caseId).toBe(caseId);
      expect(found!.investigationId).toBe(investigationId);
      expect(found!.idempotencyKey).toBe(idempotencyKey);
      expect(found!.providerMetadata as unknown).toEqual({ fileKey: "a.txt" });
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
  },
);