import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Server, AddressInfo } from "node:http";
import express from "express";

// ============================================================================
// M-A10 Graph Projection — HTTP smoke test through the REAL express routes.
//
// Proves the four Graphology endpoints read the AUTHORITATIVE test DB (via the
// app's DATABASE_URL singleton, overridden to TEST_DATABASE_URL before import)
// and serve a real, case-isolated graph:
//   GET /investigations/:id/graph
//   GET /investigations/:id/graph/traversal?startEntityId=...
//   GET /investigations/:id/graph/centrality
//   GET /investigations/:id/graph/communities
// plus auth (401) and not-found (404) guards.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A10 Graph runtime HTTP endpoints (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let server: Server;
    let baseUrl: string;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const sourceId = randomUUID();

    const entityA = randomUUID();
    const entityB = randomUUID();
    const entityC = randomUUID();

    function authHeader(token: string) {
      return { authorization: `Bearer ${token}` };
    }

    beforeAll(async () => {
      // Override the app datasource BEFORE importing routes or constructing
      // Prisma so the Graphology runtime reads the authoritative test DB.
      process.env.DATABASE_URL = TEST_DATABASE_URL!;
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL! } },
      });
      await prisma.relation.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});

      await prisma.investigationRun.create({
        data: {
          investigationId,
          caseId,
          status: "COMPLETED",
          state: "RESOLVED",
          contextData: { caseId },
        },
      });

      // Three canonical entities for the case.
      const entityRows = [
        { id: entityA, name: "http-alice@example.org" },
        { id: entityB, name: "http-bob@example.org" },
        { id: entityC, name: "http-carol@example.org" },
      ];
      for (const e of entityRows) {
        await prisma.entity.create({
          data: {
            id: e.id,
            identityKey: `test:${caseId}:${e.id}`,
            caseId,
            investigationId,
            canonicalName: e.name,
            entityType: "EMAIL",
            status: "ACTIVE",
            observationIds: [],
            hypothesisIds: [],
            provenance: { extractor: "http-test" },
          },
        });
      }

      // Two ACTIVE canonical relations: A—B (association, undirected), B→C (family, directed).
      const relAB = randomUUID();
      const relBC = randomUUID();
      await prisma.relation.create({
        data: {
          id: relAB,
          relationKey: `http:${caseId}:ab`,
          caseId,
          investigationId,
          sourceEntityId: entityA,
          targetEntityId: entityB,
          relationType: "association",
          directed: false,
          support: 0.6,
          evidenceBasis: [],
          contradictions: [],
          status: "ACTIVE",
          scoreModelVersion: "http-test",
          evidenceCount: 1,
          provenance: { sourceId, extractor: "http-test" },
          hypothesisId: randomUUID(),
        },
      });
      await prisma.relation.create({
        data: {
          id: relBC,
          relationKey: `http:${caseId}:bc`,
          caseId,
          investigationId,
          sourceEntityId: entityB,
          targetEntityId: entityC,
          relationType: "family",
          directed: true,
          support: 0.6,
          evidenceBasis: [],
          contradictions: [],
          status: "ACTIVE",
          scoreModelVersion: "http-test",
          evidenceCount: 1,
          provenance: { sourceId, extractor: "http-test" },
          hypothesisId: randomUUID(),
        },
      });

      const { apiRouter } = await import("../../src/api/routes.js");

      const app = express();
      app.use(express.json());
      app.use("/api/v1", apiRouter);
      server = app.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      });
      await new Promise<void>((resolve) => server.once("listening", resolve));
    }, 120_000);

    afterAll(async () => {
      server?.close();
      await prisma.relation.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});
      await prisma.$disconnect();
    });

    it("GET graph returns nodes + ACTIVE edges for the case", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        nodeCount: number;
        edgeCount: number;
        graph: { nodes: string[]; edges: { id: string; source: string; target: string; directed: boolean }[] };
      };
      expect(body.nodeCount).toBe(3);
      expect(body.edgeCount).toBe(2);
      expect(body.graph.nodes).toContain(entityA);
      expect(body.graph.nodes).toContain(entityB);
      expect(body.graph.nodes).toContain(entityC);
    });

    it("GET traversal returns bounded N-hop paths from a canonical entity", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/traversal?startEntityId=${entityA}&hops=1`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { pathCount: number; paths: { startNodeId: string; hopCount: number }[] };
      expect(body.pathCount).toBeGreaterThan(0);
      expect(body.paths.every((p) => p.startNodeId === entityA)).toBe(true);
      expect(body.paths.every((p) => p.hopCount <= 1)).toBe(true);
    });

    it("GET centrality returns degree rank", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/centrality`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { centrality: { nodeId: string; degree: number }[] };
      // B is incident to both edges → degree 2, the max.
      const bob = body.centrality.find((c) => c.nodeId === entityB);
      expect(bob).toBeDefined();
      expect(bob!.degree).toBe(2);
    });

    it("GET communities returns deterministic Louvain groups covering all entities", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/communities`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { communities: { memberNodeIds: string[] }[] };
      const memberIds = new Set(body.communities.flatMap((c) => [...c.memberNodeIds]));
      expect(memberIds.has(entityA)).toBe(true);
      expect(memberIds.has(entityB)).toBe(true);
      expect(memberIds.has(entityC)).toBe(true);
    });

    it("GET graph for a nonexistent investigation returns 404", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${randomUUID()}/graph`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(404);
    });

    it("GET graph without a valid token is unauthorized (401)", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph`,
        // No authorization header → requireAuth returns 401.
      );
      expect(res.status).toBe(401);
    });
  },
);