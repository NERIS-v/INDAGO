import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { IngestionJobPayloadSchema } from "@indago/contracts";
import { logAuditEvent } from "../src/audit/logger.js";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock("../src/db/prisma.js", () => ({
  db: {
    investigationRun: { findFirst: vi.fn() },
  },
}));

vi.mock("../src/audit/logger.js", () => ({
  logAuditEvent: vi.fn().mockResolvedValue({ id: "audit-123" }),
}));

vi.mock("../src/realtime/sse.js", () => ({
  realtimeEvents: { emit: vi.fn() },
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

// Capture the worker handler by mocking BullMQ Worker to record the callback
let capturedHandler: ((job: { name: string; data: unknown; id: string }) => Promise<unknown>) | null = null;

vi.mock("bullmq", async () => {
  return {
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
    })),
    Worker: vi.fn().mockImplementation((_name: string, handler: unknown) => {
      capturedHandler = handler as typeof capturedHandler;
      return {};
    }),
  };
});

// Import after mocks — this triggers the Worker constructor which captures the handler
await import("../src/queue/orchestrator.js");

const VALID_INV_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_CORR_ID = "660e8400-e29b-41d4-a716-446655440001";
const VALID_CASE_ID = "550e8400-e29b-41d4-a716-446655440010";
const VALID_OP_ID = "770e8400-e29b-41d4-a716-446655440002";

function makeValidPayload() {
  return {
    investigationId: VALID_INV_ID,
    caseId: VALID_CASE_ID,
    artifactReference: {
      url: "https://utfs.io/f/test.pdf",
      originalFilename: "test.pdf",
      declaredMimeType: "application/pdf",
      declaredSizeBytes: 1024,
      sourceType: "UPLOADTHING",
      providerMetadata: { uploadThingKey: "test.pdf" },
    },
    idempotencyKey: createHash("sha256").update(`${VALID_INV_ID}:test.pdf`).digest("hex"),
    correlationId: VALID_CORR_ID,
    operationId: VALID_OP_ID,
    sourceName: "Test Source",
    evidenceType: "COMMUNICATION",
    evidenceTitle: "Test Evidence",
  };
}

describe("I-PR2 Worker Stub: ingest-evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handler was captured from Worker constructor", () => {
    expect(capturedHandler).not.toBeNull();
  });

  it("accepts valid payload and logs receipt via SYSTEM_ACTION", async () => {
    await capturedHandler!({
      name: "ingest-evidence",
      data: makeValidPayload(),
      id: "job-001",
    });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        investigationId: VALID_INV_ID,
        action: "SYSTEM_ACTION",
        actor: "SYSTEM_WORKER",
        targetType: "INGESTION_JOB",
        description: expect.stringContaining(VALID_CORR_ID),
      }),
    );
  });

  it("rejects malformed payload with SYSTEM_ACTION audit (not INGESTION_JOB_FAILED)", async () => {
    await expect(
      capturedHandler!({
        name: "ingest-evidence",
        data: { notAValidPayload: true },
        id: "job-002",
      }),
    ).rejects.toThrow("Malformed ingest-evidence payload");

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SYSTEM_ACTION",
        targetType: "SYSTEM",
        description: expect.stringContaining("Malformed"),
      }),
    );
  });

  it("extracts investigationId from malformed payload via runtime check (no unsafe cast)", async () => {
    await expect(
      capturedHandler!({
        name: "ingest-evidence",
        data: { investigationId: VALID_INV_ID, other: "stuff" },
        id: "job-003",
      }),
    ).rejects.toThrow();

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ investigationId: VALID_INV_ID }),
    );
  });

  it("uses 'unknown' as audit target when investigationId missing from malformed payload", async () => {
    await expect(
      capturedHandler!({
        name: "ingest-evidence",
        data: { garbage: true },
        id: "job-004",
      }),
    ).rejects.toThrow();

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ investigationId: "unknown" }),
    );
  });

  it("validates the 4-field payload schema matches what the worker expects", () => {
    const result = IngestionJobPayloadSchema.safeParse(makeValidPayload());
    expect(result.success).toBe(true);
  });

  it("strict rejection: extra fields rejected by schema", () => {
    const result = IngestionJobPayloadSchema.safeParse({
      ...makeValidPayload(),
      hackerField: "inject",
    });
    expect(result.success).toBe(false);
  });
});
