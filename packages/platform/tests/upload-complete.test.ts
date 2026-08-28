import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

// ============================================================================
// P1-3 REGRESSION: onUploadComplete case boundary + audit durability.
//
// handleUploadComplete() is the extracted, SDK-free completion policy:
//   - resolves the investigation + canonical case from DB
//   - verifies case access ONLY when a real principal exists
//   - NEVER fabricates a principal for anonymous (browser) uploads
//   - Prompt 4 decision: anonymous uploads are PROVIDER-UPLOAD STAGING — no
//     case-scoped EVIDENCE_UPLOADED audit is recorded for them; the authorized
//     evidence submission creates the case-scoped audit trail instead
//   - awaits the authenticated audit write — a failure propagates, it is never
//     swallowed
// ============================================================================

vi.mock("../src/db/prisma.js", () => ({
  db: { investigationRun: { findUnique: vi.fn() } },
}));

vi.mock("../src/audit/logger.js", () => ({
  logAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

// The router module constructs the SDK chain at import time; the SDK is a
// runtime-only concern for tests — the decision logic lives in
// handleUploadComplete.
vi.mock("uploadthing/express", () => ({
  createUploadthing: vi.fn(() => {
    const f = (config: unknown) => ({
      middleware: () => ({ onUploadComplete: vi.fn() }),
      _config: config,
    });
    return f;
  }),
}));

// Real auth module; access decision switchable via the shared mock below.
vi.mock("../src/api/auth.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/api/auth.js")>();
  return {
    ...actual,
    verifyCaseAccess: vi.fn().mockReturnValue(true),
  };
});

import * as auth from "../src/api/auth.js";
import { handleUploadComplete } from "../src/api/uploadthing.js";
import { logAuditEvent } from "../src/audit/logger.js";

const verifyCaseAccessMock = auth.verifyCaseAccess as unknown as Mock;

const INVESTIGATION_ID = "550e8400-e29b-41d4-a716-446655440000";
const CASE_A = "550e8400-e29b-41d4-a716-446655440010";

const authorizedUploader = {
  id: "usr_demo_123",
  role: "INVESTIGATOR" as const,
  allowedCases: [CASE_A, "550e8400-e29b-41d4-a716-446655440011"],
};

const file = { key: "abc123.pdf", name: "bank-statement.pdf" };

describe("P1-3: handleUploadComplete case boundary + audit durability", () => {
  let db: {
    investigationRun: { findUnique: Mock };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    verifyCaseAccessMock.mockReturnValue(true);
    db = (
      (await import("../src/db/prisma.js")) as {
        db: { investigationRun: { findUnique: Mock } };
      }
    ).db;
    db.investigationRun.findUnique.mockResolvedValue({
      id: "run-1",
      investigationId: INVESTIGATION_ID,
      caseId: CASE_A,
    });
  });

  afterEach(() => {
    verifyCaseAccessMock.mockReset();
    vi.restoreAllMocks();
  });

  it("authenticated uploader WITH access → EVIDENCE_UPLOADED audit, verified for principal", async () => {
    await handleUploadComplete({ investigationId: INVESTIGATION_ID, uploader: authorizedUploader }, file);

    expect(verifyCaseAccessMock).toHaveBeenCalledWith(authorizedUploader, CASE_A);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        investigationId: INVESTIGATION_ID,
        action: "EVIDENCE_UPLOADED",
        actor: authorizedUploader.id,
        targetType: "FILE",
        targetId: file.key,
        description: expect.stringContaining(`verified for ${authorizedUploader.id}`),
      }),
    );
  });

  it("authenticated uploader WITHOUT case access → throws, NO audit record", async () => {
    verifyCaseAccessMock.mockReturnValue(false);
    const denied = { ...authorizedUploader, id: "usr_other_1" };

    await expect(
      handleUploadComplete({ investigationId: INVESTIGATION_ID, uploader: denied }, file),
    ).rejects.toThrow("Unauthorized");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("nonexistent investigation → throws, NO audit record", async () => {
    db.investigationRun.findUnique.mockResolvedValue(null);

    await expect(
      handleUploadComplete({ investigationId: INVESTIGATION_ID, uploader: authorizedUploader }, file),
    ).rejects.toThrow("Investigation not found");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("run without a canonical caseId → throws, NO audit record", async () => {
    db.investigationRun.findUnique.mockResolvedValue({
      id: "run-1",
      investigationId: INVESTIGATION_ID,
      caseId: null,
    });

    await expect(
      handleUploadComplete({ investigationId: INVESTIGATION_ID, uploader: authorizedUploader }, file),
    ).rejects.toThrow("has no associated case");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("anonymous (browser) upload → PROVIDER-UPLOAD STAGING: accepted, NO fabricated principal, NO case-scoped audit", async () => {
    await handleUploadComplete({ investigationId: INVESTIGATION_ID, uploader: undefined }, file);

    // Nobody was invented and no case scope was asserted.
    expect(verifyCaseAccessMock).not.toHaveBeenCalled();
    // Prompt 4 decision: a case-scoped EVIDENCE_UPLOADED must not be recorded
    // for a file that is still just provider staging — the authorized evidence
    // submission creates the case-scoped audit trail.
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("audit write failure PROPAGATES (never swallowed)", async () => {
    const auditMock = logAuditEvent as unknown as Mock;
    auditMock.mockRejectedValueOnce(new Error("audit db down"));

    await expect(
      handleUploadComplete({ investigationId: INVESTIGATION_ID, uploader: authorizedUploader }, file),
    ).rejects.toThrow("audit db down");
  });
});