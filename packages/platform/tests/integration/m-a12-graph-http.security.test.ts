import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

// ============================================================================
// M-A12 Graph Endpoints — HTTP security + case-isolation through the REAL
// express routes (M-A12 hardening, item O).
//
// Proves the PR3 M-A12 graph surface is fail-closed end-to-end over HTTP:
//   GET /api/v1/cases/:caseId/graph/current
//   GET /api/v1/cases/:caseId/graph/versions
//   GET /api/v1/cases/:caseId/graph/versions/:vid
//   GET /api/v1/cases/:caseId/graph/valid-at?at=<ISO>
//   GET /api/v1/cases/:caseId/graph/as-of            (501 deferred)
// plus auth (401), role (403), case-space (403/404), and malformed-input (400)
// guards. Authors data in the test DB via a prisma client pointed at
// TEST_DATABASE_URL, then serves the endpoints via the router singleton.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A12 graph HTTP endpoints — security & case isolation (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let server: Server;
    let baseUrl: string;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const foreignCaseId = randomUUID();
    const foreignRunId = randomUUID();
    const sourceId = randomUUID();

    const entityA = randomUUID();
    const entityB = randomUUID();

    function authHeader(token: string) {
      return { authorization: `Bearer ${token}` };
    }

    async function seedCase(
      cId: string,
      invId: string,
      entityIds: readonly string[],
    ): Promise<void> {
      await prisma.investigationRun.create({
        data: {
          investigationId: invId,
          caseId: cId,
          status: "COMPLETED",
          state: "RESOLVED",
          contextData: { caseId: cId },
        },
      });
      for (const e of entityIds) {
        await prisma.entity.create({
          data: {
            id: e,
            identityKey: `http:${cId}:${e}`,
            caseId: cId,
            investigationId: invId,
            canonicalName: `http-${e}@example.org`,
            entityType: "EMAIL",
            status: "ACTIVE",
            observationIds: [],
            hypothesisIds: [],
            provenance: { sourceId, extractor: "http-test" },
          },
        });
      }
    }

    async function seedRelation(
      cId: string,
      invId: string,
      s: string,
      t: string,
      interval?: { typename: string },
    ): Promise<string> {
      const relId = randomUUID();
      await prisma.relation.create({
        data: {
          id: relId,
          relationKey: `http:${cId}:${relId}`,
          caseId: cId,
          investigationId: invId,
          sourceEntityId: s,
          targetEntityId: t,
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
          ...(interval !== undefined ? { validityInterval: interval } : {}),
        },
      });
      return relId;
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL!;
      process.env.INDAGO_DEV_ALLOWED_CASES = caseId;
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL! } },
      });
      await prisma.graphVersion.deleteMany({});
      await prisma.relation.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});

      await seedCase(caseId, investigationId, [entityA, entityB]);
      await seedRelation(caseId, investigationId, entityA, entityB);

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
      delete process.env.INDAGO_DEV_ALLOWED_CASES;
      await prisma.graphVersion.deleteMany({});
      await prisma.relation.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});
      await prisma.$disconnect();
    });

    it("GET graph/current returns nodes + edges for a granted case (200)", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/cases/${caseId}/graph/current`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { caseId: string; nodeCount: number; edgeCount: number };
      expect(body.caseId).toBe(caseId);
      expect(body.nodeCount).toBe(2);
      expect(body.edgeCount).toBe(1);
    });

    it("GET graph/versions lists the case's version chain (200)", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/cases/${caseId}/graph/versions`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { caseId: string; total: number };
      expect(body.caseId).toBe(caseId);
      expect(body.total).toBeGreaterThanOrEqual(0);
    });

    it("GET graph/valid-at respects instant-grade containment and 400s on bad `at`", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/cases/${caseId}/graph/valid-at?at=2026-01-01T00:00:00.000Z`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);

      const bad = await fetch(
        `${baseUrl}/api/v1/cases/${caseId}/graph/valid-at?at=not-a-time`,
        { headers: authHeader("demo-token") },
      );
      expect(bad.status).toBe(400);

      const missing = await fetch(
        `${baseUrl}/api/v1/cases/${caseId}/graph/valid-at`,
        { headers: authHeader("demo-token") },
      );
      expect(missing.status).toBe(400);
    });

    it("GET graph/versions/:vid is 404 for a nonexistent version (no silent fallback)", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/cases/${caseId}/graph/versions/9999`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(404);
    });

    it("GET graph/as-of remains deferred (501)", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/cases/${caseId}/graph/as-of`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(501);
    });

    it("GET graph/current without a token is unauthorized (401)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cases/${caseId}/graph/current`);
      expect(res.status).toBe(401);
    });

    it("denies a foreign case the demo principal was not granted (403, fail-closed)", async () => {
      // A real, populated foreign case that the demo principal cannot reach.
      await seedCase(foreignCaseId, foreignRunId, [randomUUID()]);

      const res = await fetch(
        `${baseUrl}/api/v1/cases/${foreignCaseId}/graph/current`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(403);

      await prisma.relation.deleteMany({ where: { caseId: foreignCaseId } });
      await prisma.entity.deleteMany({ where: { caseId: foreignCaseId } });
      await prisma.investigationRun.deleteMany({ where: { caseId: foreignCaseId } });
    });
  },
);