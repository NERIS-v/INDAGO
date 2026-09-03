import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Server, AddressInfo } from "node:http";
import express from "express";

// ============================================================================
// M-A10 HARDENING Fix 7 — worker→HTTP real transport + Fix 4b dangling
// endpoint invariant, over the AUTHORITATIVE test DB.
//
// The M-A10 worker (completeMA10 in src/queue/ingest-evidence.ts) proposes
// RelationHypotheses ONLY over durable, case-scoped canonical Entity rows +
// Observation rows (it never fabricates an EntityId). This suite:
//   1. seeds exactly that durable precondition (canonical Entity + Observation)
//      on case scoped to this test;
//   2. replays the worker's own durable-write circuit for the proposed relation
//      hypotheses (the SAME relationHypothesisStore.upsertHypothesis the worker
//      calls), producing PROPOSED rows over real persisted canonical EntityIds;
//   3. Fix 4b INVARIANT: every proposed hypothesis sourceEntityId/targetEntityId
//      MUST exist as a row in Entity (no dangling endpoints) — a direct
//      structural audit of the decoupled (no-FK) design;
//   4. drives the REAL express apiRouter (demo-token; INDAGO_DEV_ALLOWED_CASES
//      grants this suite's case) to ACCEPT / REJECT / REVERSE and to read the
//      Graphology endpoints — proving the worker-persisted relations surface
//      through the HTTP review + graph surface end to end.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A10 HARDENING worker→HTTP real transport + Fix 4b dangling-endpoint invariant (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let server: Server;
    let baseUrl: string;

    const investigationId = randomUUID();
    const caseId = randomUUID();

    // Two durable canonical entities for the case (post-M-A09.5 materialization
    // durable precondition: REAL persisted EntityIds — never fabricated).
    const entityA = randomUUID();
    const entityB = randomUUID();
    const entityC = randomUUID();

    // Observation ids referenced by evidenceBasis / contradictions.
    const obsA = randomUUID();
    const obsB = randomUUID();

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

      // Case-scoped canonical entities (durable-first, real EntityIds).
      const entityRows = [
        { id: entityA, name: "w2h-alice@example.org" },
        { id: entityB, name: "w2h-bob@example.org" },
        { id: entityC, name: "w2h-carol@example.org" },
      ];
      for (const e of entityRows) {
        await prisma.entity.create({
          data: {
            id: e.id,
            identityKey: `w2h:${caseId}:${e.id}`,
            caseId,
            investigationId,
            canonicalName: e.name,
            entityType: "EMAIL",
            status: "ACTIVE",
            observationIds: [],
            hypothesisIds: [],
            provenance: { extractor: "m-a10-fix7" },
          },
        });
      }

      // Durable observations the relation evidence basis points at (M-A10 reads
      // durable Observation rows; evidenceBasis references real observation ids).
      const evidenceSourceId = randomUUID();
      const evidenceArtifactId = randomUUID();
      const evidenceId = randomUUID();
      await prisma.evidence.create({
        data: {
          id: evidenceId,
          investigationId,
          caseId,
          operationId: `w2h-${caseId}`,
          sourceName: "M-A10 Fix 7",
          evidenceType: "COMMUNICATION",
          title: "w2h fixture",
          artifactId: evidenceArtifactId,
          sourceId: null,
        },
      });
      const provenance = {
        sourceId: evidenceSourceId,
        artifactId: evidenceArtifactId,
        extractor: "m-a10-fix7",
      };
      for (const [id, idx] of [
        [obsA, 0],
        [obsB, 1],
      ] as const) {
        await prisma.observation.create({
          data: {
            id,
            identityKey: `w2h:${caseId}:obs:${idx}`,
            evidenceId: evidenceId,
            sourceId: evidenceSourceId,
            investigationId,
            caseId,
            type: "COMMUNICATION",
            content: `observation-${idx}`,
            strength: 0.7,
            candidateMentions: [],
            provenance,
            entityIds: [],
          },
        });
      }

      // Replay the M-A10 worker's durable-write circuit for proposed relation
      // hypotheses over the REAL canonical EntityIds above. This is the same
      // relationHypothesisStore.upsertHypothesis that completeMA10 calls; the
      // rows are the durable PROPOSED state a worker pass would have produced.
      const { RelationHypothesisStore } = await import(
        "../../src/persistence/relation-hypothesis-store.js"
      );
      const {
        buildRelationHypothesisIdentityKey,
        deterministicRelationHypothesisId,
        RELATION_SCORE_MODEL_VERSION,
      } = await import("@indago/relation-resolution");

      const relationStore = new RelationHypothesisStore(prisma);

      const pairs: Array<{
        sourceEntityId: string;
        targetEntityId: string;
        relationType: string;
        directed: boolean;
        support: number;
      }> = [
        { sourceEntityId: entityA, targetEntityId: entityB, relationType: "association", directed: false, support: 0.8 },
        { sourceEntityId: entityB, targetEntityId: entityC, relationType: "family", directed: true, support: 0.75 },
        { sourceEntityId: entityC, targetEntityId: entityA, relationType: "ownership", directed: true, support: 0.3 },
      ];

      for (const p of pairs) {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: p.sourceEntityId,
          targetEntityId: p.targetEntityId,
          relationType: p.relationType,
          directed: p.directed,
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
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
          evidenceBasis: [obsA, obsB],
          contradictions: [],
          status: "PROPOSED",
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          evidenceCount: 2,
          evidenceStrength: p.support,
          sourceCoverage: 1,
          temporalCoverage: 1,
          directed: p.directed,
          provenance: { sourceId: evidenceSourceId, artifactId: evidenceArtifactId, extractor: "m-a10-fix7" },
        });
        // Deterministic identity must have produced the exact computed id.
        expect(result.hypothesis.id).toBe(id);
      }

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

    it("Fix 4b INVARIANT: every proposed hypothesis endpoint exists in Entity (no dangling)", async () => {
      const hypotheses = await prisma.relationHypothesis.findMany({ where: { caseId } });
      expect(hypotheses.length).toBeGreaterThanOrEqual(2);

      const entityIds = new Set(
        (await prisma.entity.findMany({ where: { caseId } })).map((e) => e.id),
      );
      for (const h of hypotheses) {
        expect(entityIds.has(h.sourceEntityId)).toBe(true);
        expect(entityIds.has(h.targetEntityId)).toBe(true);
      }
    });

    it("POST /relation-hypotheses/:id/accept materializes an ACTIVE canonical Relation over real EntityIds", async () => {
      const { deterministicRelationHypothesisId, RELATION_SCORE_MODEL_VERSION } = await import(
        "@indago/relation-resolution"
      );
      const hypId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA,
        targetEntityId: entityB,
        relationType: "association",
        directed: false,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });

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
      expect(canonical!.relationType).toBe("association");
    });

    it("re-accepting the same hypothesis is refused (409) and idempotent — no duplicate canonical relation", async () => {
      const { deterministicRelationHypothesisId, RELATION_SCORE_MODEL_VERSION } = await import(
        "@indago/relation-resolution"
      );
      const hypId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA,
        targetEntityId: entityB,
        relationType: "association",
        directed: false,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });

      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relation-hypotheses/${hypId}/accept`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(409);

      const canonicalCount = await prisma.relation.count({
        where: { caseId, sourceEntityId: entityA, targetEntityId: entityB, relationType: "association" },
      });
      expect(canonicalCount).toBe(1);
    });

    it("POST /relation-hypotheses/:id/reject produces no canonical relation (durable REJECTED)", async () => {
      const { deterministicRelationHypothesisId, RELATION_SCORE_MODEL_VERSION } = await import(
        "@indago/relation-resolution"
      );
      const hypId = await deterministicRelationHypothesisId({
        sourceEntityId: entityC,
        targetEntityId: entityA,
        relationType: "ownership",
        directed: true,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });

      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relation-hypotheses/${hypId}/reject`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; hypothesisId: string };
      expect(body.status).toBe("REJECTED");

      const canonicalCount = await prisma.relation.count({
        where: { caseId, sourceEntityId: entityC, targetEntityId: entityA, relationType: "ownership" },
      });
      expect(canonicalCount).toBe(0);

      const stored = await prisma.relationHypothesis.findUnique({ where: { id: hypId } });
      expect(stored?.status).toBe("REJECTED");
    });

    it("POST /relation-hypotheses/:id/reverse flips the accepted relation to REVERSED (kept)", async () => {
      const { deterministicRelationHypothesisId, RELATION_SCORE_MODEL_VERSION } = await import(
        "@indago/relation-resolution"
      );
      const hypId = await deterministicRelationHypothesisId({
        sourceEntityId: entityB,
        targetEntityId: entityC,
        relationType: "family",
        directed: true,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      // Accept it first.
      await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relation-hypotheses/${hypId}/accept`,
        { method: "POST", headers: authHeader("demo-token") },
      );

      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/relation-hypotheses/${hypId}/reverse`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);

      const stored = await prisma.relationHypothesis.findUnique({ where: { id: hypId } });
      expect(stored?.status).toBe("REVERSED");

      const canonical = await prisma.relation.findFirst({
        where: { caseId, sourceEntityId: entityB, targetEntityId: entityC, relationType: "family" },
      });
      expect(canonical?.status).toBe("REVERSED");
    });

    it("GET /graph surfaces only ACTIVE canonical relations (REJECTED/REVERSED excluded)", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        nodeCount: number;
        edgeCount: number;
        graph: { nodes: string[]; edges: { source: string; target: string }[] };
      };
      // The three canonical entities are all nodes.
      expect(body.nodeCount).toBe(3);
      expect(body.graph.nodes).toContain(entityA);
      expect(body.graph.nodes).toContain(entityB);
      expect(body.graph.nodes).toContain(entityC);
      // Only ONE ACTIVE edge remains (A—B association). The reject (C→A) never
      // created a canonical relation, and the reverse (B→C) flipped it to
      // REVERSED, so edgeCount must be 1 — not 2.
      expect(body.edgeCount).toBe(1);
      expect(body.graph.edges.some((e) => e.source === entityA && e.target === entityB)).toBe(true);
    });

    it("GET traversal / centrality / communities respond 200 from the accepted relation", async () => {
      const head = authHeader("demo-token");
      const traversal = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/traversal?startEntityId=${entityA}&hops=2`,
        { headers: head },
      );
      expect(traversal.status).toBe(200);

      const centrality = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/centrality`,
        { headers: head },
      );
      expect(centrality.status).toBe(200);
      const cbody = (await centrality.json()) as { centrality: { nodeId: string; degree: number }[] };
      // Both A and B are incident to the sole ACTIVE edge → degree 1.
      const a = cbody.centrality.find((c) => c.nodeId === entityA);
      const b = cbody.centrality.find((c) => c.nodeId === entityB);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a!.degree).toBe(1);
      expect(b!.degree).toBe(1);

      const communities = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/communities`,
        { headers: head },
      );
      expect(communities.status).toBe(200);
    });

    it("denies a foreign case the demo principal was not granted (403, fail-closed)", async () => {
      const foreignRun = randomUUID();
      const foreignCase = randomUUID();
      await prisma.investigationRun.create({
        data: {
          investigationId: foreignRun,
          caseId: foreignCase,
          status: "COMPLETED",
          state: "RESOLVED",
          contextData: { caseId: foreignCase },
        },
      });
      const foreignEntity = randomUUID();
      await prisma.entity.create({
        data: {
          id: foreignEntity,
          identityKey: `w2h:${foreignCase}:${foreignEntity}`,
          caseId: foreignCase,
          investigationId: foreignRun,
          canonicalName: "foreign-fix7@example.org",
          entityType: "EMAIL",
          status: "ACTIVE",
          observationIds: [],
          hypothesisIds: [],
          provenance: { sourceId: randomUUID(), extractor: "m-a10-fix7" },
        },
      });

      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${foreignRun}/graph`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(403);

      await prisma.entity.deleteMany({ where: { caseId: foreignCase } });
      await prisma.investigationRun.deleteMany({ where: { caseId: foreignCase } });
      await prisma.evidence.deleteMany({ where: { caseId: foreignCase } });
      await prisma.observation.deleteMany({ where: { caseId: foreignCase } });
    });
  },
);