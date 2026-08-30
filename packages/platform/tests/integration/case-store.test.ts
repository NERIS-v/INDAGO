import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CaseSchema } from "@indago/contracts";
import { CaseStore } from "../../src/persistence/case-store.js";

// ============================================================================
// P-09 CaseStore — REAL round-trips against TEST_DATABASE_URL.
//
// Purpose: prove the durable Case catalogue boundary (auto-provisioning,
// read-time reconciliation, read-time derived counts) end-to-end against real
// Postgres, mirroring the M-A06 ObservationStore suite conventions. Requires
// `TEST_DATABASE_URL` to be set and the schema pushed; the whole suite skips
// cleanly when unset.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "P-09 CaseStore integration (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let store: CaseStore;

    // Distinct boundaries so cleanup never touches other suites' rows.
    const caseA = randomUUID();
    const caseB = randomUUID();

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      store = new CaseStore(prisma);
      await prisma.case.deleteMany({ where: { id: { in: [caseA, caseB] } } });
      await prisma.investigationRun.deleteMany({ where: { caseId: { in: [caseA, caseB] } } });
      await prisma.evidence.deleteMany({ where: { caseId: { in: [caseA, caseB] } } });
    });

    afterAll(async () => {
      await prisma.case.deleteMany({ where: { id: { in: [caseA, caseB] } } });
      await prisma.investigationRun.deleteMany({ where: { caseId: { in: [caseA, caseB] } } });
      await prisma.evidence.deleteMany({ where: { caseId: { in: [caseA, caseB] } } });
      await prisma.$disconnect();
    });

    async function makeRun(
      runCaseId: string,
      investigationId: string,
      createdAt: Date,
    ): Promise<void> {
      await prisma.investigationRun.create({
        data: {
          investigationId,
          caseId: runCaseId,
          status: "QUEUED",
          state: "CREATED",
          contextData: { caseId: runCaseId },
          createdAt,
          updatedAt: createdAt,
        },
      });
    }

    async function makeEvidenceRunFor(
      runCaseId: string,
      investigationId: string,
    ): Promise<void> {
      await prisma.evidence.create({
        data: {
          id: randomUUID(),
          investigationId,
          caseId: runCaseId,
          operationId: randomUUID(),
          sourceName: "Ledger Export",
          evidenceType: "FINANCIAL",
          title: "Ledger",
          artifactId: randomUUID(),
        },
      });
    }

    it("ensureCase provisions a Case row with standard platform defaults, idempotently", async () => {
      await store.ensureCase(caseA, "usr_demo_123");
      const row = await prisma.case.findUnique({ where: { id: caseA } });
      expect(row).not.toBeNull();
      expect(row!.title).toBe(`Case ${caseA}`);
      expect(row!.status).toBe("OPEN");
      expect(row!.assignedTo).toBe("usr_demo_123");

      // Second provision must be a no-op (create-or-nothing), not a duplicate.
      await store.ensureCase(caseA, "someone-else");
      const rows = await prisma.case.findMany({ where: { id: caseA } });
      expect(rows).toHaveLength(1);
      expect(rows[0].assignedTo).toBe("usr_demo_123");
    });

    it("reconcile backfills a legacy run's case boundary with the UNASSIGNED assignee", async () => {
      const legacyCaseId = randomUUID();
      const legacyInvestigationId = randomUUID();
      try {
        await makeRun(legacyCaseId, legacyInvestigationId, new Date());

        expect(await prisma.case.findUnique({ where: { id: legacyCaseId } })).toBeNull();
        const created = await store.reconcile();
        expect(created).toBeGreaterThan(0);

        const row = await prisma.case.findUnique({ where: { id: legacyCaseId } });
        expect(row).not.toBeNull();
        expect(row!.title).toBe(`Case ${legacyCaseId}`);
        expect(row!.status).toBe("OPEN");
        expect(row!.assignedTo).toBe("UNASSIGNED");

        // Idempotent: a second pass does not re-create.
        expect(await store.reconcile()).toBe(0);
      } finally {
        await prisma.investigationRun.deleteMany({ where: { caseId: legacyCaseId } });
        await prisma.case.deleteMany({ where: { id: legacyCaseId } });
      }
    });

    it("listCases reassembles canonical Case objects with read-time derived counts", async () => {
      const inv1 = randomUUID();
      const inv2 = randomUUID();
      const earlier = new Date("2026-01-01T00:00:00.000Z");
      const later = new Date("2026-01-02T00:00:00.000Z");
      await store.ensureCase(caseB, "usr_demo_123");
      await makeRun(caseB, inv1, earlier);
      await makeRun(caseB, inv2, later);
      await makeEvidenceRunFor(caseB, inv1);

      const cases = await store.listCases();
      const row = cases.find((c) => c.id === caseB);
      expect(row).toBeDefined();
      // Latest-run first: [0] is the primary investigation for the CaseCard.
      expect(row!.investigationIds).toEqual([inv2, inv1]);
      expect(row!.evidenceIds).toHaveLength(1);
      expect(row!.entityIds).toEqual([]);
      expect(row!.sourceIds).toEqual([]);

      // Every listed row conforms to the strict canonical CaseSchema — there
      // is no second, drifting case shape.
      for (const c of cases) {
        expect(() => CaseSchema.parse(c)).not.toThrow();
      }
    });
  },
);