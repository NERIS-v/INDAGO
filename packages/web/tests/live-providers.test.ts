import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/server-action", () => ({
  getInvestigationStatus: vi.fn(),
  startInvestigation: vi.fn(),
  submitEvidence: vi.fn(),
}));
vi.mock("@/lib/upload/uploadthing", () => ({
  uploadEvidence: vi.fn(),
}));

import {
  getInvestigationStatus,
  startInvestigation,
  submitEvidence,
} from "@/lib/api/server-action";
import { uploadEvidence } from "@/lib/upload/uploadthing";
import {
  LiveInvestigationProvider,
  LiveEvidenceProvider,
  createLiveWorkspaceProviders,
} from "@/lib/providers/live/providers";
import { toLiveProviderError } from "@/lib/providers/live/errors";
import type { WorkspaceIdentity, DataModeConfig } from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/types";
import type { EvidenceSubmissionRequest } from "@indago/contracts";
import type { InvestigationStatusResponse } from "@/lib/api/types";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440010";
const INVESTIGATION_ID = "550e8400-e29b-41d4-a716-446655440020";

const mockedGetStatus = vi.mocked(getInvestigationStatus);
const mockedStart = vi.mocked(startInvestigation);
const mockedSubmit = vi.mocked(submitEvidence);
const mockedUpload = vi.mocked(uploadEvidence);

const identity: WorkspaceIdentity = {
  workspaceId: `workspace:${INVESTIGATION_ID}`,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
};

const liveConfig: DataModeConfig = {
  mode: "live",
  demoCaseId: "",
  demoTimingScale: 1,
  isDevelopment: false,
};

function makeRun(
  overrides: Partial<InvestigationStatusResponse> = {},
): InvestigationStatusResponse {
  return {
    id: "run-1",
    investigationId: INVESTIGATION_ID,
    status: "RUNNING",
    state: "INGESTING",
    currentStage: "extracting financial records",
    retryCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T12:30:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status, body: {} });
}

describe("LiveInvestigationProvider.get", () => {
  it("hits the platform run-status endpoint for the canonical case boundary", async () => {
    mockedGetStatus.mockResolvedValue(makeRun());
    const provider = new LiveInvestigationProvider(CASE_ID);
    const investigation = await provider.get(INVESTIGATION_ID);

    expect(mockedGetStatus).toHaveBeenCalledWith(INVESTIGATION_ID, CASE_ID);
    expect(investigation.id).toBe(INVESTIGATION_ID);
    expect(investigation.caseId).toBe(CASE_ID);
    expect(investigation.status).toBe("ACTIVE");
    // Projection: canonical Investigation shape only — no run extras leaked.
    expect(Object.keys(investigation).sort()).toEqual(
      [
        "caseId",
        "createdAt",
        "description",
        "entityIds",
        "evidenceIds",
        "hypothesisIds",
        "id",
        "leadIds",
        "owner",
        "priority",
        "status",
        "title",
        "updatedAt",
      ].sort(),
    );
  });

  it("maps 403 to an AUTHORIZATION ProviderError", async () => {
    mockedGetStatus.mockRejectedValue(apiError(403, "Security Violation"));
    const provider = new LiveInvestigationProvider(CASE_ID);
    await expect(provider.get(INVESTIGATION_ID)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ProviderError && err.code === "AUTHORIZATION",
    );
  });

  it("maps 404 to a NOT_FOUND ProviderError", async () => {
    mockedGetStatus.mockRejectedValue(apiError(404, "Investigation not found"));
    const provider = new LiveInvestigationProvider(CASE_ID);
    await expect(provider.get("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("maps 5xx to a SERVER ProviderError", async () => {
    mockedGetStatus.mockRejectedValue(apiError(500, "Internal server error"));
    const provider = new LiveInvestigationProvider(CASE_ID);
    await expect(provider.get(INVESTIGATION_ID)).rejects.toMatchObject({
      code: "SERVER",
    });
  });

  it("maps network TypeErrors to a NETWORK ProviderError", async () => {
    mockedGetStatus.mockRejectedValue(new TypeError("fetch failed"));
    const provider = new LiveInvestigationProvider(CASE_ID);
    await expect(provider.get(INVESTIGATION_ID)).rejects.toMatchObject({
      code: "NETWORK",
    });
  });

  it("a backend failure NEVER yields a fabricated Investigation", async () => {
    mockedGetStatus.mockRejectedValue(apiError(500, "Internal server error"));
    const provider = new LiveInvestigationProvider(CASE_ID);
    try {
      await provider.get(INVESTIGATION_ID);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
    }
  });
});

describe("LiveInvestigationProvider.start", () => {
  it("forwards the canonical case/investigation identity and returns runId", async () => {
    mockedStart.mockResolvedValue({
      message: "Investigation queued successfully",
      runId: "run-9",
    });
    const provider = new LiveInvestigationProvider(CASE_ID);
    const result = await provider.start(CASE_ID, INVESTIGATION_ID);

    expect(mockedStart).toHaveBeenCalledWith({
      caseId: CASE_ID,
      investigationId: INVESTIGATION_ID,
    });
    expect(result).toEqual({ runId: "run-9" });
  });

  it("maps start failures to ProviderError", async () => {
    mockedStart.mockRejectedValue(apiError(403, "Forbidden"));
    const provider = new LiveInvestigationProvider(CASE_ID);
    await expect(provider.start(CASE_ID, INVESTIGATION_ID)).rejects.toMatchObject(
      { code: "AUTHORIZATION" },
    );
  });
});

describe("LiveEvidenceProvider.submit", () => {
  const request: Omit<EvidenceSubmissionRequest, "investigationId"> = {
    sourceName: "Banking portal",
    evidenceType: "RECORD",
    evidenceTitle: "Wire transfer docs",
    files: [
      { fileKey: "k", fileUrl: "https://cdn/x", fileName: "a.pdf", fileSize: 10 },
    ],
  };

  it("forwards the canonical evidence submission to the platform", async () => {
    mockedSubmit.mockResolvedValue({
      message: "Evidence submission accepted",
      operationId: "op-1",
      correlationId: "corr-1",
      jobsEnqueued: 1,
      fileCount: 1,
    });
    const provider = new LiveEvidenceProvider();
    const result = await provider.submit(INVESTIGATION_ID, request);

    expect(mockedSubmit).toHaveBeenCalledWith(INVESTIGATION_ID, request);
    expect(result.operationId).toBe("op-1");
    expect(result.jobsEnqueued).toBe(1);
  });

  it("rejects with ProviderError.CANCELLED when the caller signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new LiveEvidenceProvider();
    await expect(
      provider.submit(INVESTIGATION_ID, request, controller.signal),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("maps platform errors without leaking them (403 → AUTHORIZATION)", async () => {
    mockedSubmit.mockRejectedValue(apiError(403, "Security Violation"));
    const provider = new LiveEvidenceProvider();
    await expect(provider.submit(INVESTIGATION_ID, request)).rejects.toMatchObject(
      { code: "AUTHORIZATION" },
    );
  });
});

describe("LiveEvidenceProvider.prepareUpload", () => {
  it("uploads via UploadThing and returns canonical file references", async () => {
    mockedUpload.mockResolvedValue([
      {
        fileKey: "up-1",
        fileUrl: "https://cdn/up-1",
        fileName: "a.pdf",
        fileSize: 1024,
      },
    ]);
    const provider = new LiveEvidenceProvider();
    const onProgress = vi.fn();
    const files = [new File(["x"], "a.pdf")];

    const refs = await provider.prepareUpload(INVESTIGATION_ID, files, onProgress);

    expect(mockedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ investigationId: INVESTIGATION_ID, files }),
    );
    expect(refs[0]).toMatchObject({
      fileKey: "up-1",
      fileUrl: "https://cdn/up-1",
      fileName: "a.pdf",
      fileSize: 1024,
    });
  });

  it("rejects with VALIDATION when no files were selected", async () => {
    const provider = new LiveEvidenceProvider();
    await expect(provider.prepareUpload(INVESTIGATION_ID, [])).rejects.toMatchObject(
      { code: "VALIDATION" },
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it("maps upload failures to ProviderError", async () => {
    mockedUpload.mockRejectedValue(new TypeError("network error"));
    const provider = new LiveEvidenceProvider();
    await expect(
      provider.prepareUpload(INVESTIGATION_ID, [new File(["x"], "a.pdf")]),
    ).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("live provider bundle", () => {
  it("exposes only unsupported list endpoints (no platform GET yet)", async () => {
    const providers = createLiveWorkspaceProviders(identity, liveConfig);

    expect(providers.mode).toBe("live");
    await expect(
      providers.evidence.listByInvestigation(INVESTIGATION_ID),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(providers.cases.list()).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
    await expect(
      providers.investigations.listByCase(CASE_ID),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });
});

describe("toLiveProviderError", () => {
  it("passes existing ProviderErrors through unchanged", () => {
    const err = ProviderError.notFound();
    expect(toLiveProviderError(err)).toBe(err);
  });

  it("maps unknown plain Errors to SERVER", () => {
    expect(toLiveProviderError(new Error("boom"))).toMatchObject({
      code: "SERVER",
    });
  });

  it("maps 409 to a CONFLICT-category error", () => {
    expect(toLiveProviderError(apiError(409, "conflict"))).toMatchObject({
      category: "CONFLICT",
    });
  });
});