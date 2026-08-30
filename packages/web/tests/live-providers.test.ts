import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/server-action", () => ({
  getInvestigationStatus: vi.fn(),
  startInvestigation: vi.fn(),
  submitEvidence: vi.fn(),
  listObservations: vi.fn(),
  listEvidence: vi.fn(),
  listCases: vi.fn(),
}));
vi.mock("@/lib/upload/uploadthing", () => ({
  uploadEvidence: vi.fn(),
}));

import {
  getInvestigationStatus,
  startInvestigation,
  submitEvidence,
  listObservations,
  listEvidence,
  listCases,
} from "@/lib/api/server-action";
import { uploadEvidence } from "@/lib/upload/uploadthing";
import {
  LiveInvestigationProvider,
  LiveEvidenceProvider,
  LiveObservationProvider,
  LiveCaseProvider,
  createLiveWorkspaceProviders,
} from "@/lib/providers/live/providers";
import { toLiveProviderError } from "@/lib/providers/live/errors";
import type { WorkspaceIdentity, DataModeConfig } from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/types";
import type { EvidenceSubmissionRequest, Observation, Case } from "@indago/contracts";
import type {
  InvestigationStatusResponse,
  ObservationsResponse,
  EvidenceListItem,
  EvidenceListResponse,
  CasesResponse,
} from "@/lib/api/types";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440010";
const INVESTIGATION_ID = "550e8400-e29b-41d4-a716-446655440020";

const mockedGetStatus = vi.mocked(getInvestigationStatus);
const mockedStart = vi.mocked(startInvestigation);
const mockedSubmit = vi.mocked(submitEvidence);
const mockedUpload = vi.mocked(uploadEvidence);
const mockedListObservations = vi.mocked(listObservations);
const mockedListEvidence = vi.mocked(listEvidence);
const mockedListCases = vi.mocked(listCases);

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

function makeObservation(id: string): Observation {
  const sourceId = "550e8400-e29b-41d4-a716-446655444100";
  return {
    id,
    evidenceId: "550e8400-e29b-41d4-a716-446655444200",
    sourceId,
    type: "FACTUAL",
    content: `Observation ${id}`,
    entityIds: [],
    candidateMentions: [],
    strength: 0.7,
    provenance: { sourceId, extractor: "infix-extractor@1.0" },
    createdAt: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
  };
}

function makeObservationsResponse(
  count: number,
): ObservationsResponse {
  const observations = Array.from({ length: count }, (_, i) =>
    makeObservation(`11111111-1111-4111-8111-111111111${i}`),
  );
  return {
    investigationId: INVESTIGATION_ID,
    caseId: CASE_ID,
    count,
    observations,
  };
}

function makeEvidenceListItem(id: string): EvidenceListItem {
  return {
    id,
    caseId: CASE_ID,
    investigationId: INVESTIGATION_ID,
    type: "RECORD",
    title: `Evidence ${id}`,
    description: "Platform evidence projection",
    status: "PROCESSED",
    sourceRef: "src-ledger",
    observedAt: { value: "2026-08-01T00:00:00.000Z", precision: "day" },
    observationCount: 2,
    artifactIds: ["art-1"],
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function makeEvidenceListResponse(
  count: number,
): EvidenceListResponse {
  const evidence = Array.from({ length: count }, (_, i) =>
    makeEvidenceListItem(`22222222-2222-4222-8222-222222222${i}`),
  );
  return {
    investigationId: INVESTIGATION_ID,
    caseId: CASE_ID,
    count,
    evidence,
  };
}

function makeCase(id: string): Case {
  return {
    id,
    title: `Case ${id}`,
    description: "",
    status: "OPEN",
    assignedTo: "usr_demo_123",
    createdAt: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2026-01-02T12:30:00.000Z", precision: "exact" },
    investigationIds: [INVESTIGATION_ID],
    sourceIds: [],
    entityIds: [],
    evidenceIds: ["22222222-2222-4222-8222-2222222220"],
  };
}

function makeCasesResponse(count: number): CasesResponse {
  const cases = Array.from({ length: count }, (_, i) =>
    makeCase(`33333333-3333-4333-8333-333333333${i}`),
  );
  return { count, cases };
}

describe("LiveObservationProvider.listByInvestigation", () => {
  it("returns the platform observations as a Paginated page (default page 1, size 20)", async () => {
    mockedListObservations.mockResolvedValue(makeObservationsResponse(3));
    const provider = new LiveObservationProvider();
    const result = await provider.listByInvestigation(INVESTIGATION_ID);

    expect(mockedListObservations).toHaveBeenCalledWith(INVESTIGATION_ID);
    expect(result.totalItems).toBe(3);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({
      content: "Observation 11111111-1111-4111-8111-1111111110",
    });
  });

  it("applies client-side paging over the authoritative platform list", async () => {
    mockedListObservations.mockResolvedValue(makeObservationsResponse(5));
    const provider = new LiveObservationProvider();
    const result = await provider.listByInvestigation(INVESTIGATION_ID, {
      page: 2,
      pageSize: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
    expect(result.totalItems).toBe(5);
    expect(result.hasMore).toBe(true);
  });

  it("rejects with ProviderError.CANCELLED when the caller signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new LiveObservationProvider();
    await expect(
      provider.listByInvestigation(INVESTIGATION_ID, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(mockedListObservations).not.toHaveBeenCalled();
  });

  it("maps platform errors without leaking them (403 → AUTHORIZATION)", async () => {
    mockedListObservations.mockRejectedValue(
      apiError(403, `Security Violation: Unauthorized access to case boundary ${CASE_ID}`),
    );
    const provider = new LiveObservationProvider();
    await expect(
      provider.listByInvestigation(INVESTIGATION_ID),
    ).rejects.toMatchObject({ code: "AUTHORIZATION" });
  });

  it("maps 404 to a NOT_FOUND ProviderError", async () => {
    mockedListObservations.mockRejectedValue(
      apiError(404, "Investigation not found"),
    );
    const provider = new LiveObservationProvider();
    await expect(provider.listByInvestigation("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("maps network TypeErrors to a NETWORK ProviderError", async () => {
    mockedListObservations.mockRejectedValue(new TypeError("fetch failed"));
    const provider = new LiveObservationProvider();
    await expect(
      provider.listByInvestigation(INVESTIGATION_ID),
    ).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("a backend failure NEVER yields a fabricated observation list", async () => {
    mockedListObservations.mockRejectedValue(
      apiError(500, "Internal server error"),
    );
    const provider = new LiveObservationProvider();
    await expect(
      provider.listByInvestigation(INVESTIGATION_ID),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("LiveObservationProvider.listByEntity", () => {
  it("has no platform endpoint yet and stays UNSUPPORTED", async () => {
    const provider = new LiveObservationProvider();
    await expect(provider.listByEntity("entity-1")).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });
});

describe("LiveEvidenceProvider.listByInvestigation", () => {
  it("returns the platform evidence projection as a Paginated page (default page 1, size 20)", async () => {
    mockedListEvidence.mockResolvedValue(makeEvidenceListResponse(3));
    const provider = new LiveEvidenceProvider();
    const result = await provider.listByInvestigation(INVESTIGATION_ID);

    expect(mockedListEvidence).toHaveBeenCalledWith(INVESTIGATION_ID);
    expect(result.totalItems).toBe(3);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({
      id: "22222222-2222-4222-8222-2222222220",
      status: "PROCESSED",
      sourceRef: "src-ledger",
      observationCount: 2,
      artifactIds: ["art-1"],
    });
  });

  it("applies client-side paging over the authoritative platform list", async () => {
    mockedListEvidence.mockResolvedValue(makeEvidenceListResponse(5));
    const provider = new LiveEvidenceProvider();
    const result = await provider.listByInvestigation(INVESTIGATION_ID, {
      page: 2,
      pageSize: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(2);
    expect(result.totalItems).toBe(5);
    expect(result.hasMore).toBe(true);
  });

  it("rejects with ProviderError.CANCELLED when the caller signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new LiveEvidenceProvider();
    await expect(
      provider.listByInvestigation(INVESTIGATION_ID, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(mockedListEvidence).not.toHaveBeenCalled();
  });

  it("maps platform errors without leaking them (403 → AUTHORIZATION)", async () => {
    mockedListEvidence.mockRejectedValue(
      apiError(403, `Security Violation: Unauthorized access to case boundary ${CASE_ID}`),
    );
    const provider = new LiveEvidenceProvider();
    await expect(
      provider.listByInvestigation(INVESTIGATION_ID),
    ).rejects.toMatchObject({ code: "AUTHORIZATION" });
  });

  it("maps 404 to a NOT_FOUND ProviderError", async () => {
    mockedListEvidence.mockRejectedValue(
      apiError(404, "Investigation not found"),
    );
    const provider = new LiveEvidenceProvider();
    await expect(provider.listByInvestigation("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("maps network TypeErrors to a NETWORK ProviderError", async () => {
    mockedListEvidence.mockRejectedValue(new TypeError("fetch failed"));
    const provider = new LiveEvidenceProvider();
    await expect(
      provider.listByInvestigation(INVESTIGATION_ID),
    ).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("a backend failure NEVER yields a fabricated evidence list", async () => {
    mockedListEvidence.mockRejectedValue(
      apiError(500, "Internal server error"),
    );
    const provider = new LiveEvidenceProvider();
    await expect(
      provider.listByInvestigation(INVESTIGATION_ID),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("does not fabricate strength for live projections", async () => {
    mockedListEvidence.mockResolvedValue(makeEvidenceListResponse(1));
    const provider = new LiveEvidenceProvider();
    const result = await provider.listByInvestigation(INVESTIGATION_ID);
    expect(result.items[0].strength).toBeUndefined();
  });
});

describe("LiveEvidenceProvider.get", () => {
  it("has no platform single-get endpoint yet and stays UNSUPPORTED", async () => {
    const provider = new LiveEvidenceProvider();
    await expect(provider.get("evidence-1")).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });
});

describe("LiveCaseProvider.list", () => {
  it("returns the platform case catalogue as a Paginated page (default page 1, size 20)", async () => {
    mockedListCases.mockResolvedValue(makeCasesResponse(3));
    const provider = new LiveCaseProvider();
    const result = await provider.list();

    expect(mockedListCases).toHaveBeenCalled();
    expect(result.totalItems).toBe(3);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({
      id: "33333333-3333-4333-8333-3333333330",
      status: "OPEN",
      investigationIds: [INVESTIGATION_ID],
    });
  });

  it("applies client-side paging over the authoritative platform catalogue", async () => {
    mockedListCases.mockResolvedValue(makeCasesResponse(5));
    const provider = new LiveCaseProvider();
    const result = await provider.list({ page: 2, pageSize: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(2);
    expect(result.totalItems).toBe(5);
    expect(result.hasMore).toBe(true);
  });

  it("rejects with ProviderError.CANCELLED when the caller signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new LiveCaseProvider();
    await expect(
      provider.list({ signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(mockedListCases).not.toHaveBeenCalled();
  });

  it("maps platform errors without leaking them (500 → SERVER)", async () => {
    mockedListCases.mockRejectedValue(apiError(500, "Internal server error"));
    const provider = new LiveCaseProvider();
    await expect(provider.list()).rejects.toMatchObject({ code: "SERVER" });
  });

  it("a backend failure NEVER yields a fabricated case list", async () => {
    mockedListCases.mockRejectedValue(new TypeError("fetch failed"));
    const provider = new LiveCaseProvider();
    await expect(provider.list()).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("live provider bundle", () => {
  it("wires evidence + case lists to live endpoints while remaining list endpoints stay unsupported", async () => {
    const providers = createLiveWorkspaceProviders(identity, liveConfig);
    mockedListEvidence.mockResolvedValue(makeEvidenceListResponse(2));
    mockedListCases.mockResolvedValue(makeCasesResponse(1));

    expect(providers.mode).toBe("live");
    const evidence = await providers.evidence.listByInvestigation(INVESTIGATION_ID);
    expect(evidence.items).toHaveLength(2);
    const cases = await providers.cases.list();
    expect(cases.items).toHaveLength(1);
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