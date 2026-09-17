// ============================================================================
// PR-23 — HTTP BOUNDARY VERIFICATION (Network live realignment)
//
// Verifies the server-side API client (`@/lib/api/server`) constructs the
// correct platform HTTP routes (path, method, query string) for the network /
// graph surfaces that PR-23 makes live-served. This is a pure boundary test:
// fetch is stubbed at the network edge; no platform runs here.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const INV = "550e8400-e29b-41d4-a716-446655440020";
const CASE = "case-042";

function ok(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

async function load() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  process.env.AUTH_TOKEN = "test-token";
  return import("@/lib/api/server");
}

describe("PR-23 HTTP boundary — network & graph endpoints", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listTemporalBursts → GET /investigations/:id/graph/bursts (authoritative Pulse input)", async () => {
    const server = await load();
    mockFetch.mockResolvedValue(
      ok({ investigationId: INV, caseId: CASE, burstCount: 0, bursts: [] }),
    );
    await server.listTemporalBursts(INV);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/investigations/${INV}/graph/bursts`,
      expect.anything(),
    );
  });

  it("getGraphCentrality → GET /investigations/:id/graph/centrality, bounded maxResults query", async () => {
    const server = await load();
    mockFetch.mockResolvedValue(
      ok({ investigationId: INV, caseId: CASE, centrality: [] }),
    );
    await server.getGraphCentrality(INV, 25);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/investigations/${INV}/graph/centrality?maxResults=25`,
      expect.anything(),
    );
  });

  it("getGraphCommunities → GET /investigations/:id/graph/communities (authoritative, distinct from candidates)", async () => {
    const server = await load();
    mockFetch.mockResolvedValue(
      ok({ investigationId: INV, caseId: CASE, communityCount: 0, communities: [] }),
    );
    await server.getGraphCommunities(INV);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/investigations/${INV}/graph/communities`,
      expect.anything(),
    );
  });

  it("getGraphValidAt → GET /cases/:caseId/graph/valid-at?at=<ISO> (case-scoped, never client-supplied investigation)", async () => {
    const server = await load();
    const at = "2024-06-01T12:00:00.000Z";
    mockFetch.mockResolvedValue(
      ok({
        caseId: CASE,
        at,
        nodeCount: 0,
        edgeCount: 0,
        graph: { nodes: [], edges: [], version: 1 },
      }),
    );
    await server.getGraphValidAt(CASE, at);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/cases/${CASE}/graph/valid-at?at=${encodeURIComponent(at)}`,
      expect.anything(),
    );
  });

  it("traverseGraph → GET /investigations/:id/graph/traversal?startEntityId&hops&maxPaths", async () => {
    const server = await load();
    mockFetch.mockResolvedValue(
      ok({ investigationId: INV, caseId: CASE, startEntityId: "ent-1", pathCount: 0, paths: [] }),
    );
    await server.traverseGraph(INV, "ent-1", 3, 5);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/investigations/${INV}/graph/traversal?startEntityId=ent-1&hops=3&maxPaths=5`,
      expect.anything(),
    );
  });

  it("listConnectingPaths → GET /investigations/:id/graph/paths?from&to&hops (Flow input)", async () => {
    const server = await load();
    mockFetch.mockResolvedValue(
      ok({ investigationId: INV, caseId: CASE, from: "ent-a", to: "ent-b", pathCount: 0, paths: [] }),
    );
    await server.listConnectingPaths(INV, "ent-a", "ent-b", 4);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/investigations/${INV}/graph/paths?from=ent-a&to=ent-b&hops=4`,
      expect.anything(),
    );
  });

  it("canonical-relations (accepted graph edges) → GET /investigations/:id/canonical-relations", async () => {
    const server = await load();
    mockFetch.mockResolvedValue(
      ok({ investigationId: INV, caseId: CASE, count: 0, relations: [] }),
    );
    await server.listCanonicalRelations(INV);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/investigations/${INV}/canonical-relations`,
      expect.anything(),
    );
  });

  it("listCrossCaseLinks → GET /investigations/:id/cross-case-links?targetCaseId (Matrix input)", async () => {
    const server = await load();
    mockFetch.mockResolvedValue(
      ok({ investigationId: INV, caseId: CASE, targetCaseId: "case-7", count: 0, links: [] }),
    );
    await server.listCrossCaseLinks(INV, "case-7");
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/investigations/${INV}/cross-case-links?targetCaseId=case-7`,
      expect.anything(),
    );
  });

  it("attaches the Bearer auth header to the network endpoints (server-side token only)", async () => {
    const server = await load();
    mockFetch.mockResolvedValue(
      ok({ investigationId: INV, caseId: CASE, burstCount: 0, bursts: [] }),
    );
    await server.listTemporalBursts(INV);
    const [, init] = mockFetch.mock.calls[0] ?? [];
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });
});