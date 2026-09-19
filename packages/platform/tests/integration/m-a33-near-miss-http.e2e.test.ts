import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Server, AddressInfo } from "node:http";
import express from "express";

// ============================================================================
// PR-33 — durable NEAR_MISS surfaced through the REAL HTTP surface.
//
// The worker's below-threshold, source-grounded relation pairs now persist as
// durable NEAR_MISS RelationHypothesis rows. This suite drives the REAL express
// apiRouter (demo-token; INDAGO_DEV_ALLOWED_CASES grants this suite's case)
// over the AUTHORITATIVE test DB to prove the PR-33 durability contract end to
// end through HTTP:
//
//   - GET /investigations/:id/relations                  → all lifecycle grades
//   - GET /investigations/:id/relations?status=NEAR_MISS → ONLY near-miss rows
//       (the new PR-33 query seam that makes "could-have-been relations"
//       inspectable — the PR-32 P4 gap, fixed WITHOUT moving the 0.25 bar)
//   - GET ...?status=BOGUS                               → 400 (validated)
//   - POST .../relations-hypotheses/:id/accept on a NEAR_MISS row → 409:
//       a below-threshold derivation is authority-inert — the machine never
//       auto-accepts it and a human cannot force it through the lifecycle;
//   - GET /graph → the NEAR_MISS pair is NEVER a graph edge (edges are
//       canonical, ACCEPTED relations only).
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "PR-33 NEAR_MISS durability through the HTTP surface (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let server: Server;
    let baseUrl: string;

    const investigationId = randomUUID();
    const caseId = randomUUID();

    // Canonical entities for the case.
    const entityA = randomUUID();
    const entityB = randomUUID();
    const entityX = randomUUID();
    const entityY = randomUUID();

    // Durable hypothesis ids (deterministic — same inputs as the worker),
    // published in beforeAll for the accept/lifecycle tests.
    let seededIds: Record<string, string> = {};

    function authHeader(token: string) {
      return { authorization: `Bearer ${token}` };
    }

    async function cleanup() {
      await prisma.relation.deleteMany({ where: { caseId } });
      await prisma.relationHypothesis.deleteMany({ where: { caseId } });
      await prisma.entity.deleteMany({ where: { caseId } });
      await prisma.observation.deleteMany({ where: { caseId } });
      await prisma.evidence.deleteMany({ where: { caseId } });
      await prisma.investigationRun.deleteMany({ where: { caseId } });
    }

    beforeAll(async () => {
      // Override the app datasource BEFORE importing routes so the singleton
      // db/store read the authoritative test DB. Fail-closed auth: grant the
      // demo principal ONLY this suite's own case.
      process.env.DATABASE_URL = TEST_DATABASE_URL!;
      process.env.INDAGO_DEV_ALLOWED_CASES = caseId;

      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL! } },
      });
      await cleanup();

      // Durable run that owns the timeline/resolution for this case.
      await prisma.investigationRun.create({
        data: {
          investigationId,
          caseId,
          status: "COMPLETED",
          state: "ANALYZING",
          contextData: { caseId },
        },
      });

      // Four case-scoped canonical entities (durable-first, real EntityIds).
      const entityRows = [
        { id: entityA, name: "nm-http-a@example.org" },
        { id: entityB, name: "nm-http-b@example.org" },
        { id: entityX, name: "nm-http-x@example.org" },
        { id: entityY, name: "nm-http-y@example.org" },
      ];
      for (const e of entityRows) {
        await prisma.entity.create({
          data: {
            id: e.id,
            identityKey: `nm-http:${caseId}:${e.id}`,
            caseId,
            investigationId,
            canonicalName: e.name,
            entityType: "EMAIL",
            status: "ACTIVE",
            observationIds: [],
            hypothesisIds: [],
            provenance: { extractor: "m-a33-nm-http" },
          },
        });
      }

      // Durable evidence + one observation the evidenceBasis references.
      const evidenceSourceId = randomUUID();
      const evidenceArtifactId = randomUUID();
      const evidenceId = randomUUID();
      const obsId = randomUUID();
      await prisma.evidence.create({
        data: {
          id: evidenceId,
          investigationId,
          caseId,
          operationId: `nm-http-${caseId}`,
          sourceName: "PR-33 NEAR_MISS HTTP",
          evidenceType: "FINANCIAL",
          title: "nm-http fixture",
          artifactId: evidenceArtifactId,
          sourceId: null,
        },
      });
      await prisma.observation.create({
        data: {
          id: obsId,
          identityKey: `nm-http:${caseId}:obs:0`,
          evidenceId,
          sourceId: evidenceSourceId,
          investigationId,
          caseId,
          type: "FINANCIAL",
          content: "balance 42000.00",
          strength: 0.7,
          candidateMentions: [],
          provenance: { sourceId: evidenceSourceId, artifactId: evidenceArtifactId, extractor: "m-a33-nm-http" },
          entityIds: [],
        },
      });

      // Seed the durable hypothesis rows through the worker's own store (the
      // exact upsertHypothesis completeMA10 calls) — one PROPOSED authority
      // candidate and TWO NEAR_MISS derivations at 0.20 / 0.21, below the
      // UNCHANGED 0.25 proposal threshold.
      const { db } = await import("../../src/db/prisma.js");
      const { RelationHypothesisStore } = await import(
        "../../src/persistence/relation-hypothesis-store.js"
      );
      const {
        buildRelationHypothesisIdentityKey,
        deterministicRelationHypothesisId,
        RELATION_SCORE_MODEL_VERSION,
      } = await import("@indago/relation-resolution");

      const relationStore = new RelationHypothesisStore(db);

      const pairs: Array<{
        sourceEntityId: string;
        targetEntityId: string;
        relationType: string;
        directed: boolean;
        support: number;
        status: "PROPOSED" | "NEAR_MISS";
      }> = [
        { sourceEntityId: entityA, targetEntityId: entityB, relationType: "association", directed: false, support: 0.8, status: "PROPOSED" },
        { sourceEntityId: entityX, targetEntityId: entityY, relationType: "other", directed: false, support: 0.2, status: "NEAR_MISS" },
        { sourceEntityId: entityA, targetEntityId: entityX, relationType: "other", directed: false, support: 0.21, status: "NEAR_MISS" },
      ];

      // (assignable box so the deterministic ids are visible to the tests)
      const ids: Record<string, string> = {};
      for (const p of pairs) {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: p.sourceEntityId,
          targetEntityId: p.targetEntityId,
          relationType: p.relationType,
          directed: p.directed,
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        ids[`${p.sourceEntityId}|${p.targetEntityId}`] = id;
        const result = await relationStore.upsertHypothesis({
          id,
          identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: p.sourceEntityId,
            targetEntityId: p.targetEntityId,
            relationType: p.relationType,
            directed: p.directed,
            scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId,
          investigationId,
          sourceEntityId: p.sourceEntityId,
          targetEntityId: p.targetEntityId,
          relationType: p.relationType,
          support: p.support,
          evidenceBasis: [obsId],
          contradictions: [],
          status: p.status,
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          evidenceCount: 1,
          evidenceStrength: p.support,
          sourceCoverage: 1,
          temporalCoverage: 1,
          directed: p.directed,
          provenance: { sourceId: evidenceSourceId, artifactId: evidenceArtifactId, extractor: "m-a33-nm-http" },
        });
        expect(result.hypothesis.status).toBe(p.status);
      }
      seededIds = ids;

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
      await cleanup();
      await prisma.$disconnect();
    });

    it("GET /relations (unfiltered) returns every lifecycle grade without a status field", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relations`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        count: number;
        status?: string;
        relations: { status: string; sourceEntityId: string; targetEntityId: string }[];
      };
      expect(body.count).toBe(3);
      expect(body.status).toBeUndefined();
      expect(body.relations.map((r) => r.status).sort()).toEqual([
        "NEAR_MISS",
        "NEAR_MISS",
        "PROPOSED",
      ]);
    });

    it("GET /relations?status=NEAR_MISS narrows to exactly the durable near-miss rows", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relations?status=NEAR_MISS`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        count: number;
        status: string;
        relations: { status: string; sourceEntityId: string; targetEntityId: string }[];
      };
      expect(body.status).toBe("NEAR_MISS");
      expect(body.count).toBe(2);
      expect(body.relations.length).toBe(2);
      for (const r of body.relations) expect(r.status).toBe("NEAR_MISS");
    });

    it("GET /relations?status=PROPOSED narrows to the authority candidate only", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relations?status=PROPOSED`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        count: number;
        status: string;
        relations: { status: string }[];
      };
      expect(body.status).toBe("PROPOSED");
      expect(body.count).toBe(1);
      expect(body.relations[0]!.status).toBe("PROPOSED");
    });

    it("GET /relations?status=<invalid> is refused with 400 and the allowed vocabulary", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relations?status=BOGUS`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; detail: string };
      expect(body.error).toBe("Invalid relation status filter");
      for (const s of ["PROPOSED", "ACCEPTED", "REJECTED", "REVERSED", "NEAR_MISS"]) {
        expect(body.detail).toContain(s);
      }
    });

    it("accepting the PROPOSED candidate materializes an ACTIVE canonical relation", async () => {
      const hypId = seededIds[`${entityA}|${entityB}`]!;

      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relation-hypotheses/${hypId}/accept`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        relationId: string;
        hypothesisId: string;
        status: string;
        materialized: boolean;
      };
      expect(body.hypothesisId).toBe(hypId);
      expect(body.status).toBe("ACCEPTED");
      expect(body.materialized).toBe(true);

      const canonical = await prisma.relation.findUnique({
        where: { id: body.relationId },
      });
      expect(canonical).not.toBeNull();
      expect(canonical!.status).toBe("ACTIVE");
      expect(canonical!.sourceEntityId).toBe(entityA);
      expect(canonical!.targetEntityId).toBe(entityB);
    });

    it("accepting a NEAR_MISS row is refused (409 HYPOTHESIS_NOT_PROPOSED) and never materializes", async () => {
      const hypId = seededIds[`${entityX}|${entityY}`]!;

      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relation-hypotheses/${hypId}/accept`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe("HYPOTHESIS_NOT_PROPOSED");

      // The near-miss row is untouched, still NEAR_MISS.
      const stored = await prisma.relationHypothesis.findUnique({
        where: { id: hypId },
      });
      expect(stored?.status).toBe("NEAR_MISS");

      // No canonical relation ever materialized for the near-miss pair.
      const canonicalForPair = await prisma.relation.count({
        where: {
          caseId,
          OR: [
            { sourceEntityId: entityX, targetEntityId: entityY },
            { sourceEntityId: entityY, targetEntityId: entityX },
          ],
        },
      });
      expect(canonicalForPair).toBe(0);
    });

    it("GET /graph shows exactly the accepted edge — the NEAR_MISS pair is never an edge", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        nodeCount: number;
        edgeCount: number;
        graph: { nodes: { id: string }[]; edges: { source: string; target: string }[] };
      };
      // All four canonical entities are nodes.
      expect(body.nodeCount).toBe(4);
      for (const id of [entityA, entityB, entityX, entityY]) {
        expect(body.graph.nodes.map((n) => n.id)).toContain(id);
      }
      // Only the ACCEPTED A-B association is an edge — 1, not 3.
      expect(body.edgeCount).toBe(1);
      expect(
        body.graph.edges.some(
          (e) =>
            (e.source === entityA && e.target === entityB) ||
            (e.source === entityB && e.target === entityA),
        ),
      ).toBe(true);
      // Neither near-miss pair is connected.
      for (const [s, t] of [
        [entityX, entityY],
        [entityA, entityX],
      ] as const) {
        expect(
          body.graph.edges.some(
            (e) =>
              (e.source === s && e.target === t) ||
              (e.source === t && e.target === s),
          ),
        ).toBe(false);
      }
    });
  },
);