import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import type { IngestionJobPayload } from "@indago/contracts";

// ============================================================================
// E2E: evidence POST → queue worker → durable persistence (real everything).
//
// Vertical slice through the REAL backend module graph — no mocks:
//   - real local HTTP fixture server               (as UploadThing CDN stand-in)
//   - real HttpArtifactFetcher + ArtifactAcquisitionService
//   - real FilesystemArtifactStorage               (content-addressed)
//   - real ExtractionService + default parser registry
//   - real Prisma (IngestionStore) against TEST_DATABASE_URL
//   - real transitions / audit / progress emission
//
// Environment plumbing MUST happen before importing the worker modules:
// the singleton db/store read env at module evaluation.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const describeOrSkip = TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip("E2E: POST → ingest-evidence → durable persistence", () => {
  // Single shared test run so the singleton db binds once to the test DB.
  let prisma: PrismaClient;
  let server: Server;
  let baseUrl: string;
  let artifactsDir: string;

  const investigationId = randomUUID();
  const caseId = randomUUID();
  const fixtureBytes = Buffer.from("REPORT: balance 42000.00; status: under-review\n", "utf8");

  function contentHash(): string {
    return createHash("sha256").update(fixtureBytes).digest("hex");
  }

  function makePayload(overrides: Partial<IngestionJobPayload> = {}): IngestionJobPayload {
    return {
      investigationId,
      caseId,
      artifactReference: {
        url: `${baseUrl}/fixture.txt`,
        originalFilename: "fixture.txt",
        declaredMimeType: "text/plain",
        declaredSizeBytes: fixtureBytes.length,
        declaredContentHash: contentHash(),
        sourceType: "UPLOADTHING",
        providerMetadata: { fileKey: "fixture.txt" },
      },
      idempotencyKey: `evidence-${investigationId}-fixture.txt`,
      correlationId: randomUUID(),
      operationId: randomUUID(),
      sourceName: "E2E Integration Test",
      sourceCatalog: "INTEL",
      evidenceType: "COMMUNICATION",
      evidenceTitle: "Monthly Ledger",
      ...overrides,
    };
  }

  function makeJob(overrides: Partial<{ data: IngestionJobPayload; attemptsMade: number }> = {}): Job {
    return {
      id: randomUUID(),
      name: "ingest-evidence",
      data: makePayload(overrides.data ?? {}),
      attemptsMade: overrides.attemptsMade ?? 0,
      opts: { attempts: 3 },
      stacktrace: [],
      returnvalue: undefined,
      timestamp: Date.now(),
    } as unknown as Job;
  }

  beforeAll(async () => {
    // Set environment BEFORE the queue modules are imported.
    process.env.DATABASE_URL = TEST_DATABASE_URL!;

    // TEST-ONLY fetch-policy escape hatches (mirrors real-stack beforeAll):
    // this suite exercises the real HttpArtifactFetcher against a local
    // http://127.0.0.1 fixture server. The production default policy stays
    // strict (https-only, public hosts) — nothing in a real deployment sets
    // these.
    process.env.ARTIFACT_ALLOW_HTTP = "true";
    process.env.ARTIFACT_ALLOW_PRIVATE_HOSTS = "true";

    artifactsDir = await mkdtemp(join(tmpdir(), "indago-e2e-artifacts-"));
    process.env.ARTIFACT_STORAGE_DIR = artifactsDir;

    prisma = new PrismaClient();
    await prisma.rawExtraction.deleteMany({});
    await prisma.ingestionAttempt.deleteMany({});
    await prisma.artifact.deleteMany({});
    await prisma.auditEvent.deleteMany({});
    await prisma.agentCheckpoint.deleteMany({});
    await prisma.investigationRun.deleteMany({});

    server = createServer((req, res) => {
      if (req.url === "/fixture.txt" && req.method === "GET") {
        res.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "content-length": String(fixtureBytes.length),
        });
        res.end(fixtureBytes);
      } else {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    server?.close();
    await prisma.rawExtraction.deleteMany({});
    await prisma.ingestionAttempt.deleteMany({});
    await prisma.artifact.deleteMany({});
    await prisma.auditEvent.deleteMany({});
    await prisma.agentCheckpoint.deleteMany({});
    await prisma.investigationRun.deleteMany({});
    await prisma.$disconnect();
    await rm(artifactsDir, { recursive: true, force: true });
  });

  it("creates the run and asserts a real worker exists", async () => {
    const run = await prisma.investigationRun.create({
      data: {
        investigationId,
        caseId,
        state: "CREATED",
        status: "QUEUED",
        contextData: {},
      },
    });

    const { handleIngestEvidenceJob } = await import("../../src/queue/ingest-evidence.js");
    expect(typeof handleIngestEvidenceJob).toBe("function");

    await handleIngestEvidenceJob(makeJob());
    const reloaded = await prisma.investigationRun.findUnique({ where: { id: run.id } });
    expect(reloaded!.state).toBe("ANALYZING");
    expect(reloaded!.status).toBe("RUNNING");
  });

  it("persists a real artifact with correct content hash, caseId and storage file", async () => {
    const artifact = await prisma.artifact.findFirst({
      where: { contentHash: contentHash() },
    });

    expect(artifact).not.toBeNull();
    expect(artifact!.caseId).toBe(caseId);
    expect(artifact!.investigationId).toBe(investigationId);
    expect(artifact!.detectedMimeType).toBe("text/plain");
    expect(artifact!.hashVerified).toBe(true);
    expect(artifact!.sourceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // Durable on-disk bytes must equal the fixture exactly.
    const onDisk = await readFile(artifact!.storagePath);
    expect(Buffer.from(onDisk).equals(fixtureBytes)).toBe(true);
  });

  it("persists a SUCCEEDED ingestion attempt with parser provenance", async () => {
    const attempt = await prisma.ingestionAttempt.findUnique({
      where: {
        investigationId_idempotencyKey: {
          investigationId,
          idempotencyKey: `evidence-${investigationId}-fixture.txt`,
        },
      },
    });

    expect(attempt).not.toBeNull();
    expect(attempt!.status).toBe("SUCCEEDED");
    expect(attempt!.attemptNumber).toBe(1);
    expect(attempt!.parserId).not.toBeNull();
    expect(attempt!.format).toBe("TXT");
    expect(attempt!.artifactId).toBeDefined();
  });

  it("persists the immutable RawExtraction with real extraction output", async () => {
    const attempt = await prisma.ingestionAttempt.findUnique({
      where: {
        investigationId_idempotencyKey: {
          investigationId,
          idempotencyKey: `evidence-${investigationId}-fixture.txt`,
        },
      },
    });

    const raw = await prisma.rawExtraction.findUnique({
      where: { attemptId: attempt!.id },
    });

    expect(raw).not.toBeNull();
    expect(raw!.format).toBe("TXT");
    expect(raw!.parserId).toBe(attempt!.parserId);
    expect(raw!.extraction).not.toBeNull();
    // Real extraction carries extracted content, not a stub.
    const extractionText = JSON.stringify(raw!.extraction);
    expect(extractionText.length).toBeGreaterThan(10);
    expect(raw!.extractedAt).toBeInstanceOf(Date);
  });

  it("creates checkpoint rows for each lifecycle transition and audits the trail", async () => {
    const audit = await prisma.auditEvent.findFirst({
      where: { investigationId, action: "EVIDENCE_INGESTED" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actor).toBe("INGESTION_PIPELINE");
    expect(audit!.description).toContain("Durably ingested");

    const stored = await prisma.auditEvent.findFirst({
      where: { investigationId, action: "NORMALIZATION_STORED" },
    });
    expect(stored).not.toBeNull();
    expect(stored!.actor).toBe("NORMALIZATION_PIPELINE");

    const completed = await prisma.auditEvent.findFirst({
      where: { investigationId, action: "NORMALIZATION_COMPLETED" },
    });
    expect(completed).not.toBeNull();
    expect(completed!.description).toContain("ANALYZING");

    const transitions = await prisma.auditEvent.findMany({
      where: { investigationId, action: "SYSTEM_ACTION", actor: "ORCHESTRATOR" },
    });
    // CREATED → INGESTING, INGESTING → NORMALIZING, NORMALIZING → ANALYZING
    expect(transitions.length).toBe(3);

    const checkpoints = await prisma.agentCheckpoint.count();
    expect(checkpoints).toBe(3);
  });

  it("persists the real NormalizedExtraction with canonical output and quality metadata", async () => {
    const attempt = await prisma.ingestionAttempt.findUnique({
      where: {
        investigationId_idempotencyKey: {
          investigationId,
          idempotencyKey: `evidence-${investigationId}-fixture.txt`,
        },
      },
    });

    const normalized = await prisma.normalizedExtraction.findUnique({
      where: { attemptId: attempt!.id },
    });

    expect(normalized).not.toBeNull();
    expect(normalized!.normalizerId).toBe("indago-text-canonicalizer");
    expect(normalized!.normalizerVersion).toBe("1.0.0");
    expect(normalized!.artifactId).toBe(attempt!.artifactId);
    expect(normalized!.investigationId).toBe(investigationId);
    expect(normalized!.caseId).toBe(caseId);

    const fields = normalized!.canonicalFields as Array<{ rawValue: string; normalizationStatus: string }>;
    // The fixture is a real TXT with content — the engine must produce fields.
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      expect(f.normalizationStatus).toMatch(/^(NORMALIZED|UNCHANGED|AMBIGUOUS|UNPARSED|INVALID)$/);
      expect(f.rawValue.length).toBeGreaterThan(0);
    }

    const quality = normalized!.quality as { completeness: number };
    expect(quality.completeness).toBeGreaterThanOrEqual(0);
    expect(quality.completeness).toBeLessThanOrEqual(1);

    const lexical = normalized!.lexicalStatistics as { tokenCount?: number };
    expect((lexical.tokenCount ?? 0)).toBeGreaterThan(0);
  });

  it("content-addressed dedup: identical bytes via another job → same artifact row", async () => {
    const { handleIngestEvidenceJob } = await import("../../src/queue/ingest-evidence.js");

    // Different logical evidence submission, SAME bytes (second fixture url),
    // distinct idempotencyKey. The artifact must dedupe to one row.
    const secondIdemKey = `evidence-${investigationId}-dup.txt`;
    await handleIngestEvidenceJob(
      makeJob({
        data: {
          ...makePayload({
            artifactReference: {
              url: `${baseUrl}/fixture.txt`,
              originalFilename: "dup.txt",
              declaredMimeType: "text/plain",
              declaredSizeBytes: fixtureBytes.length,
              declaredContentHash: contentHash(),
              sourceType: "UPLOADTHING",
              providerMetadata: { fileKey: "dup.txt" },
            },
            idempotencyKey: secondIdemKey,
          }),
        },
      }),
    );

    const artifacts = await prisma.artifact.findMany({
      where: { contentHash: contentHash() },
    });
    expect(artifacts.length).toBe(1);

    const attempts = await prisma.ingestionAttempt.count({
      where: { idempotencyKey: secondIdemKey },
    });
    expect(attempts).toBe(1);
  });

  it("rejects a caseId mismatch through the real worker — no artifact, run untouched", async () => {
    const before = await prisma.agentCheckpoint.count();

    const { handleIngestEvidenceJob } = await import("../../src/queue/ingest-evidence.js");
    await expect(
      handleIngestEvidenceJob(
        makeJob({ data: { ...makePayload(), caseId: "550e8400-e29b-41d4-a716-44665544ffff" } }),
      ),
    ).rejects.toThrow("CASE_ID_MISMATCH");

    const artifacts = await prisma.artifact.count({ where: { investigationId } });
    expect(artifacts).toBe(1); // only the fixture artifacts — none for the mismatch job
    expect(await prisma.agentCheckpoint.count()).toBe(before);
  });
});