import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

// ============================================================================
// P4-PR2 Lead Lifecycle + Cross-Case HTTP endpoints — real express routes.
//
//   POST /investigations/:id/leads/generate
//   GET  /investigations/:id/leads
//   GET  /investigations/:id/leads/:leadId
//   POST /investigations/:id/leads/:leadId/evidence
//   POST /investigations/:id/leads/:leadId/status
//   GET  /investigations/:id/cross-case-links?targetCaseId=...
//   POST /investigations/:id/cross-case-links/generate?targetCaseId=...
//
// Topology (case 1): a single bridge C—D between two triangles, same
// structure as the PR1 candidate test, so /leads/generate should produce
// at least a BRIDGE lead and (given each triangle is dense) COMMUNITY leads.
//
// Cross-case: case 2 contains an entity with the SAME canonicalName+type as
// entity A in case 1 -> an exact-identity cross-case match.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "P4-PR2 Lead lifecycle + cross-case HTTP endpoints (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let server: Server;
    let baseUrl: string;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const targetInvestigationId = randomUUID();
    const targetCaseId = randomUUID();
    const sourceId = randomUUID();

    const A = randomUUID();
    const B = randomUUID();
    const C = randomUUID();
    const D = randomUUID();
    const E = randomUUID();
    const F = randomUUID();
    const A_MIRROR = randomUUID(); // same identity as A, in the target case
    const MANUAL_OBSERVATION_ID = randomUUID();

    function authHeader(token: string) {
      return { authorization: `Bearer ${token}` };
    }

    async function makeEntity(id: string, caseIdForEntity: string, investigationIdForEntity: string, name: string) {
      await prisma.entity.create({
        data: {
          id,
          identityKey: `test:${caseIdForEntity}:${id}`,
          caseId: caseIdForEntity,
          investigationId: investigationIdForEntity,
          canonicalName: name,
          entityType: "EMAIL",
          status: "ACTIVE",
          observationIds: [],
          hypothesisIds: [],
          provenance: { sourceId, extractor: "p4-pr2-test" },
        },
      });
    }

    async function makeRelation(params: { source: string; target: string; keySuffix: string }) {
      await prisma.relation.create({
        data: {
          id: randomUUID(),
          relationKey: `p4-pr2:${caseId}:${params.keySuffix}`,
          caseId,
          investigationId,
          sourceEntityId: params.source,
          targetEntityId: params.target,
          relationType: "association",
          directed: false,
          support: 0.6,
          evidenceBasis: [`obs-${params.keySuffix}`],
          contradictions: [],
          status: "ACTIVE",
          scoreModelVersion: "p4-pr2-test",
          evidenceCount: 1,
          provenance: { sourceId, extractor: "p4-pr2-test" },
          hypothesisId: randomUUID(),
        },
      });
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL!;
      process.env.INDAGO_DEV_ALLOWED_CASES = `${caseId},${targetCaseId}`;
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "LeadEvent"');
      await prisma.leadEvidenceLink.deleteMany({});
      await prisma.lead.deleteMany({});
      await prisma.relation.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});

      await prisma.investigationRun.create({
        data: { investigationId, caseId, status: "COMPLETED", state: "RESOLVED", contextData: { caseId } },
      });
      await prisma.investigationRun.create({
        data: {
          investigationId: targetInvestigationId,
          caseId: targetCaseId,
          status: "COMPLETED",
          state: "RESOLVED",
          contextData: { caseId: targetCaseId },
        },
      });

      await makeEntity(A, caseId, investigationId, "p4pr2-alice@example.org");
      await makeEntity(B, caseId, investigationId, "p4pr2-bob@example.org");
      await makeEntity(C, caseId, investigationId, "p4pr2-carol@example.org");
      await makeEntity(D, caseId, investigationId, "p4pr2-dave@example.org");
      await makeEntity(E, caseId, investigationId, "p4pr2-erin@example.org");
      await makeEntity(F, caseId, investigationId, "p4pr2-frank@example.org");
      // Same canonicalName + entityType as A, but in the TARGET case.
      await makeEntity(A_MIRROR, targetCaseId, targetInvestigationId, "p4pr2-alice@example.org");

      await makeRelation({ source: A, target: B, keySuffix: "ab" });
      await makeRelation({ source: B, target: C, keySuffix: "bc" });
      await makeRelation({ source: C, target: A, keySuffix: "ca" });
      await makeRelation({ source: C, target: D, keySuffix: "cd" }); // bridge
      await makeRelation({ source: D, target: E, keySuffix: "de" });
      await makeRelation({ source: E, target: F, keySuffix: "ef" });
      await makeRelation({ source: F, target: D, keySuffix: "fd" });

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
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "LeadEvent"');
      await prisma.leadEvidenceLink.deleteMany({});
      await prisma.lead.deleteMany({});
      await prisma.relation.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});
      await prisma.$disconnect();
    });

    let generatedLeadId: string;

    it("POST leads/generate creates structural leads from bridge/community candidates", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/generate`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { leadsCreated: number; candidatesConsidered: number };
      expect(body.candidatesConsidered).toBeGreaterThan(0);
      expect(body.leadsCreated).toBeGreaterThan(0);
    });

    it("POST leads/generate is idempotent: a second run creates nothing new", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/generate`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { leadsCreated: number; leadsAlreadyExisted: number };
      expect(body.leadsCreated).toBe(0);
      expect(body.leadsAlreadyExisted).toBeGreaterThan(0);
    });

    it("GET leads lists the generated leads, including a BRIDGE lead", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { leadCount: number; leads: { id: string; sourceCandidateType: string; alternativeExplanations: unknown[] }[] };
      expect(body.leadCount).toBeGreaterThan(0);
      const bridgeLead = body.leads.find((l) => l.sourceCandidateType === "BRIDGE");
      expect(bridgeLead).toBeDefined();
      expect(bridgeLead!.alternativeExplanations.length).toBeGreaterThan(0);
      generatedLeadId = bridgeLead!.id;
    });

    it("GET leads/:id returns the lead plus its events and evidence", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${generatedLeadId}`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { lead: { id: string; status: string }; events: { eventType: string }[] };
      expect(body.lead.id).toBe(generatedLeadId);
      expect(body.lead.status).toBe("NEW");
      expect(body.events.some((e) => e.eventType === "LEAD_CREATED")).toBe(true);
    });

    it("POST leads/:id/evidence attaches a FOR verdict and updates the lead + appends an event", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${generatedLeadId}/evidence`,
        {
          method: "POST",
          headers: { ...authHeader("demo-token"), "content-type": "application/json" },
          body: JSON.stringify({ observationId: MANUAL_OBSERVATION_ID, verdict: "FOR", rationale: "test attach" }),
        },
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { lead: { supportingObservationIds: string[] }; created: boolean };
      expect(body.created).toBe(true);
      expect(body.lead.supportingObservationIds).toContain(MANUAL_OBSERVATION_ID);

      const eventsRes = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${generatedLeadId}`,
        { headers: authHeader("demo-token") },
      );
      const eventsBody = (await eventsRes.json()) as { events: { eventType: string }[] };
      expect(eventsBody.events.some((e) => e.eventType === "EVIDENCE_ATTACHED")).toBe(true);
    });

    it("re-attaching the same evidence verdict is idempotent (200, not 201)", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${generatedLeadId}/evidence`,
        {
          method: "POST",
          headers: { ...authHeader("demo-token"), "content-type": "application/json" },
          body: JSON.stringify({ observationId: MANUAL_OBSERVATION_ID, verdict: "FOR" }),
        },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { created: boolean };
      expect(body.created).toBe(false);
    });

    it("POST leads/:id/status legally transitions NEW -> UNDER_REVIEW", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${generatedLeadId}/status`,
        {
          method: "POST",
          headers: { ...authHeader("demo-token"), "content-type": "application/json" },
          body: JSON.stringify({ toStatus: "UNDER_REVIEW" }),
        },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { lead: { status: string } };
      expect(body.lead.status).toBe("UNDER_REVIEW");
    });

    it("POST leads/:id/status rejects an illegal transition (409)", async () => {
      // UNDER_REVIEW -> PROMOTED is not a legal direct transition (must pass through ACTIVE).
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${generatedLeadId}/status`,
        {
          method: "POST",
          headers: { ...authHeader("demo-token"), "content-type": "application/json" },
          body: JSON.stringify({ toStatus: "PROMOTED" }),
        },
      );
      expect(res.status).toBe(409);
    });

    it("GET cross-case-links finds the exact-identity match between the two cases", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/cross-case-links?targetCaseId=${targetCaseId}`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { matchCount: number; matches: { sourceEntityId: string; targetEntityId: string; matchScore: number }[] };
      expect(body.matchCount).toBe(1);
      expect(body.matches[0]!.sourceEntityId).toBe(A);
      expect(body.matches[0]!.targetEntityId).toBe(A_MIRROR);
      expect(body.matches[0]!.matchScore).toBe(1.0);
    });

    it("GET cross-case-links 403s if the caller lacks access to the target case", async () => {
      const unauthorizedCase = randomUUID();
      const unauthorizedInvestigation = randomUUID();
      await prisma.investigationRun.create({
        data: {
          investigationId: unauthorizedInvestigation,
          caseId: unauthorizedCase,
          status: "COMPLETED",
          state: "RESOLVED",
          contextData: { caseId: unauthorizedCase },
        },
      });
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/cross-case-links?targetCaseId=${unauthorizedCase}`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(403);
      await prisma.investigationRun.deleteMany({ where: { investigationId: unauthorizedInvestigation } });
    });

    it("POST cross-case-links/generate persists a CROSS_CASE lead", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/cross-case-links/generate?targetCaseId=${targetCaseId}`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { leadsCreated: number };
      expect(body.leadsCreated).toBe(1);

      const leadsRes = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads?status=NEW`,
        { headers: authHeader("demo-token") },
      );
      const leadsBody = (await leadsRes.json()) as { leads: { sourceCandidateType: string }[] };
      expect(leadsBody.leads.some((l) => l.sourceCandidateType === "CROSS_CASE")).toBe(true);
    });

    it("all lead endpoints require authentication (401)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${investigationId}/leads`);
      expect(res.status).toBe(401);
    });
  },
);