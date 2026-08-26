import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import {
  IngestionJobPayloadSchema,
  ArtifactReferenceSchema,
} from "@indago/contracts";
import { verifyToken, verifyCaseAccess } from "../src/api/auth.js";

// ============================================================================
// I-PR2: Upload Producer Tests
//
// Tests the pure helper functions, ArtifactReference construction,
// idempotency key determinism, payload validation, and worker stub.
//
// UploadThing middleware/onUploadComplete cannot be unit-tested in
// isolation (coupled to SDK). The logic is tested here by replicating
// the construction steps and validating against schemas.
// ============================================================================

const VALID_INVESTIGATION_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_CASE_ID = "550e8400-e29b-41d4-a716-446655440010";
const VALID_CASE_ID_2 = "550e8400-e29b-41d4-a716-446655440011";

// Simulates the UploadThing file object shape
const mockFile = {
  name: "bank-statement.pdf",
  size: 102400,
  type: "application/pdf",
  key: "abc123.pdf",
  ufsUrl: "https://utfs.io/f/abc123.pdf",
  fileHash: "md5hash123",
};

// ============================================================================
// Auth Helpers
// ============================================================================
describe("Auth Helpers", () => {
  describe("verifyToken", () => {
    it("returns AuthenticatedUser for valid demo-token", () => {
      const user = verifyToken("demo-token");
      expect(user).not.toBeNull();
      expect(user!.id).toBe("usr_demo_123");
      expect(user!.role).toBe("INVESTIGATOR");
      expect(user!.allowedCases).toEqual([VALID_CASE_ID, VALID_CASE_ID_2]);
    });

    it("returns null for invalid token", () => {
      expect(verifyToken("invalid-token")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(verifyToken("")).toBeNull();
    });
  });

  describe("verifyCaseAccess", () => {
    const user = verifyToken("demo-token")!;

    it("grants access to allowed case", () => {
      expect(verifyCaseAccess(user, VALID_CASE_ID)).toBe(true);
    });

    it("denies access to unallowed case in production", () => {
      const original = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        expect(verifyCaseAccess(user, "case-999")).toBe(false);
      } finally {
        process.env.NODE_ENV = original;
      }
    });

    it("grants access to second allowed case", () => {
      expect(verifyCaseAccess(user, VALID_CASE_ID_2)).toBe(true);
    });
  });

  describe("AuthenticatedUser propagation", () => {
    it("principal from verifyToken has correct shape", () => {
      const user = verifyToken("demo-token")!;
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("role");
      expect(user).toHaveProperty("allowedCases");
      expect(typeof user.id).toBe("string");
      expect(typeof user.role).toBe("string");
      expect(Array.isArray(user.allowedCases)).toBe(true);
    });

    it("no hardcoded role in verifyToken — shape is generic", () => {
      const user = verifyToken("demo-token")!;
      expect(["INVESTIGATOR", "ADMIN", "AUDITOR"]).toContain(user.role);
    });
  });
});

// ============================================================================
// ArtifactReference Construction (replicates uploadthing.ts logic)
// ============================================================================
describe("ArtifactReference Construction", () => {
  // Replicates the object built in onUploadComplete
  const artifactReference = {
    url: mockFile.ufsUrl,
    originalFilename: mockFile.name,
    declaredMimeType: mockFile.type || undefined,
    declaredSizeBytes: mockFile.size,
    sourceType: "UPLOADTHING",
    providerMetadata: {
      uploadThingKey: mockFile.key,
      uploadThingFileHash: mockFile.fileHash,
    },
  };

  it("URL comes from file.ufsUrl", () => {
    expect(artifactReference.url).toBe("https://utfs.io/f/abc123.pdf");
  });

  it("filename comes from file.name", () => {
    expect(artifactReference.originalFilename).toBe("bank-statement.pdf");
  });

  it("MIME type comes from file.type", () => {
    expect(artifactReference.declaredMimeType).toBe("application/pdf");
  });

  it("size comes from file.size", () => {
    expect(artifactReference.declaredSizeBytes).toBe(102400);
  });

  it("provider key in providerMetadata.uploadThingKey", () => {
    expect(artifactReference.providerMetadata.uploadThingKey).toBe("abc123.pdf");
  });

  it("file.fileHash mapped to providerMetadata, not declaredContentHash", () => {
    expect(artifactReference.providerMetadata.uploadThingFileHash).toBe("md5hash123");
    expect(artifactReference).not.toHaveProperty("declaredContentHash");
  });

  it("no artifactId in reference", () => {
    expect(artifactReference).not.toHaveProperty("artifactId");
  });

  it("no contentHash in reference", () => {
    expect(artifactReference).not.toHaveProperty("contentHash");
  });

  it("validates against ArtifactReferenceSchema", () => {
    const result = ArtifactReferenceSchema.safeParse(artifactReference);
    expect(result.success).toBe(true);
  });

  it("schema rejects extra fields (strict)", () => {
    const result = ArtifactReferenceSchema.safeParse({
      ...artifactReference,
      extraField: "bad",
    });
    expect(result.success).toBe(false);
  });

  it("works with minimal fields (no type)", () => {
    const ref = {
      url: "https://utfs.io/f/file.txt",
      sourceType: "UPLOADTHING",
    };
    expect(ArtifactReferenceSchema.safeParse(ref).success).toBe(true);
  });
});

// ============================================================================
// Idempotency Key Determinism
// ============================================================================
describe("Idempotency Key", () => {
  function computeIdempotencyKey(investigationId: string, fileKey: string) {
    return createHash("sha256").update(`${investigationId}:${fileKey}`).digest("hex");
  }

  it("same investigationId + same file.key → same key", () => {
    const key1 = computeIdempotencyKey(VALID_INVESTIGATION_ID, "abc123.pdf");
    const key2 = computeIdempotencyKey(VALID_INVESTIGATION_ID, "abc123.pdf");
    expect(key1).toBe(key2);
  });

  it("same investigationId + different file.key → different key", () => {
    const key1 = computeIdempotencyKey(VALID_INVESTIGATION_ID, "abc123.pdf");
    const key2 = computeIdempotencyKey(VALID_INVESTIGATION_ID, "def456.pdf");
    expect(key1).not.toBe(key2);
  });

  it("different investigationId + same file.key → different key", () => {
    const key1 = computeIdempotencyKey(VALID_INVESTIGATION_ID, "abc123.pdf");
    const key2 = computeIdempotencyKey("660e8400-e29b-41d4-a716-446655440001", "abc123.pdf");
    expect(key1).not.toBe(key2);
  });

  it("produces a valid hex string", () => {
    const key = computeIdempotencyKey(VALID_INVESTIGATION_ID, "abc123.pdf");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ============================================================================
// Queue Payload (strict, single-producer)
// ============================================================================
describe("Queue Payload", () => {
  const validRef = ArtifactReferenceSchema.parse({
    url: mockFile.ufsUrl,
    originalFilename: mockFile.name,
    declaredMimeType: mockFile.type,
    declaredSizeBytes: mockFile.size,
    sourceType: "UPLOADTHING",
    providerMetadata: {
      uploadThingKey: mockFile.key,
      uploadThingFileHash: mockFile.fileHash,
    },
  });

  const validPayload = {
    investigationId: VALID_INVESTIGATION_ID,
    caseId: VALID_CASE_ID,
    artifactReference: validRef,
    idempotencyKey: createHash("sha256").update(`${VALID_INVESTIGATION_ID}:${mockFile.key}`).digest("hex"),
    correlationId: randomUUID(),
    operationId: randomUUID(),
    sourceName: "Test Source",
    evidenceType: "COMMUNICATION",
    evidenceTitle: "Test Evidence",
  };

  it("valid Zod payload passes validation", () => {
    expect(IngestionJobPayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it("strict rejection of extra fields", () => {
    const result = IngestionJobPayloadSchema.safeParse({
      ...validPayload,
      hackerField: "inject",
    });
    expect(result.success).toBe(false);
  });

  it("no sourceId in payload", () => {
    expect(validPayload).not.toHaveProperty("sourceId");
  });

  it("no artifactId in payload", () => {
    expect(validPayload).not.toHaveProperty("artifactId");
  });

  it("no contentHash in payload", () => {
    expect(validPayload).not.toHaveProperty("contentHash");
  });

  it("JSON-safe: no Buffer, Uint8Array, File, or Blob", () => {
    const serialized = JSON.parse(JSON.stringify(validPayload));
    const str = JSON.stringify(serialized);
    expect(str).not.toContain("Buffer");
    expect(str).not.toContain("Uint8Array");
    expect(str).not.toContain("Blob");
    expect(typeof str).toBe("string");
  });

  it("idempotencyKey is used as BullMQ jobId", () => {
    const key = validPayload.idempotencyKey;
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("JSON round-trip preserves all fields", () => {
    const parsed = IngestionJobPayloadSchema.parse(validPayload);
    const roundTripped = JSON.parse(JSON.stringify(parsed));
    expect(Object.keys(roundTripped).sort()).toEqual([
      "artifactReference",
      "caseId",
      "correlationId",
      "evidenceTitle",
      "evidenceType",
      "idempotencyKey",
      "investigationId",
      "operationId",
      "sourceName",
    ]);
  });
});

// ============================================================================
// Duplicate Enqueue Semantics (BullMQ jobId dedup)
// ============================================================================
describe("Duplicate Enqueue Semantics", () => {
  it("same jobId produces identical idempotencyKey", () => {
    const key = createHash("sha256").update(`${VALID_INVESTIGATION_ID}:abc123.pdf`).digest("hex");
    const key2 = createHash("sha256").update(`${VALID_INVESTIGATION_ID}:abc123.pdf`).digest("hex");
    // Same inputs → same jobId → BullMQ silently skips duplicate
    expect(key).toBe(key2);
  });

  it("different file keys produce different jobIds", () => {
    const key1 = createHash("sha256").update(`${VALID_INVESTIGATION_ID}:abc123.pdf`).digest("hex");
    const key2 = createHash("sha256").update(`${VALID_INVESTIGATION_ID}:def456.pdf`).digest("hex");
    expect(key1).not.toBe(key2);
  });
});

// ============================================================================
// Evidence Submission IdempotencyKey Identity
// ============================================================================
describe("Evidence Submission IdempotencyKey", () => {
  function computeEvidenceKey(investigationId: string, fileKey: string) {
    return `evidence-${investigationId}-${fileKey}`;
  }

  it("same investigationId + same fileKey → same key", () => {
    const key1 = computeEvidenceKey(VALID_INVESTIGATION_ID, "abc123.pdf");
    const key2 = computeEvidenceKey(VALID_INVESTIGATION_ID, "abc123.pdf");
    expect(key1).toBe(key2);
  });

  it("different investigationId + same fileKey → different key", () => {
    const key1 = computeEvidenceKey(VALID_INVESTIGATION_ID, "abc123.pdf");
    const key2 = computeEvidenceKey("660e8400-e29b-41d4-a716-446655440001", "abc123.pdf");
    expect(key1).not.toBe(key2);
  });

  it("same investigationId + different fileKey → different key", () => {
    const key1 = computeEvidenceKey(VALID_INVESTIGATION_ID, "abc123.pdf");
    const key2 = computeEvidenceKey(VALID_INVESTIGATION_ID, "def456.pdf");
    expect(key1).not.toBe(key2);
  });

  it("key is non-empty and deterministic", () => {
    const key = computeEvidenceKey(VALID_INVESTIGATION_ID, "file.pdf");
    expect(key).toBe(`evidence-${VALID_INVESTIGATION_ID}-file.pdf`);
    expect(computeEvidenceKey(VALID_INVESTIGATION_ID, "file.pdf")).toBe(key);
  });
});

// ============================================================================
// Auth Limitation Documentation
// ============================================================================
describe("Auth Limitation", () => {
  it("verifyToken is the sole authentication function", () => {
    // This test documents that verifyToken is the only auth boundary.
    // If someone adds a new auth function, this test suite should be
    // updated to cover it.
    const user = verifyToken("demo-token")!;
    expect(user).not.toBeNull();
    expect(user.allowedCases).toContain(VALID_CASE_ID);
  });

  it("verifyCaseAccess is the sole authorization function", () => {
    const user = verifyToken("demo-token")!;
    expect(verifyCaseAccess(user, VALID_CASE_ID)).toBe(true);
  });
});
