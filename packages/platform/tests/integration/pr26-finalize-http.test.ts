import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

// ============================================================================
// PR-26 — Explicit run finalization (ANALYZING -> COMPLETED).
//
// Completion is deliberate and authorized, never automatic:
//   POST /investigations/:id/finalize
//
// The durable prerequisite check reads the IngestionAttempt registry:
//   - every expected evidence job must be SUCCEEDED,
//   - nothing may be QUEUED / RUNNING / FAILED,
//   - at least one attempt must exist.
// A run that is paused, terminal, or not ANALYZING is refused; the transition
// is a single guarded UPDATE so concurrent finalize calls complete once.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "PR-26 explicit run finalization (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let server: Server;
    let baseUrl: string;

    const caseAllowed = randomUUID();
    const caseForbidden = randomUUID();

    // Ready run: ANALYZING with two durably succeeded attempts.
    const invReady = randomUUID();
    const runReadyAttKeyA = "evidence-ready-a";
    const runReadyAttKeyB = "evidence-ready-b";

    // Pending run: one succeeded + one still queued.
    const invPending = randomUUID();

    // Failed run: one durably failed attempt.
    const invFailed = randomUUID();

    // Zero-work run: ANALYZING but no attempts at all.
    const invNoWork = randomUUID();

    // Already-terminal run.
    const invCompleted = randomUUID();

    // Paused run.
    const invPaused = randomUUID();

    // Forbidden-case run.
    const invForbidden = randomUUID();

    function authHeader(token: string) {
      return { authorization: `Bearer ${token}` };
    }

    async function createRun(investigationId: string, caseId: string, state: string, status: string) {
      return prisma.investigationRun.create({
        data: {
          investigationId,
          caseId,
          status,
          state,
          contextData: { caseId },
        },
      });
    }

    async function createAttempt(
      investigationId: string,
      caseId: string,
      idempotencyKey: string,
      status: string,
    ) {
      return prisma.ingestionAttempt.create({
        data: {
          investigationId,
          caseId,
          idempotencyKey,
          operationId: randomUUID(),
          correlationId: randomUUID(),
          attemptNumber: status === "QUEUED" ? 0 : 1,
          status,
        },
      });
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL!;
      process.env.INDAGO_DEV_ALLOWED_CASES = `${caseAllowed}`;
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });

      const allInvestigations = [
        invReady,
        invPending,
        invFailed,
        invNoWork,
        invCompleted,
        invPaused,
        invForbidden,
      ];
      await prisma.agentCheckpoint.deleteMany({
        where: { run: { investigationId: { in: allInvestigations } } },
      });
      await prisma.auditEvent.deleteMany({ where: { investigationId: { in: allInvestigations } } });
      await prisma.ingestionAttempt.deleteMany({ where: { investigationId: { in: allInvestigations } } });
      await prisma.investigationRun.deleteMany({ where: { investigationId: { in: allInvestigations } } });

      await createRun(invReady, caseAllowed, "ANALYZING", "RUNNING");
      await createAttempt(invReady, caseAllowed, runReadyAttKeyA, "SUCCEEDED");
      await createAttempt(invReady, caseAllowed, runReadyAttKeyB, "SUCCEEDED");

      await createRun(invPending, caseAllowed, "ANALYZING", "RUNNING");
      await createAttempt(invPending, caseAllowed, "evidence-pending-done", "SUCCEEDED");
      await createAttempt(invPending, caseAllowed, "evidence-pending-waiting", "QUEUED");

      await createRun(invFailed, caseAllowed, "ANALYZING", "RUNNING");
      await createAttempt(invFailed, caseAllowed, "evidence-failed", "FAILED");

      await createRun(invNoWork, caseAllowed, "ANALYZING", "RUNNING");

      await createRun(invCompleted, caseAllowed, "COMPLETED", "COMPLETED");

      await createRun(invPaused, caseAllowed, "ANALYZING", "PAUSED");
      await createAttempt(invPaused, caseAllowed, "evidence-paused-done", "SUCCEEDED");

      await createRun(invForbidden, caseForbidden, "ANALYZING", "RUNNING");
      await createAttempt(invForbidden, caseForbidden, "evidence-forbidden", "SUCCEEDED");

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
      const allInvestigations = [
        invReady,
        invPending,
        invFailed,
        invNoWork,
        invCompleted,
        invPaused,
        invForbidden,
      ];
      await prisma.agentCheckpoint.deleteMany({
        where: { run: { investigationId: { in: allInvestigations } } },
      });
      await prisma.auditEvent.deleteMany({ where: { investigationId: { in: allInvestigations } } });
      await prisma.ingestionAttempt.deleteMany({ where: { investigationId: { in: allInvestigations } } });
      await prisma.investigationRun.deleteMany({ where: { investigationId: { in: allInvestigations } } });
      await prisma.$disconnect();
    });

    it("finalizes a ready ANALYZING run exactly once (200, COMPLETED) with checkpoint + audit", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${invReady}/finalize`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { run: { state: string; status: string } };
      expect(body.run.state).toBe("COMPLETED");
      expect(body.run.status).toBe("COMPLETED");

      const run = await prisma.investigationRun.findUnique({ where: { investigationId: invReady } });
      expect(run?.state).toBe("COMPLETED");

      const checkpoints = await prisma.agentCheckpoint.count({ where: { runId: run!.id } });
      expect(checkpoints).toBe(1);

      const audit = await prisma.auditEvent.findFirst({
        where: { investigationId: invReady, targetType: "INVESTIGATION_RUN" },
      });
      expect(audit).not.toBeNull();
      expect(audit!.action).toBe("SYSTEM_ACTION");
      expect(audit!.description).toContain("finalized");
    });

    it("refuses to finalize an already COMPLETED run (409)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${invReady}/finalize`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("RUN_TERMINAL");
    });

    it("refuses while a QUEUED attempt remains (409 PREREQUISITES_UNMET)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${invPending}/finalize`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as {
        error: string;
        pendingCount: number;
        attemptCount: number;
      };
      expect(body.error).toBe("PREREQUISITES_UNMET");
      expect(body.pendingCount).toBe(1);
      expect(body.attemptCount).toBe(2);
    });

    it("refuses while a FAILED attempt exists — never fabricates success (409)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${invFailed}/finalize`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string; failedCount: number };
      expect(body.error).toBe("PREREQUISITES_UNMET");
      expect(body.failedCount).toBe(1);
    });

    it("refuses a run with no expected work registered (409)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${invNoWork}/finalize`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string; attemptCount: number };
      expect(body.error).toBe("PREREQUISITES_UNMET");
      expect(body.attemptCount).toBe(0);
    });

    it("refuses a PAUSED run — human pause wins (409)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${invPaused}/finalize`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("RUN_PAUSED");
    });

    it("refuses a terminal run (409 RUN_TERMINAL)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${invCompleted}/finalize`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("RUN_TERMINAL");
    });

    it("enforces the case boundary (403 fail-closed)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${invForbidden}/finalize`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(403);
    });

    it("requires authentication (401)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${invNoWork}/finalize`, {
        method: "POST",
      });
      expect(res.status).toBe(401);
    });

    it("404s on an unknown investigation", async () => {
      const res = await fetch(`${baseUrl}/api/v1/investigations/${randomUUID()}/finalize`, {
        method: "POST",
        headers: authHeader("demo-token"),
      });
      expect(res.status).toBe(404);
    });
  },
);
