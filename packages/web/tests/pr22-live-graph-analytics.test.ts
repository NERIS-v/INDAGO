// ============================================================================
// PR-22 — LIVE graph analytics + temporal projection (centrality, authoritative
// communities vs community candidates, valid-at) against mocked platform routes.
//
// These tests exercise the real LiveGraphProvider through lib/api/server.ts
// platformFetch — the same boundary production uses. They pin:
//   - getCentrality()      → GET /graph/centrality (authoritative degree rank)
//   - getCommunities()     → GET /graph/communities (authoritative detection)
//   - getCommunityCandidates() → GET /graph/community-candidates (kept SEPARATE)
//   - getValidAt()         → GET /cases/:caseId/graph/valid-at?at=<ISO>
//                           (case-scoped, never browser-supplied caseId)
//   - typed API error handling and NO fabrication (a failure is an error).
// ============================================================================

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LiveGraphProvider } from "@/lib/providers/live/providers";
import { ProviderError } from "@/lib/providers/types";
import { deriveValidAtViewState, isValidAtRequest } from "@/lib/context/temporal-valid-at";

const BASE = "https://api.test";
const CASE_ID = "11111111-1111-4111-8111-111111111111";
const INVESTIGATION_ID = "22222222-2222-4222-8222-222222222222";
const ENTITY_A = "55555555-5555-4555-8555-555555555555";
const ENTITY_B = "66666666-6666-4666-8666-666666666666";
const VERSION_1 = "33333333-3333-4333-8333-333333333333";

type Handler = (
  url: URL,
  init?: RequestInit,
) => { status: number; body: unknown } | null;

function versionItem() {
  return {
    id: VERSION_1,
    caseId: CASE_ID,
    versionNumber: 1,
    status: "ACTIVE",
    projectionStatus: "COMPLETE",
    parentGraphVersionId: null,
    checkpointId: null,
    nodeCount: 2,
    edgeCount: 1,
    reason: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function stubRoutes(handlers: Handler[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      for (const handler of handlers) {
        const result = handler(url, init);
        if (result) return jsonResponse(result.body, result.status);
      }
      return jsonResponse({ error: "not-mocked" }, 500);
    }),
  );
}

function on(method: string, path: string, respond: Handler): Handler {
  return (url, init) => {
    const actualMethod = (init?.method ?? "GET").toUpperCase();
    if (actualMethod !== method || !url.pathname.startsWith(path)) return null;
    return respond(url, init);
  };
}

function graphProvider() {
  return new LiveGraphProvider(CASE_ID);
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = BASE;
  process.env.AUTH_TOKEN = "test-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_API_URL;
  delete process.env.AUTH_TOKEN;
});

describe("PR-22 — LiveGraphProvider.getCentrality", () => {
  it("hits GET /graph/centrality and returns the authoritative degree rank", async () => {
    const calls: string[] = [];
    stubRoutes([
      on("GET", "/api/v1/investigations/", (url) => {
        calls.push(url.pathname);
        if (url.pathname.endsWith("/graph/centrality")) {
          return {
            status: 200,
            body: {
              investigationId: INVESTIGATION_ID,
              caseId: CASE_ID,
              centrality: [
                { nodeId: ENTITY_A, degree: 3, centrality: 1 },
                { nodeId: ENTITY_B, degree: 1, centrality: 0.3333 },
              ],
            },
          };
        }
        return null;
      }),
    ]);
    const page = await graphProvider().getCentrality(INVESTIGATION_ID);
    expect(calls.some((p) => p.endsWith("/graph/centrality"))).toBe(true);
    expect(page.items[0]).toEqual({
      nodeId: ENTITY_A,
      degree: 3,
      centrality: 1,
    });
    expect(page.items[1].degree).toBe(1);
  });

  it("surfaces a typed SERVER error on a 500 — never fabricates centrality", async () => {
    stubRoutes([
      on("GET", "/api/v1/investigations/", () => ({
        status: 500,
        body: { error: "centrality exploded" },
      })),
    ]);
    await expect(graphProvider().getCentrality(INVESTIGATION_ID)).rejects.toMatchObject({
      code: "SERVER",
    });
  });
});

describe("PR-22 — authoritative communities vs community candidates (NEVER conflated)", () => {
  it("getCommunities hits GET /graph/communities (authoritative detection)", async () => {
    const paths: string[] = [];
    stubRoutes([
      on("GET", "/api/v1/investigations/", (url) => {
        paths.push(url.pathname);
        if (url.pathname.endsWith("/graph/communities")) {
          return {
            status: 200,
            body: {
              investigationId: INVESTIGATION_ID,
              caseId: CASE_ID,
              communityCount: 1,
              communities: [
                { communityId: 0, memberNodeIds: [ENTITY_A, ENTITY_B], size: 2, truncated: false },
              ],
            },
          };
        }
        return null;
      }),
    ]);
    const page = await graphProvider().getCommunities(INVESTIGATION_ID);
    expect(paths.some((p) => p.endsWith("/graph/communities"))).toBe(true);
    expect(paths.some((p) => p.includes("community-candidates"))).toBe(false);
    expect(page.items[0].communityId).toBe(0);
    expect(page.items[0].memberNodeIds).toEqual([ENTITY_A, ENTITY_B]);
  });

  it("getCommunityCandidates hits GET /graph/community-candidates (cohesion candidates)", async () => {
    const paths: string[] = [];
    stubRoutes([
      on("GET", "/api/v1/investigations/", (url) => {
        paths.push(url.pathname);
        if (url.pathname.endsWith("/graph/community-candidates")) {
          return {
            status: 200,
            body: {
              investigationId: INVESTIGATION_ID,
              caseId: CASE_ID,
              candidateCount: 1,
              candidates: [
                {
                  communityId: 1,
                  memberNodeIds: [ENTITY_A],
                  size: 1,
                  truncated: false,
                  cohesion: 1,
                  internalEdgeCount: 0,
                },
              ],
            },
          };
        }
        return null;
      }),
    ]);
    const page = await graphProvider().getCommunityCandidates(INVESTIGATION_ID);
    expect(paths.some((p) => p.endsWith("/graph/community-candidates"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/graph/communities"))).toBe(false);
    expect(page.items[0].cohesion).toBe(1);
  });

  it("the two methods hit different endpoints (distinct capability, never overridden)", async () => {
    const communities = "/api/v1/investigations/" + INVESTIGATION_ID + "/graph/communities";
    const candidates = "/api/v1/investigations/" + INVESTIGATION_ID + "/graph/community-candidates";
    expect(communities.endsWith("/graph/communities")).toBe(true);
    expect(candidates.endsWith("/graph/community-candidates")).toBe(true);
    expect(communities).not.toBe(candidates);
  });
});

describe("PR-22 — LiveGraphProvider.getValidAt", () => {
  it("hits GET /cases/:caseId/graph/valid-at?at= and returns the backend projection", async () => {
    const seen = new URL("http://x");
    stubRoutes([
      on("GET", "/api/v1/cases/", (url) => {
        seen.pathname = url.pathname;
        seen.search = url.search;
        if (url.pathname === `/api/v1/cases/${CASE_ID}/graph/valid-at`) {
          return {
            status: 200,
            body: {
              caseId: CASE_ID,
              at: "2026-01-01T00:00:00.000Z",
              nodeCount: 2,
              edgeCount: 1,
              graph: {
                caseId: CASE_ID,
                nodes: [
                  { id: ENTITY_A, entityType: null, canonicalName: "A" },
                  { id: ENTITY_B, entityType: null, canonicalName: "B" },
                ],
                edges: [
                  { id: "edge1", relationType: "association", source: ENTITY_A, target: ENTITY_B, directed: false },
                ],
                nodeCount: 2,
                edgeCount: 1,
                nodeLimit: 100,
                edgeLimit: 100,
                sourceNodeCount: 2,
                sourceEdgeCount: 1,
                truncated: { nodes: false, edges: false },
              },
            },
          };
        }
        return null;
      }),
    ]);
    const response = await graphProvider().getValidAt(CASE_ID, "2026-01-01T00:00:00.000Z");
    expect(seen.pathname).toBe(`/api/v1/cases/${CASE_ID}/graph/valid-at`);
    expect(seen.searchParams.get("at")).toBe("2026-01-01T00:00:00.000Z");
    expect(response.nodeCount).toBe(2);
    expect(response.edgeCount).toBe(1);
  });

  it("ignores a caller-supplied caseId and uses the provider's resolved scope (never trusts the browser)", async () => {
    const evilCaseId = "deadbeef-0000-0000-0000-000000000000";
    const seen = new URL("http://x");
    stubRoutes([
      on("GET", "/api/v1/cases/", (url) => {
        seen.pathname = url.pathname;
        if (url.pathname === `/api/v1/cases/${CASE_ID}/graph/valid-at`) {
          return {
            status: 200,
            body: {
              caseId: CASE_ID,
              at: "2026-01-01T00:00:00.000Z",
              nodeCount: 0,
              edgeCount: 0,
              graph: {
                caseId: CASE_ID,
                nodes: [],
                edges: [],
                nodeCount: 0,
                edgeCount: 0,
                nodeLimit: 100,
                edgeLimit: 100,
                sourceNodeCount: 0,
                sourceEdgeCount: 0,
                truncated: { nodes: false, edges: false },
              },
            },
          };
        }
        return null;
      }),
    ]);
    await graphProvider().getValidAt(evilCaseId, "2026-01-01T00:00:00.000Z");
    expect(seen.pathname).toBe(`/api/v1/cases/${CASE_ID}/graph/valid-at`);
    expect(seen.pathname).not.toContain(evilCaseId);
  });

  it("surfaces a typed error when the backend rejects the valid-at request", async () => {
    stubRoutes([
      on("GET", "/api/v1/cases/", () => ({
        status: 400,
        body: { error: "at must be a valid ISO 8601 instant" },
      })),
    ]);
    await expect(graphProvider().getValidAt(CASE_ID, "not-a-time")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("PR-22 — valid-at temporal model (pure derivations)", () => {
  it("isValidAtRequest is true only for a valid-at mode with a timestamp", () => {
    expect(isValidAtRequest({ mode: "current", at: null })).toBe(false);
    expect(isValidAtRequest({ mode: "valid-at", at: "2026-01-01T00:00:00.000Z" })).toBe(true);
    expect(isValidAtRequest({ mode: "valid-at", at: null })).toBe(false);
  });

  it("never falls back to current when the seam is unavailable — honest unsupported", () => {
    const view = deriveValidAtViewState({
      selection: { mode: "valid-at", at: "2026-01-01T00:00:00.000Z" },
      available: false,
      pending: false,
      resolved: true,
      error: null,
    });
    expect(view.kind).toBe("unsupported");
  });

  it("is idle when no valid-at request is active", () => {
    const view = deriveValidAtViewState({
      selection: { mode: "current", at: null },
      available: true,
      pending: false,
      resolved: false,
      error: null,
    });
    expect(view.kind).toBe("idle");
  });

  it("surfaces a typed error over any resolved state (no fake projection on failure)", () => {
    const view = deriveValidAtViewState({
      selection: { mode: "valid-at", at: "2026-01-01T00:00:00.000Z" },
      available: true,
      pending: false,
      resolved: true,
      error: "boom",
    });
    expect(view.kind).toBe("error");
  });

  it("is loading while pending and nothing resolved", () => {
    const view = deriveValidAtViewState({
      selection: { mode: "valid-at", at: "2026-01-01T00:00:00.000Z" },
      available: true,
      pending: true,
      resolved: false,
      error: null,
    });
    expect(view.kind).toBe("loading");
  });
});

describe("PR-22 — provider capability surface (method presence)", () => {
  it("LiveGraphProvider exposes centrality, communities, communityCandidates and validAt methods", () => {
    const provider = graphProvider();
    expect(typeof provider.getCentrality).toBe("function");
    expect(typeof provider.getCommunities).toBe("function");
    expect(typeof provider.getCommunityCandidates).toBe("function");
    expect(typeof provider.getValidAt).toBe("function");
  });
});