import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/sse/[investigationId]/route";

const VALID_UUID = "01908950-0000-4000-8000-000000000000";

function req(id = VALID_UUID) {
  return {
    params: Promise.resolve({ investigationId: id }),
  } as never;
}

describe("GET /api/sse/[investigationId]", () => {
  const origEnv = { ...process.env };
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.test";
    process.env.AUTH_TOKEN = "tok-123";
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
  });

  it("returns 400 for a non-UUID investigationId and never calls fetch", async () => {
    const res = await req("../../../etc/passwd");
    const r = await GET(res as never, { params: res.params } as never);
    expect(r.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 500 when NEXT_PUBLIC_API_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const r = await GET(req() as never, { params: req().params } as never);
    expect(r.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 502 when fetch throws (platform unreachable)", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r = await GET(req() as never, { params: req().params } as never);
    expect(r.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/investigations/"),
      expect.objectContaining({ headers: { Authorization: "Bearer tok-123" } }),
    );
  });

  it("forwards the upstream status when the response is not ok", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 403 });
    const r = await GET(req() as never, { params: req().params } as never);
    expect(r.status).toBe(403);
  });

  it("returns 200 with SSE content-type and encodes the id in the URL", async () => {
    const reader = { read: vi.fn().mockResolvedValue({ done: true, value: undefined }) };
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    });
    const r = await GET(req() as never, { params: req().params } as never);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("text/event-stream");
    const calledUrl: string = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(VALID_UUID));
    expect(calledUrl).toBe(`https://api.test/api/v1/investigations/${encodeURIComponent(VALID_UUID)}/stream`);
  });
});
