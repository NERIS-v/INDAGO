import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

// ============================================================================
// P4 Graph Analytics Candidate Endpoints — HTTP smoke test through the REAL
// express routes, mirroring the M-A10 graph-http suite's seeding style
// (direct Prisma rows, no full hypothesis pipeline — these are read-only
// analytics over already-canonical entities/relations).
//
//   GET /investigations/:id/graph/bridges
//   GET /investigations/:id/graph/bursts
//   GET /investigations/:id/graph/community-candidates
//   GET /investigations/:id/graph/paths?from=...&to=...
//
// Topology seeded: two triangles {A,B,C} and {D,E,F} joined by a single
// bridge edge C—D. This exercises:
//   - bridges: C—D is the sole bridge; triangle edges are not bridges.
//   - community-candidates: both triangles are dense (cohesion 1.0) — surfaced.
//   - paths: A -> F must route through the C—D bridge.
//   - bursts: F's three edges (to D, and the triangle edges) all share one
//     dense timestamp cluster -> a burst window for F.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "P4 Graph Analytics Candidate HTTP endpoints (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let server: Server;
    let baseUrl: string;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const sourceId = randomUUID();

    const A = randomUUID();
    const B = randomUUID();
    const C = randomUUID();
    const D = randomUUID();
    const E = randomUUID();
    const F = randomUUID();

    function authHeader(token: string) {
      return { authorization: `Bearer ${token}` };
    }

    async function makeRelation(params: {
      source: string;
      target: string;
      relationType: string;
      directed: boolean;
      keySuffix: string;
      validFromIso?: string;
    }) {
      await prisma.relation.create({
        data: {
          id: randomUUID(),
          relationKey: `p4:${caseId}:${params.keySuffix}`,
          caseId,
          investigationId,
          sourceEntityId: params.source,
          targetEntityId: params.target,
          relationType: params.relationType,
          directed: params.directed,
          support: 0.6,
          evidenceBasis: [],
          contradictions: [],
          status: "ACTIVE",
          scoreModelVersion: "p4-test",
          evidenceCount: 1,
          provenance: { sourceId, extractor: "p4-test" },
          hypothesisId: randomUUID(),
          validityInterval: params.validFromIso
            ? {
                validFrom: { value: params.validFromIso, precision: "exact" },
                precision: "exact",
                semantics: "observed",
              }
            : undefined,
        },
      });
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL!;
      process.env.INDAGO_DEV_ALLOWED_CASES = caseId;
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
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

      const entities = [
        { id: A, name: "p4-alice@example.org" },
        { id: B, name: "p4-bob@example.org" },
        { id: C, name: "p4-carol@example.org" },
        { id: D, name: "p4-dave@example.org" },
        { id: E, name: "p4-erin@example.org" },
        { id: F, name: "p4-frank@example.org" },
      ];
      for (const e of entities) {
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
            provenance: { extractor: "p4-test" },
          },
        });
      }

      // Triangle 1: A-B-C (dense).
      await makeRelation({ source: A, target: B, relationType: "association", directed: false, keySuffix: "ab" });
      await makeRelation({ source: B, target: C, relationType: "association", directed: false, keySuffix: "bc" });
      await makeRelation({ source: C, target: A, relationType: "association", directed: false, keySuffix: "ca" });

      // Bridge: C-D (the only connection between the two triangles).
      await makeRelation({
        source: C,
        target: D,
        relationType: "association",
        directed: false,
        keySuffix: "cd",
        validFromIso: "2024-06-01T00:00:00.000Z",
      });

      // Triangle 2: D-E-F (dense), with dense same-day timestamps on F's
      // incident edges to create a burst window for F.
      await makeRelation({
        source: D,
        target: E,
        relationType: "association",
        directed: false,
        keySuffix: "de",
      });
      await makeRelation({
        source: E,
        target: F,
        relationType: "association",
        directed: false,
        keySuffix: "ef",
        validFromIso: "2024-07-15T09:00:00.000Z",
      });
      await makeRelation({
        source: F,
        target: D,
        relationType: "association",
        directed: false,
        keySuffix: "fd",
        validFromIso: "2024-07-15T10:00:00.000Z",
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
      delete process.env.INDAGO_DEV_ALLOWED_CASES;
      await prisma.relation.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});
      await prisma.$disconnect();
    });

    it("GET graph/bridges identifies the sole C—D bridge and excludes triangle edges", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/bridges`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        bridgeCount: number;
        bridges: { nodeIds: [string, string]; bridgeImpact: number }[];
      };
      expect(body.bridgeCount).toBe(1);
      const [x, y] = body.bridges[0]!.nodeIds;
      expect(new Set([x, y])).toEqual(new Set([C, D]));
      expect(body.bridges[0]!.bridgeImpact).toBe(3);
    });

    it("GET graph/bridges rejects malformed maxResults (400)", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/bridges?maxResults=abc`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(400);
    });

    it("GET graph/community-candidates surfaces both dense triangles", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/community-candidates`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        candidateCount: number;
        candidates: { size: number; cohesion: number }[];
      };
      expect(body.candidateCount).toBeGreaterThanOrEqual(1);
      for (const c of body.candidates) {
        expect(c.cohesion).toBeGreaterThan(0);
      }
    });

    it("GET graph/paths finds a path from A to F routed through the bridge", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/paths?from=${A}&to=${F}`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        pathCount: number;
        paths: { nodes: { nodeId: string }[] }[];
      };
      expect(body.pathCount).toBeGreaterThan(0);
      const nodeIds = body.paths[0]!.nodes.map((n) => n.nodeId);
      expect(nodeIds).toContain(C);
      expect(nodeIds).toContain(D);
    });

    it("GET graph/paths rejects non-UUID from/to (400)", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/paths?from=not-a-uuid&to=${F}`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(400);
    });

    it("GET graph/bursts returns a well-formed, bounded burst list", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/bursts`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        burstCount: number;
        bursts: { nodeId: string; eventCount: number }[];
      };
      expect(body.burstCount).toBeGreaterThanOrEqual(0);
      for (const b of body.bursts) {
        expect(b.eventCount).toBeGreaterThan(0);
      }
    });

    it("all four P4 endpoints require authentication (401)", async () => {
      for (const path of ["graph/bridges", "graph/bursts", "graph/community-candidates", `graph/paths?from=${A}&to=${F}`]) {
        const res = await fetch(`${baseUrl}/api/v1/investigations/${investigationId}/${path}`);
        expect(res.status).toBe(401);
      }
    });

    it("all four P4 endpoints 404 on an unknown investigation", async () => {
      const unknown = randomUUID();
      for (const path of ["graph/bridges", "graph/bursts", "graph/community-candidates", `graph/paths?from=${A}&to=${F}`]) {
        const res = await fetch(
          `${baseUrl}/api/v1/investigations/${unknown}/${path}`,
          { headers: authHeader("demo-token") },
        );
        expect(res.status).toBe(404);
      }
    });
  },
);
