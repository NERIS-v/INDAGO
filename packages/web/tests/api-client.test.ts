import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Server API Client", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
    process.env.AUTH_TOKEN = "test-token";
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should make authenticated request to getInvestigationStatus", async () => {
    const responseData = {
      id: "run-123",
      investigationId: "inv-456",
      status: "RUNNING",
      state: "INGESTING",
      retryCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(responseData),
    });

    const { getInvestigationStatus } = await import("@/lib/api/server");
    const result = await getInvestigationStatus("inv-456", "case-042");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/investigations/inv-456?caseId=case-042",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    expect(result).toEqual(responseData);
  });

  it("should throw ApiError on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Not found" }),
    });

    const { getInvestigationStatus } = await import("@/lib/api/server");

    await expect(
      getInvestigationStatus("inv-missing", "case-042"),
    ).rejects.toThrow("Not found");
  });

  it("should make authenticated POST to startInvestigation", async () => {
    const responseData = {
      message: "Investigation queued successfully",
      runId: "run-789",
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(responseData),
    });

    const { startInvestigation } = await import("@/lib/api/server");
    const result = await startInvestigation({
      caseId: "case-042",
      investigationId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/investigations/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          caseId: "case-042",
          investigationId: "550e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(result.runId).toBe("run-789");
  });

  it("should include Authorization header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "healthy", service: "test" }),
    });

    const { getHealth } = await import("@/lib/api/server");
    await getHealth();

    const callHeaders = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(callHeaders.get("Authorization")).toBe("Bearer test-token");
  });

  it("should throw when NEXT_PUBLIC_API_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    const { getHealth } = await import("@/lib/api/server");

    await expect(getHealth()).rejects.toThrow("NEXT_PUBLIC_API_URL");
  });

  it("should throw when AUTH_TOKEN is not set", async () => {
    delete process.env.AUTH_TOKEN;

    const { getHealth } = await import("@/lib/api/server");

    await expect(getHealth()).rejects.toThrow("AUTH_TOKEN");
  });
});

describe("Production demo-credential guard (P0-2)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    vi.restoreAllMocks();
  });

  it("fails fast in production with the demo credential — no network call is made", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_TOKEN = "demo-token";

    const { getHealth } = await import("@/lib/api/server");
    await expect(getHealth()).rejects.toThrow("demo credential");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("same guard applies to the evidence submission path", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_TOKEN = "demo-token";

    const { submitEvidence } = await import("@/lib/api/server");
    await expect(
      submitEvidence("550e8400-e29b-41d4-a716-446655440000", {
        sourceName: "S",
        evidenceType: "COMMUNICATION",
        evidenceTitle: "T",
        files: [
          {
            fileKey: "k.txt",
            fileUrl: "https://utfs.io/f/k.txt",
            fileName: "k.txt",
            fileSize: 1,
            mimeType: "text/plain",
          },
        ],
      }),
    ).rejects.toThrow("demo credential");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("a NON-demo token in production is still sent", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_TOKEN = "prod-secret-abc";

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "healthy", service: "platform" }),
    });

    const { getHealth } = await import("@/lib/api/server");
    await expect(getHealth()).resolves.toEqual({
      status: "healthy",
      service: "platform",
    });
    const callHeaders = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(callHeaders.get("Authorization")).toBe("Bearer prod-secret-abc");
  });

  it("the demo credential remains usable OUTSIDE production (dev/test)", async () => {
    process.env.NODE_ENV = "development";
    process.env.AUTH_TOKEN = "demo-token";

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "healthy", service: "platform" }),
    });

    const { getHealth } = await import("@/lib/api/server");
    await expect(getHealth()).resolves.toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
