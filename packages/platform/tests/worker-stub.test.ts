import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { IngestionJobPayloadSchema } from "@indago/contracts";

// ============================================================================
// Worker Stub Tests — Durable Ingest-Evidence Flow
//
// Verifies the canonical worker flow end to end across mocks:
//   validate → resolve run → attempt RUNNING → INGESTING →
//   acquire → persist artifact → extract → persist RawExtraction →
//   attempt SUCCEEDED → NORMALIZING → audit EVIDENCE_INGESTED (only after
//   persistence) → normalize → persist NormalizedExtraction →
//   NORMALIZATION_STORED → ANALYZING → NORMALIZATION_COMPLETED (M-A05).
//   Retryable vs permanent failure semantics + case identity + idempotent
//   re-entrant completion.
// ============================================================================

// ============================================================================
// Mocks
// ============================================================================

const VALID_INV_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_CORR_ID = "660e8400-e29b-41d4-a716-446655440001";
const VALID_CASE_ID = "550e8400-e29b-41d4-a716-446655440010";
const VALID_CASE_ID_2 = "550e8400-e29b-41d4-a716-446655440011";
const VALID_OP_ID = "770e8400-e29b-41d4-a716-446655440002";
const VALID_SOURCE_ID = "880e8400-e29b-41d4-a716-446655440003";
const VALID_ARTIFACT_ID = "a00e8400-e29b-41d4-a716-446655440004";

// Hoisted module mocks — accessible inside vi.mock factories (hoisting-safe).
const h = vi.hoisted(() => {
  const acquire = vi.fn();
  const extract = vi.fn();
  const deterministicSourceId = vi.fn();
  const normalize = vi.fn();
  const parseStoredRawExtraction = vi.fn();
  // M-A06 observation pipeline stubs (called by completeMA06).
  const computeContentHash = vi.fn();
  const bytesToUuid4 = vi.fn();
  const extractObservations = vi.fn();
  const finalizeObservation = vi.fn();
  const buildObservationIdentityKey = vi.fn();
  // M-A08 blocking stubs (completeMA08).
  const blockCandidates = vi.fn();
  const finalizeCandidatePair = vi.fn();
  const buildCandidatePairIdentityKey = vi.fn();
  return {
    acquire,
    extract,
    deterministicSourceId,
    normalize,
    parseStoredRawExtraction,
    computeContentHash,
    bytesToUuid4,
    extractObservations,
    finalizeObservation,
    buildObservationIdentityKey,
    blockCandidates,
    finalizeCandidatePair,
    buildCandidatePairIdentityKey,
  };
});

/** Loose shape of the mocked Prisma `db` object. */
type MockedDb = {
  investigationRun: {
    findFirst: Mock;
    findUniqueOrThrow: Mock;
    update: Mock;
  };
  agentCheckpoint: { count: Mock; create: Mock };
  artifact: { upsert: Mock; findUnique: Mock };
  ingestionAttempt: { upsert: Mock; findUnique: Mock };
  rawExtraction: { create: Mock; findUnique: Mock };
  normalizedExtraction: { findUnique: Mock; create: Mock };
  // M-A07 stores.
  entityMentionCandidate: { findMany: Mock; count: Mock; createMany: Mock };
  // M-A08 stores.
  candidatePair: { count: Mock; createMany: Mock; findMany: Mock };
};

interface FakeJob {
  name: string;
  id: string;
  data: unknown;
  attemptsMade: number;
  opts: { attempts: number };
}

let capturedHandler:
  | ((job: FakeJob) => Promise<unknown>)
  | null = null;

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock("../src/db/prisma.js", () => ({
  db: {
    investigationRun: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    agentCheckpoint: { count: vi.fn(), create: vi.fn() },
    artifact: { upsert: vi.fn(), findUnique: vi.fn() },
    ingestionAttempt: { upsert: vi.fn(), findUnique: vi.fn() },
    rawExtraction: { create: vi.fn(), findUnique: vi.fn() },
    normalizedExtraction: { findUnique: vi.fn(), create: vi.fn() },
    // M-A06 stores. Defaults keep MA06 a no-op (0 observations durable): the
    // existing MA05 completion tests must run through ANALYZING unchanged.
    source: { upsert: vi.fn().mockResolvedValue({ id: "src-1", catalog: "INTEL" }) },
    evidence: { upsert: vi.fn().mockResolvedValue({ id: "ev-1" }) },
    observation: {
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    // M-A07 stores. Defaults keep MA07 a no-op (0 candidates durable).
    entityMentionCandidate: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // M-A08 stores. Defaults keep MA08 a no-op (< 2 candidates in the case).
    candidatePair: {
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../src/audit/logger.js", () => ({
  logAuditEvent: vi.fn().mockResolvedValue({ id: "audit-123" }),
}));

vi.mock("../src/realtime/sse.js", () => ({
  realtimeEvents: { emit: vi.fn() },
  emitProgressEvent: vi.fn(),
}));

vi.mock("@indago/ingestion", () => ({
  ArtifactAcquisitionService: vi.fn().mockImplementation(() => ({ acquire: h.acquire })),
  ExtractionService: vi.fn().mockImplementation(() => ({ extract: h.extract })),
  HttpArtifactFetcher: class {},
  FilesystemArtifactStorage: class {},
  createDefaultParserRegistry: vi.fn(),
  createTesseractOcrProvider: vi.fn(),
  deterministicSourceId: h.deterministicSourceId,
  NormalizationService: vi.fn().mockImplementation(() => ({ normalize: h.normalize })),
  parseStoredRawExtraction: h.parseStoredRawExtraction,
  NORMALIZER_ID: "indago-text-canonicalizer",
  NORMALIZER_VERSION: "1.0.0",
  // M-A06 pipeline exports (completeMA06 imports all of these). Defaults keep
  // the extraction a safe no-op so MA05 completion tests are unaffected.
  computeContentHash: h.computeContentHash.mockResolvedValue("ab".repeat(32)),
  bytesToUuid4: h.bytesToUuid4.mockReturnValue("550e8400-e29b-41d4-a716-446655440000"),
  extractObservations: h.extractObservations.mockResolvedValue({
    observations: [],
    warnings: [],
  }),
  finalizeObservation: h.finalizeObservation.mockResolvedValue({ id: "obs-1" }),
  buildObservationIdentityKey: h.buildObservationIdentityKey.mockReturnValue("obs-identity-1"),
  // M-A08 blocking exports (completeMA08 imports these; defaults no-op).
  blockCandidates: h.blockCandidates.mockReturnValue({ drafts: [], metrics: null }),
  finalizeCandidatePair: h.finalizeCandidatePair.mockResolvedValue({ id: "pair-1" }),
  buildCandidatePairIdentityKey: h.buildCandidatePairIdentityKey.mockReturnValue("pair-identity-1"),
}));

vi.mock("../src/security/grounding.js", () => ({
  validateClaim: vi.fn(),
  ClaimGroundingError: class ClaimGroundingError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ClaimGroundingError";
    }
  },
}));

vi.mock("bullmq", async () => {
  return {
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
    })),
    Worker: vi.fn().mockImplementation((_name: string, handler: unknown) => {
      capturedHandler = handler as typeof capturedHandler;
      return { on: vi.fn() };
    }),
    UnrecoverableError: class UnrecoverableError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "UnrecoverableError";
      }
    },
  };
});

// Import after mocks — triggers the Worker constructor which captures the handler.
await import("../src/queue/orchestrator.js");

// Import mocked modules to configure behavior per-test.
const db = (await import("../src/db/prisma.js")).db as unknown as MockedDb;
const audit = await import("../src/audit/logger.js");
const logAuditEvent = audit.logAuditEvent as unknown as Mock;
const sse = await import("../src/realtime/sse.js");
const emitProgressEvent = sse.emitProgressEvent as unknown as Mock;

const runState = {
  id: "run-1",
  investigationId: VALID_INV_ID,
  caseId: VALID_CASE_ID,
  state: "CREATED",
  status: "QUEUED",
  contextData: {} as Record<string, unknown>,
};

function makeValidPayload() {
  return {
    investigationId: VALID_INV_ID,
    caseId: VALID_CASE_ID,
    artifactReference: {
      url: "https://utfs.io/f/test.txt",
      originalFilename: "note.txt",
      declaredMimeType: "text/plain",
      declaredSizeBytes: 11,
      sourceType: "UPLOADTHING",
      providerMetadata: { fileKey: "test.txt" },
    },
    idempotencyKey: `evidence-${VALID_INV_ID}-test.txt`,
    correlationId: VALID_CORR_ID,
    operationId: VALID_OP_ID,
    sourceName: "Test Source",
    sourceCatalog: "INTEL",
    evidenceType: "COMMUNICATION",
    evidenceTitle: "Test Evidence",
  };
}

function makeFakeJob(overrides: Partial<FakeJob> = {}): FakeJob {
  return {
    name: "ingest-evidence",
    id: "job-001",
    data: makeValidPayload(),
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  };
}

const TXT_EXTRACTION = {
  format: "TXT",
  extractionMethod: "text-decode",
  lines: [],
  artifactId: VALID_ARTIFACT_ID,
  parserId: "txt-parser",
  parserVersion: "1.0.0",
  extractedAt: new Date().toISOString(),
  warnings: [],
};

const VALID_NORMALIZED = {
  attemptId: "attempt-1",
  artifactId: VALID_ARTIFACT_ID,
  investigationId: VALID_INV_ID,
  caseId: VALID_CASE_ID,
  normalizerId: "indago-text-canonicalizer",
  normalizerVersion: "1.0.0",
  config: {},
  canonicalFields: [],
  quality: {},
  lexicalStatistics: {},
};

/**
 * Schema-valid STORED normalized row (mirrors the full column set that
 * upsertNormalizedExtractionByAttempt persists) used when a re-entry must
 * REHYDRATE an already-durable NormalizedExtraction. Every field must satisfy
 * NormalizedExtractionSchema — the worker rehydrates via schema.parse.
 */
function makeStoredNormalizedRow() {
  return {
    id: "ne-1",
    attemptId: "attempt-1",
    artifactId: VALID_ARTIFACT_ID,
    investigationId: VALID_INV_ID,
    caseId: VALID_CASE_ID,
    normalizerId: "indago-text-canonicalizer",
    normalizerVersion: "1.0.0",
    config: {
      policyVersion: "indago-normalization-policy@1",
      datePolicyVersion: "date-policy@1",
      numberPolicyVersion: "number-policy@1",
      unicodePolicyVersion: "unicode-policy@1",
      tokenHints: {
        maxTokens: 100000,
        maxUniqueTokens: 50000,
        maxTopTokens: 20,
        maxTopBigrams: 20,
        maxTokenLength: 128,
      },
      bounds: { maxFields: 5000, maxFieldLength: 100000 },
    },
    canonicalFields: [],
    quality: {
      completeness: 1,
      statusCounts: {
        normalized: 0,
        unchanged: 0,
        ambiguous: 0,
        unparsed: 0,
        invalid: 0,
      },
      perFieldConfidence: [],
      cleanliness: {},
      warnings: { totalCount: 0, byCode: {} },
    },
    lexicalStatistics: {
      tokenCount: 0,
      uniqueTokenCount: 0,
      averageTokenLength: 0,
      topTokens: [],
      topBigrams: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  runState.state = "CREATED";
  runState.status = "QUEUED";

  db.investigationRun.findFirst.mockResolvedValue(runState);
  db.investigationRun.findUniqueOrThrow.mockImplementation(async () => runState);
  db.investigationRun.update.mockImplementation(async (args: { data?: Record<string, unknown> }) => {
    const data = args.data ?? {};
    if (typeof data.state === "string") runState.state = data.state;
    if (typeof data.status === "string") runState.status = data.status;
    if (typeof data.error === "string") runState.error = data.error;
    return runState;
  });
  db.agentCheckpoint.count.mockResolvedValue(0);
  db.agentCheckpoint.create.mockResolvedValue({ id: "cp-1" });
  db.artifact.upsert.mockResolvedValue({
    id: VALID_ARTIFACT_ID,
    contentHash: "a".repeat(64),
  });
  db.ingestionAttempt.upsert.mockResolvedValue({ id: "attempt-1" });
  db.rawExtraction.create.mockResolvedValue({ id: "rx-1" });
  // No pre-existing extraction on the happy path.
  db.rawExtraction.findUnique.mockResolvedValue(null);
  // No pre-existing normalized output on the happy path.
  db.normalizedExtraction.findUnique.mockResolvedValue(null);
  db.normalizedExtraction.create.mockResolvedValue({ id: "ne-1" });

  h.acquire.mockResolvedValue({
    ok: true,
    artifact: {
      artifactId: VALID_ARTIFACT_ID,
      storagePath: `${VALID_ARTIFACT_ID}-storage`,
      contentHash: "a".repeat(64),
      contentSizeBytes: 11,
      detectedMimeType: "text/plain",
      declaredMimeType: undefined,
      originalFilename: "note.txt",
      hashVerified: false,
      mimeVerified: false,
      ingestionTime: new Date().toISOString(),
      providerMetadata: { fileKey: "test.txt" },
    },
  });
  h.extract.mockResolvedValue({ ok: true, extraction: TXT_EXTRACTION });
  h.deterministicSourceId.mockResolvedValue(VALID_SOURCE_ID);
  h.normalize.mockReturnValue(VALID_NORMALIZED);
  h.parseStoredRawExtraction.mockImplementation(() => TXT_EXTRACTION);
});

describe("I-PR2 Worker Stub: durable ingest-evidence", () => {
  it("handler was captured from Worker constructor", () => {
    expect(capturedHandler).not.toBeNull();
  });

  it("validates the payload schema the worker expects (strict)", async () => {
    const result = IngestionJobPayloadSchema.safeParse(makeValidPayload());
    expect(result.success).toBe(true);

    const strict = IngestionJobPayloadSchema.safeParse({
      ...makeValidPayload(),
      hackerField: "inject",
    });
    expect(strict.success).toBe(false);
  });

  it("establishes a RUNNING attempt, transitions to INGESTING on start", async () => {
    await capturedHandler!(makeFakeJob());

    expect(db.investigationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { investigationId: VALID_INV_ID } }),
    );
    expect(db.ingestionAttempt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "RUNNING",
          attemptNumber: 1,
          idempotencyKey: `evidence-${VALID_INV_ID}-test.txt`,
        }),
      }),
    );

    const runUpdates = db.investigationRun.update.mock.calls;
    const ingesting = runUpdates.find((c) => c[0]?.data?.state === "INGESTING");
    expect(ingesting).toBeDefined();
    expect(db.ingestionAttempt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ attemptNumber: 1 }) }),
    );
  });

  it("persists artifact + raw extraction, marks attempt SUCCEEDED, normalizes, and completes to ANALYZING", async () => {
    await capturedHandler!(makeFakeJob());

    expect(db.artifact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          id: VALID_ARTIFACT_ID,
          contentHash: "a".repeat(64),
          caseId: VALID_CASE_ID,
          investigationId: VALID_INV_ID,
        }),
      }),
    );

    expect(db.ingestionAttempt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "SUCCEEDED",
          artifactId: VALID_ARTIFACT_ID,
          parserId: "txt-parser",
          format: "TXT",
        }),
      }),
    );

    expect(db.rawExtraction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptId: "attempt-1",
          artifactId: VALID_ARTIFACT_ID,
          format: "TXT",
        }),
      }),
    );

    const norm = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "NORMALIZING",
    );
    expect(norm).toBeDefined();

    // ---- M-A05 normalization completion
    expect(h.normalize).toHaveBeenCalledWith(
      TXT_EXTRACTION,
      expect.objectContaining({
        attemptId: "attempt-1",
        investigationId: VALID_INV_ID,
        caseId: VALID_CASE_ID,
      }),
    );
    expect(db.normalizedExtraction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptId: "attempt-1",
          artifactId: VALID_ARTIFACT_ID,
        }),
      }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "NORMALIZATION_STORED", targetId: VALID_ARTIFACT_ID }),
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "NORMALIZATION_COMPLETED", targetId: VALID_ARTIFACT_ID }),
    );

    const analyzing = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "ANALYZING",
    );
    expect(analyzing).toBeDefined();
    expect(runState.state).toBe("ANALYZING");
  });

  it("§4: progress state mirrors DB — NORMALIZING/ANALYZING frames emitted only after RawExtraction persisted", async () => {
    await capturedHandler!(makeFakeJob());

    const calls = emitProgressEvent.mock.calls as unknown as [string, string, string][];
    const stateOf = (i: number) => calls[i]?.[1];

    // "Classifying & extracting content …" happens while the run is still
    // INGESTING (the DB transition to NORMALIZING occurs after persistence).
    const classifyIdx = calls.findIndex((c, _idx) => String(c[2]).startsWith("Classifying"));
    expect(classifyIdx).toBeGreaterThanOrEqual(0);
    expect(stateOf(classifyIdx)).toBe("INGESTING");

    // The first NORMALIZING frame may only fire after the extraction row exists.
    const firstNorm = calls.findIndex((_, idx) => stateOf(idx) === "NORMALIZING");
    expect(firstNorm).toBeGreaterThanOrEqual(0);
    const rxOrder = db.rawExtraction.create.mock.invocationCallOrder[0] ?? 0;
    const normOrder = emitProgressEvent.mock.invocationCallOrder[firstNorm] ?? 0;
    expect(normOrder).toBeGreaterThan(rxOrder);

    // The ANALYZING (normalization-complete) frame must only fire after the
    // normalized row was persisted.
    const firstAnalyzing = calls.findIndex((_, idx) => stateOf(idx) === "ANALYZING");
    expect(firstAnalyzing).toBeGreaterThanOrEqual(0);
    const neOrder = db.normalizedExtraction.create.mock.invocationCallOrder[0] ?? 0;
    const analyzingOrder = emitProgressEvent.mock.invocationCallOrder[firstAnalyzing] ?? 0;
    expect(analyzingOrder).toBeGreaterThan(neOrder);
  });

  it("audits EVIDENCE_INGESTED ONLY after artifact + raw extraction are persisted", async () => {
    await capturedHandler!(makeFakeJob());

    const allCalls = logAuditEvent.mock.calls;
    const ingestedIdx = allCalls.findIndex((c) => c[0]?.action === "EVIDENCE_INGESTED");
    expect(ingestedIdx).toBeGreaterThanOrEqual(0);

    const artifactWriteIndex = db.artifact.upsert.mock.invocationCallOrder[0] ?? 0;
    const extractWriteIndex = db.rawExtraction.create.mock.invocationCallOrder[0] ?? 0;
    const ingestedCallOrder = logAuditEvent.mock.invocationCallOrder[ingestedIdx] ?? 0;

    expect(ingestedCallOrder).toBeGreaterThan(artifactWriteIndex);
    expect(ingestedCallOrder).toBeGreaterThan(extractWriteIndex);
  });

  it("rejects malformed payload with SYSTEM_ACTION audit (not EVIDENCE_INGESTED)", async () => {
    await expect(
      capturedHandler!(
        makeFakeJob({ id: "job-malformed", data: { notAValidPayload: true } }),
      ),
    ).rejects.toThrow("Malformed ingest-evidence payload");

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SYSTEM_ACTION",
        targetType: "SYSTEM",
        description: expect.stringContaining("Malformed"),
      }),
    );
    expect(
      logAuditEvent.mock.calls.some((c) => c[0]?.action === "EVIDENCE_INGESTED"),
    ).toBe(false);
  });

  it("throws when the investigation run does not exist", async () => {
    db.investigationRun.findFirst.mockResolvedValue(null);
    await expect(capturedHandler!(makeFakeJob())).rejects.toThrow("Investigation not found");
    expect(db.artifact.upsert).not.toHaveBeenCalled();
  });
});

describe("Failure semantics: retryable vs permanent", () => {
  it("retryable acquisition failure → attempt FAILED recorded, run NOT final-failed, rethrows", async () => {
    h.acquire.mockResolvedValueOnce({
      ok: false,
      error: {
        category: "FETCH_FAILED",
        code: "ACQUISITION_FETCH_FAILED",
        message: "network hiccup",
        retryable: true,
        timestamp: new Date().toISOString(),
      },
    });

    await expect(
      capturedHandler!(makeFakeJob({ attemptsMade: 0 })),
    ).rejects.toThrow("ACQUISITION_FETCH_FAILED");

    expect(db.ingestionAttempt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "FAILED",
          error: expect.objectContaining({ category: "FETCH_FAILED", retryable: true }),
        }),
      }),
    );
    const failedTransition = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "FAILED",
    );
    expect(failedTransition).toBeUndefined();
    expect(
      logAuditEvent.mock.calls.some((c) => c[0]?.action === "EVIDENCE_INGESTED"),
    ).toBe(false);
  });

  it("§5: retryable failure emits an INGESTING retry notice — never claims FAILED", async () => {
    h.acquire.mockResolvedValueOnce({
      ok: false,
      error: {
        category: "FETCH_FAILED",
        code: "ACQUISITION_FETCH_FAILED",
        message: "will retry",
        retryable: true,
        timestamp: new Date().toISOString(),
      },
    });

    await expect(capturedHandler!(makeFakeJob())).rejects.toThrow();

    const calls = emitProgressEvent.mock.calls as unknown as [string, string, string][];
    expect(calls.some((c) => c[1] === "FAILED")).toBe(false);
    expect(calls.some((c) => String(c[2]).includes("retrying"))).toBe(true);
  });

  it("non-retryable acquisition failure → run permanently FAILED (INGESTING → FAILED)", async () => {
    h.acquire.mockResolvedValueOnce({
      ok: false,
      error: {
        category: "UNSUPPORTED_FORMAT",
        code: "ACQUISITION_UNSUPPORTED_FORMAT",
        message: "cannot process",
        retryable: false,
        timestamp: new Date().toISOString(),
      },
    });

    await expect(capturedHandler!(makeFakeJob())).rejects.toThrow();

    const failedTransition = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "FAILED",
    );
    expect(failedTransition).toBeDefined();
    expect(failedTransition![0]?.data).toEqual(
      expect.objectContaining({ status: "FAILED" }),
    );
  });

  it("§5: terminal failure emits a FAILED progress frame", async () => {
    h.acquire.mockResolvedValueOnce({
      ok: false,
      error: {
        category: "UNSUPPORTED_FORMAT",
        code: "ACQUISITION_UNSUPPORTED_FORMAT",
        message: "cannot process",
        retryable: false,
        timestamp: new Date().toISOString(),
      },
    });

    await expect(capturedHandler!(makeFakeJob())).rejects.toThrow();

    const calls = emitProgressEvent.mock.calls as unknown as [string, string, string][];
    expect(calls.some((c) => c[1] === "FAILED")).toBe(true);
  });

  it("retry exhaustion (attempt 3 of 3) → run permanently FAILED", async () => {
    h.acquire.mockResolvedValueOnce({
      ok: false,
      error: {
        category: "FETCH_FAILED",
        code: "ACQUISITION_FETCH_FAILED",
        message: "still down",
        retryable: true,
        timestamp: new Date().toISOString(),
      },
    });

    await expect(
      capturedHandler!(makeFakeJob({ attemptsMade: 2 })), // 3rd attempt == exhausted
    ).rejects.toThrow();

    const failedTransition = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "FAILED",
    );
    expect(failedTransition).toBeDefined();
  });
});

describe("Case identity: no fabrication", () => {
  it("uses run.caseId (source of truth); queue payload caseId must match", async () => {
    await capturedHandler!(makeFakeJob());
    expect(db.artifact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ caseId: VALID_CASE_ID }),
      }),
    );
  });

  it("CASE_ID_MISMATCH when queue caseId differs from run.caseId → attempt FAILED, no artifact, no EVIDENCE_INGESTED", async () => {
    await expect(
      capturedHandler!(
        makeFakeJob({
          data: { ...makeValidPayload(), caseId: VALID_CASE_ID_2 },
        }),
      ),
    ).rejects.toThrow("CASE_ID_MISMATCH");

    expect(db.ingestionAttempt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "FAILED", attemptNumber: 1 }),
      }),
    );
    expect(db.artifact.upsert).not.toHaveBeenCalled();
    expect(
      logAuditEvent.mock.calls.some((c) => c[0]?.action === "EVIDENCE_INGESTED"),
    ).toBe(false);
  });
});

describe("Deterministic source identity", () => {
  it("derives sourceId deterministically from investigation + fileKey", async () => {
    await capturedHandler!(makeFakeJob());
    expect(h.deterministicSourceId).toHaveBeenCalledWith(`${VALID_INV_ID}:test.txt`);
    expect(db.artifact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ sourceId: VALID_SOURCE_ID }),
      }),
    );
  });
});

describe("Re-entrant completion (M-A05): RawExtraction persisted + retry", () => {
  it("retry after raw persisted, run still INGESTING (transition failed) → completes through ANALYZING, NO re-acquire, NO duplicate raw", async () => {
    runState.state = "INGESTING";
    runState.status = "RUNNING";
    db.rawExtraction.findUnique.mockResolvedValue({ id: "rx-1", attemptId: "attempt-1" });

    await capturedHandler!(makeFakeJob({ attemptsMade: 1 }));

    expect(h.acquire).not.toHaveBeenCalled();
    expect(db.artifact.upsert).not.toHaveBeenCalled();
    expect(db.rawExtraction.create).not.toHaveBeenCalled();
    // Rehydrated stored row drives normalization without re-extraction.
    expect(h.parseStoredRawExtraction).toHaveBeenCalled();
    expect(h.normalize).toHaveBeenCalled();
    expect(db.normalizedExtraction.create).toHaveBeenCalled();
    // INGESTING → NORMALIZING → ANALYZING on the re-entry.
    const norm = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "NORMALIZING",
    );
    expect(norm).toBeDefined();
    const analyzing = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "ANALYZING",
    );
    expect(analyzing).toBeDefined();
    expect(runState.state).toBe("ANALYZING");
  });

  it("already-NORMALIZING run with existing source + normalized output → re-entry completes to ANALYZING without duplicate writes/audits", async () => {
    runState.state = "NORMALIZING";
    runState.status = "RUNNING";
    db.rawExtraction.findUnique.mockResolvedValue({ id: "rx-1", attemptId: "attempt-1" });
    db.normalizedExtraction.findUnique.mockResolvedValue(makeStoredNormalizedRow());

    await capturedHandler!(makeFakeJob());

    expect(h.acquire).not.toHaveBeenCalled();
    // RUNNING attempt is (re)established — that is idempotent and expected.
    expect(db.ingestionAttempt.upsert).toHaveBeenCalledTimes(1);
    const statuses = db.ingestionAttempt.upsert.mock.calls.map(
      (c) => c[0]?.update?.status,
    );
    expect(statuses).toEqual(["RUNNING"]);
    // Normalized row already exists → NO re-normalize, NO re-persist,
    // NO NORMALIZATION_STORED re-audit.
    expect(h.normalize).not.toHaveBeenCalled();
    expect(db.normalizedExtraction.create).not.toHaveBeenCalled();
    expect(
      logAuditEvent.mock.calls.filter((c) => c[0]?.action === "NORMALIZATION_STORED"),
    ).toHaveLength(0);
    // …but NORMALIZING → ANALYZING applies + is audited once.
    expect(runState.state).toBe("ANALYZING");
    expect(
      logAuditEvent.mock.calls.filter((c) => c[0]?.action === "NORMALIZATION_COMPLETED"),
    ).toHaveLength(1);
  });

  it("duplicate completion call is idempotent — one NormalizedExtraction, one STORED, one COMPLETED, run lands ANALYZING", async () => {
    // Realistic retry: first pass normalizes + writes the row; second pass
    // re-enters with the run already ANALYZING and the normalized row present.
    runState.state = "INGESTING";
    runState.status = "RUNNING";
    db.rawExtraction.findUnique.mockResolvedValue({ id: "rx-1", attemptId: "attempt-1" });
    // completeNormalization's existence check AND the upsert pre-check both hit
    // findUnique — both must miss on the first pass for create to fire once.
    db.normalizedExtraction.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(makeStoredNormalizedRow()); // second pass → no-op

    await capturedHandler!(makeFakeJob());
    await capturedHandler!(makeFakeJob());

    expect(h.acquire).not.toHaveBeenCalled();
    expect(db.rawExtraction.create).not.toHaveBeenCalled();
    expect(db.normalizedExtraction.create).toHaveBeenCalledTimes(1);
    expect(
      logAuditEvent.mock.calls.filter((c) => c[0]?.action === "NORMALIZATION_STORED"),
    ).toHaveLength(1);
    expect(
      logAuditEvent.mock.calls.filter((c) => c[0]?.action === "NORMALIZATION_COMPLETED"),
    ).toHaveLength(1);
    expect(runState.state).toBe("ANALYZING");
  });

  it("run already ANALYZING with raw + normalized → re-entry completes with zero duplicate audits and NO regression", async () => {
    runState.state = "ANALYZING";
    runState.status = "RUNNING";
    db.rawExtraction.findUnique.mockResolvedValue({ id: "rx-1", attemptId: "attempt-1" });
    db.normalizedExtraction.findUnique.mockResolvedValue(makeStoredNormalizedRow());

    await capturedHandler!(makeFakeJob());

    expect(h.acquire).not.toHaveBeenCalled();
    expect(h.normalize).not.toHaveBeenCalled();
    expect(db.investigationRun.update).not.toHaveBeenCalled();
    expect(runState.state).toBe("ANALYZING");
    expect(logAuditEvent.mock.calls).toHaveLength(0);
  });

  it("corrupt stored row (rehydration throws) → NORMALIZATION_FAILED audit, run permanently FAILED, UnrecoverableError", async () => {
    runState.state = "NORMALIZING";
    runState.status = "RUNNING";
    db.rawExtraction.findUnique.mockResolvedValue({
      id: "rx-1",
      attemptId: "attempt-1",
      artifactId: VALID_ARTIFACT_ID,
    });
    h.parseStoredRawExtraction.mockImplementation(() => {
      throw new Error("corrupt stored extraction JSON");
    });

    await expect(capturedHandler!(makeFakeJob())).rejects.toThrow("NORMALIZATION_FAILED");

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "NORMALIZATION_FAILED",
        targetId: VALID_ARTIFACT_ID,
        description: expect.stringContaining("corrupt stored extraction JSON"),
      }),
    );
    const failed = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "FAILED",
    );
    expect(failed).toBeDefined();
    expect(failed![0]?.data).toEqual(
      expect.objectContaining({ status: "FAILED" }),
    );
    expect(runState.state).toBe("FAILED");
    // The SUCCEEDED extraction attempt is never touched — no re-Upsert beyond RUNNING.
    expect(h.acquire).not.toHaveBeenCalled();
  });

  it("corrupt stored NORMALIZED row (rehydration throws) → NORMALIZATION_FAILED, run FAILED, UnrecoverableError", async () => {
    runState.state = "NORMALIZING";
    runState.status = "RUNNING";
    db.rawExtraction.findUnique.mockResolvedValue({
      id: "rx-1",
      attemptId: "attempt-1",
      artifactId: VALID_ARTIFACT_ID,
    });
    db.normalizedExtraction.findUnique.mockResolvedValue({
      ...makeStoredNormalizedRow(),
      canonicalFields: "garbage", // breaks the content-column schema
    });

    await expect(capturedHandler!(makeFakeJob())).rejects.toThrow("NORMALIZATION_FAILED");

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "NORMALIZATION_FAILED",
        targetId: VALID_ARTIFACT_ID,
      }),
    );
    const failed = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "FAILED",
    );
    expect(failed).toBeDefined();
    expect(runState.state).toBe("FAILED");
    // The normalizer is NEVER re-run on a re-entry — even to learn the row is bad.
    expect(h.normalize).not.toHaveBeenCalled();
  });

  it("normalize pure-step throws (contract violation) → permanent NORMALIZATION_FAILED, run FAILED, no ANALYZING", async () => {
    runState.state = "NORMALIZING";
    runState.status = "RUNNING";
    db.rawExtraction.findUnique.mockResolvedValue({ id: "rx-1", attemptId: "attempt-1" });
    h.normalize.mockImplementation(() => {
      throw new Error("normalized output failed contract validation");
    });

    await expect(capturedHandler!(makeFakeJob())).rejects.toThrow("NORMALIZATION_FAILED");

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "NORMALIZATION_FAILED",
        description: expect.stringContaining("contract validation"),
      }),
    );
    expect(db.normalizedExtraction.create).not.toHaveBeenCalled();
    const analyzing = db.investigationRun.update.mock.calls.find(
      (c) => c[0]?.data?.state === "ANALYZING",
    );
    expect(analyzing).toBeUndefined();
    expect(runState.state).toBe("FAILED");
  });

  it("P2002 race on raw insert (pre-check missed, create collided) → recovered, completes to ANALYZING", async () => {
    db.rawExtraction.findUnique
      .mockResolvedValueOnce(null) // worker re-entrancy gate
      .mockResolvedValueOnce(null) // ensureRawExtraction pre-check
      .mockResolvedValueOnce({ id: "rx-1", attemptId: "attempt-1" }); // P2002 re-query
    const { Prisma } = await import("@prisma/client");
    db.rawExtraction.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.10.0",
      }),
    );

    await capturedHandler!(makeFakeJob());

    expect(db.rawExtraction.create).toHaveBeenCalled();
    expect(runState.state).toBe("ANALYZING");
  });
});

describe("Terminal-run guard (P1-5): no new evidence on terminal runs", () => {
  for (const status of ["FAILED", "CANCELLED", "COMPLETED"] as const) {
    it(`${status} run → RUN_TERMINAL UnrecoverableError, no acquisition, no attempt write, no state mutation`, async () => {
      runState.status = status;
      runState.state = status === "COMPLETED" ? "COMPLETED" : "FAILED";

      await expect(capturedHandler!(makeFakeJob())).rejects.toThrow("RUN_TERMINAL");

      expect(h.acquire).not.toHaveBeenCalled();
      expect(db.ingestionAttempt.upsert).not.toHaveBeenCalled();
      expect(db.rawExtraction.create).not.toHaveBeenCalled();
      expect(db.investigationRun.update).not.toHaveBeenCalled();
      expect(db.artifact.upsert).not.toHaveBeenCalled();
      expect(runState.state).toBe(status === "COMPLETED" ? "COMPLETED" : "FAILED");
      expect(runState.status).toBe(status);
    });
  }
});