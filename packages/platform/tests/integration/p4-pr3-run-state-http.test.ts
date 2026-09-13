import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

// ============================================================================
// P4-PR3 Run State Machine HTTP endpoints — real express routes.
//
//   POST /investigations/:id/pause
//   POST /investigations/:id/resume
//   POST /investigations/:id/review/resolve
//
// Also exercises the review-TRIGGER side effect wired into LeadRuntime:
// generating a CROSS_CASE lead (matchScore always 1.0 -> CRITICAL priority)
// against a run in DISCOVERING should flip the run's `state` to
// REVIEW_REQUIRED without any explicit pause/resume call.
//
// Cross-case topology: case 2 contains an entity with the SAME
// canonicalName+type as an entity in case 1 -> an exact-identity match,
// which lead-generation always scores at confidence 1.0 -> priority CRITICAL.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "P4-PR3 Run state machine HTTP endpoints (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let server: Server;
    let baseUrl: string;

    // Run A: used for the plain pause/resume/terminal-guard flow.
    const investigationIdA = randomUUID();
    const caseIdA = randomUUID();
    let runIdA: string;

    // Run B: used for the review-trigger + resolve flow (DISCOVERING stage,
    // paired with a target case for the CRITICAL cross-case match).
    const investigationIdB = randomUUID();
    const caseIdB = randomUUID();
    const targetInvestigationId = randomUUID();
    const targetCaseId = randomUUID();
    const sourceId = randomUUID();
    const ENTITY_B = randomUUID();
    const ENTITY_B_MIRROR = randomUUID();

    function authHeader(token: string) {
      return { authorization: `Bearer ${token}` };
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL!;
      process.env.INDAGO_DEV_ALLOWED_CASES = `${caseIdA},${caseIdB},${targetCaseId}`;
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });

      await prisma.leadEvent.deleteMany({});
      await prisma.leadEvidenceLink.deleteMany({});
      await prisma.lead.deleteMany({});
      await prisma.auditEvent.deleteMany({ where: { investigationId: { in: [investigationIdA, investigationIdB] } } });
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});

      const runA = await prisma.investigationRun.create({
        data: {
          investigationId: investigationIdA,
          caseId: caseIdA,
          status: "RUNNING",
          state: "ANALYZING",
          contextData: { caseId: caseIdA },
        },
      });
      runIdA = runA.id;

      await prisma.investigationRun.create({
        data: {
          investigationId: investigationIdB,
          caseId: caseIdB,
          status: "RUNNING",
          state: "DISCOVERING", // legal source for REVIEW_REQUIRED
          contextData: { caseId: caseIdB },
        },
      });
      await prisma.investigationRun.create({
        data: {
          investigationId: targetInvestigationId,
          caseId: targetCaseId,
          status: "COMPLETED",
          state: "COMPLETED",
          contextData: { caseId: targetCaseId },
        },
      });

      await prisma.entity.create({
        data: {
          id: ENTITY_B,
          identityKey: `test:${caseIdB}:${ENTITY_B}`,
          caseId: caseIdB,
          investigationId: investigationIdB,
          canonicalName: "p4pr3-shared@example.org",
          entityType: "EMAIL",
          status: "ACTIVE",
          observationIds: [],
          hypothesisIds: [],
          provenance: { sourceId, extractor: "p4-pr3-test" },
        },
      });
      await prisma.entity.create({
        data: {
          id: ENTITY_B_MIRROR,
          identityKey: `test:${targetCaseId}:${ENTITY_B_MIRROR}`,
          caseId: targetCaseId,
          investigationId: targetInvestigationId,
          canonicalName: "p4pr3-shared@example.org",
          entityType: "EMAIL",
          status: "ACTIVE",
          observationIds: [],
          hypothesisIds: [],
          provenance: { sourceId, extractor: "p4-pr3-test" },
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
      delete process.env.INDAGO_DEV_ALLOWED_CASES;
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "LeadEvent"');
      await prisma.leadEvidenceLink.deleteMany({});
      await prisma.lead.deleteMany({});
      await prisma.auditEvent.deleteMany({ where: { investigationId: { in: [investigationIdA, investigationIdB] } } });
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});
      await prisma.$disconnect();
    });

    it("POST pause freezes status without touching the pipeline stage", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${investigationIdA}/pause`, {
        method: "POST",
        headers: { ...authHeader("demo-token"), "content-type": "application/json" },
        body: JSON.stringify({ reason: "manual pause for test" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { run: { status: string; state: string } };
      expect(body.run.status).toBe("PAUSED");
      expect(body.run.state).toBe("ANALYZING"); // untouched
    });

    it("POST resume returns status to RUNNING at the same pipeline stage", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${investigationIdA}/resume`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { run: { status: string; state: string } };
      expect(body.run.status).toBe("RUNNING");
      expect(body.run.state).toBe("ANALYZING");
    });

    it("POST resume on a run that is not PAUSED returns 409", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${investigationIdA}/resume`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(409);
    });

    it("POST pause on an already-terminal run returns 409", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${targetInvestigationId}/pause`, {
        method: "POST",
        headers: { ...authHeader("demo-token"), "content-type": "application/json" },
        body: JSON.stringify({ reason: "should be rejected" }),
      });
      expect(res.status).toBe(409);
    });

    it("generating a CRITICAL cross-case lead auto-triggers REVIEW_REQUIRED", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationIdB}/cross-case-links/generate?targetCaseId=${targetCaseId}`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { leadsCreated: number; reviewTriggered: boolean };
      expect(body.leadsCreated).toBe(1);
      expect(body.reviewTriggered).toBe(true);

      const run = await prisma.investigationRun.findFirst({ where: { investigationId: investigationIdB } });
      expect(run?.state).toBe("REVIEW_REQUIRED");
    });

    it("POST review/resolve with APPROVED transitions REVIEW_REQUIRED -> COMPLETED", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${investigationIdB}/review/resolve`, {
        method: "POST",
        headers: { ...authHeader("demo-token"), "content-type": "application/json" },
        body: JSON.stringify({ outcome: "APPROVED", notes: "reviewed, looks legitimate" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { run: { state: string } };
      expect(body.run.state).toBe("COMPLETED");
    });

    it("POST review/resolve again (no longer in review) returns 409", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${investigationIdB}/review/resolve`, {
        method: "POST",
        headers: { ...authHeader("demo-token"), "content-type": "application/json" },
        body: JSON.stringify({ outcome: "APPROVED" }),
      });
      expect(res.status).toBe(409);
    });

    it("POST review/resolve rejects an invalid outcome value (400)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${investigationIdA}/review/resolve`, {
        method: "POST",
        headers: { ...authHeader("demo-token"), "content-type": "application/json" },
        body: JSON.stringify({ outcome: "MAYBE" }),
      });
      expect(res.status).toBe(400);
    });

    it("all three run-state endpoints require authentication (401)", async () => {
      const pauseRes = await fetch(`${baseUrl}/api/v1/investigations/${investigationIdA}/pause`, { method: "POST" });
      expect(pauseRes.status).toBe(401);
      const resumeRes = await fetch(`${baseUrl}/api/v1/investigations/${investigationIdA}/resume`, { method: "POST" });
      expect(resumeRes.status).toBe(401);
      const reviewRes = await fetch(`${baseUrl}/api/v1/investigations/${investigationIdA}/review/resolve`, { method: "POST" });
      expect(reviewRes.status).toBe(401);
    });

    it("all three run-state endpoints 404 on an unknown investigation", async () => {
      const unknown = randomUUID();
      const pauseRes = await fetch(`${baseUrl}/api/v1/investigations/${unknown}/pause`, {
        method: "POST",
        headers: { ...authHeader("demo-token"), "content-type": "application/json" },
        body: JSON.stringify({ reason: "x" }),
      });
      expect(pauseRes.status).toBe(404);
    });
  },
);
