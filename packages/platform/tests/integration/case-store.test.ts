import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
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
    const caseC = randomUUID();

    // Deterministic content hashes for the shared / private artifact fixtures.
    function contentHashOf(input: string): string {
      return createHash("sha256").update(input, "utf8").digest("hex");
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      store = new CaseStore(prisma);
      await prisma.case.deleteMany({ where: { id: { in: [caseA, caseB, caseC] } } });
      await prisma.investigationRun.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.evidence.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.observation.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.source.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.ingestionAttempt.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.rawExtraction.deleteMany({
        where: { attempt: { caseId: { in: [caseA, caseB, caseC] } } },
      });
      await prisma.artifact.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
    });

    afterAll(async () => {
      await prisma.case.deleteMany({ where: { id: { in: [caseA, caseB, caseC] } } });
      await prisma.investigationRun.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.evidence.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.observation.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.source.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.ingestionAttempt.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
      await prisma.rawExtraction.deleteMany({
        where: { attempt: { caseId: { in: [caseA, caseB, caseC] } } },
      });
      await prisma.artifact.deleteMany({ where: { caseId: { in: [caseA, caseB, caseC] } } });
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
      artifactId: string = randomUUID(),
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
          artifactId,
        },
      });
    }

    async function makeEvidenceReturnId(
      runCaseId: string,
      investigationId: string,
      artifactId: string,
    ): Promise<string> {
      const id = randomUUID();
      await prisma.evidence.create({
        data: {
          id,
          investigationId,
          caseId: runCaseId,
          operationId: randomUUID(),
          sourceName: "Ledger Export",
          evidenceType: "FINANCIAL",
          title: "Ledger",
          artifactId,
        },
      });
      return id;
    }

    async function makeArtifactRow(
      id: string,
      contentHash: string,
      runCaseId: string,
      investigationId: string,
    ): Promise<void> {
      await prisma.artifact.create({
        data: {
          id,
          contentHash,
          storagePath: `/tmp/artifacts/${id}.txt`,
          detectedMimeType: "text/plain",
          declaredMimeType: "text/plain",
          originalFilename: `${id}.txt`,
          contentSizeBytes: 13,
          sourceType: "UPLOADTHING",
          sourceId: randomUUID(),
          investigationId,
          caseId: runCaseId,
          operationId: randomUUID(),
          correlationId: randomUUID(),
          idempotencyKey: `evidence-${investigationId}-${id}`,
          hashVerified: true,
          mimeVerified: true,
          providerMetadata: { fileKey: `${id}.txt` },
        },
      });
    }

    async function makeSourceRow(
      runCaseId: string,
      investigationId: string,
    ): Promise<string> {
      const sourceId = randomUUID();
      await prisma.source.create({
        data: {
          id: sourceId,
          caseId: runCaseId,
          investigationId,
          catalog: "FINANCIAL",
          name: "Ledger Export",
        },
      });
      return sourceId;
    }

    async function makeObservationRow(
      runCaseId: string,
      investigationId: string,
      evidenceId: string,
      sourceId: string,
      artifactId: string,
    ): Promise<void> {
      await prisma.observation.create({
        data: {
          id: randomUUID(),
          identityKey: randomUUID(),
          evidenceId,
          sourceId,
          investigationId,
          caseId: runCaseId,
          type: "FINANCIAL",
          content: "balance 42000.00",
          strength: 0.7,
          candidateMentions: ["42000.00"],
          provenance: {
            sourceId,
            artifactId,
            extractor: "observation-extractor@1.0.0",
          },
          entityIds: [],
        },
      });
    }

    async function makeAttemptRow(
      runCaseId: string,
      investigationId: string,
      artifactId: string,
      sourceId: string,
    ): Promise<string> {
      const attemptId = randomUUID();
      await prisma.ingestionAttempt.create({
        data: {
          id: attemptId,
          investigationId,
          caseId: runCaseId,
          idempotencyKey: `evidence-${investigationId}-${attemptId}.txt`,
          operationId: randomUUID(),
          correlationId: randomUUID(),
          attemptNumber: 1,
          status: "SUCCEEDED",
          sourceId,
          artifactId,
          parserId: "txt-parser",
          parserVersion: "1.0.0",
          format: "TXT",
        },
      });
      return attemptId;
    }

    async function makeRawExtractionRow(
      attemptId: string,
      artifactId: string,
    ): Promise<void> {
      await prisma.rawExtraction.create({
        data: {
          attemptId,
          artifactId,
          parserId: "txt-parser",
          parserVersion: "1.0.0",
          format: "TXT",
          extraction: {
            raw: "fixture bytes",
            sourceReference: {
              kind: "txt-line",
              detail: { lineNumber: 1, charStart: 0, charEnd: 13 },
            },
          },
          extractedAt: new Date(),
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

    it("deleteCase removes the boundary and case-scoped rows, keeps shared artifacts, GCs private ones", async () => {
      const invA = randomUUID();
      const invB = randomUUID();
      const sharedArtifactId = randomUUID();
      const sharedHash = contentHashOf("same-bytes-both-cases");
      const privateArtifactId = randomUUID();
      const privateHash = contentHashOf("private-to-caseA");

      await store.ensureCase(caseA, "usr_demo_123");
      await store.ensureCase(caseB, "usr_demo_123");
      // Terminal run so deleteCase's active-run guard is not tripped.
      await prisma.investigationRun.create({
        data: {
          investigationId: invA,
          caseId: caseA,
          status: "COMPLETED",
          state: "TERMINATED",
          contextData: { caseId: caseA },
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      // Global content-addressing: one Artifact row per content hash. The
      // shared address is referenced by BOTH cases' evidence; the private one
      // only by caseA.
      await makeArtifactRow(sharedArtifactId, sharedHash, caseA, invA);
      await makeArtifactRow(privateArtifactId, privateHash, caseA, invA);

      const sourceA = await makeSourceRow(caseA, invA);
      const evSharedA = await makeEvidenceReturnId(caseA, invA, sharedArtifactId);
      await makeEvidenceRunFor(caseA, invA, privateArtifactId);
      await makeObservationRow(caseA, invA, evSharedA, sourceA, sharedArtifactId);
      const attemptId = await makeAttemptRow(caseA, invA, sharedArtifactId, sourceA);
      await makeRawExtractionRow(attemptId, sharedArtifactId);
      // caseB evidence references the SAME shared artifact row (across cases).
      await makeEvidenceRunFor(caseB, invB, sharedArtifactId);

      const result = await store.deleteCase(caseA);
      expect(result).toEqual({ outcome: "deleted", caseId: caseA });

      // Case boundary + every case-scoped durable row is gone.
      expect(await prisma.case.findUnique({ where: { id: caseA } })).toBeNull();
      expect(
        await prisma.investigationRun.count({ where: { caseId: caseA } }),
      ).toBe(0);
      expect(await prisma.evidence.count({ where: { caseId: caseA } })).toBe(0);
      // Observation is the deepest cascade link — its absence proves the
      // dependency-ordered delete walked the full tree.
      expect(await prisma.observation.count({ where: { caseId: caseA } })).toBe(0);
      expect(await prisma.source.count({ where: { caseId: caseA } })).toBe(0);
      expect(
        await prisma.ingestionAttempt.count({ where: { caseId: caseA } }),
      ).toBe(0);
      // RawExtraction is cascade-removed with its attempt.
      expect(
        await prisma.rawExtraction.count({ where: { attempt: { caseId: caseA } } }),
      ).toBe(0);

      // Artifact GC: the PRIVATE content address is orphaned and freed…
      expect(await prisma.artifact.findUnique({ where: { id: privateArtifactId } })).toBeNull();
      // …while the SHARED address survives — caseB still references it.
      expect(await prisma.artifact.findUnique({ where: { id: sharedArtifactId } })).not.toBeNull();

      // Deleting the LAST referencing case frees the shared address too. The
      // earlier listCases test left QUEUED runs on caseB — settle them to a
      // terminal status first (mirrors deleting only finished cases).
      await prisma.investigationRun.updateMany({
        where: { caseId: caseB },
        data: { status: "COMPLETED" },
      });
      const resultB = await store.deleteCase(caseB);
      expect(resultB).toEqual({ outcome: "deleted", caseId: caseB });
      expect(await prisma.artifact.findUnique({ where: { id: sharedArtifactId } })).toBeNull();
    });

    it("deleteCase reports not_found for an unknown case boundary", async () => {
      const missing = randomUUID();
      const result = await store.deleteCase(missing);
      expect(result).toEqual({ outcome: "not_found", caseId: missing });
    });

    it("deleteCase refuses while the case has an active investigation run", async () => {
      await store.ensureCase(caseC, "usr_demo_123");
      const invActive = randomUUID();
      await prisma.investigationRun.create({
        data: {
          investigationId: invActive,
          caseId: caseC,
          status: "RUNNING",
          state: "CREATED",
          contextData: { caseId: caseC },
        },
      });

      const result = await store.deleteCase(caseC);
      expect(result).toEqual({ outcome: "active_runs", caseId: caseC });

      // The refusal is a no-op transaction: nothing was removed.
      expect(await prisma.case.findUnique({ where: { id: caseC } })).not.toBeNull();
      expect(
        await prisma.investigationRun.count({ where: { caseId: caseC } }),
      ).toBe(1);
    });
  },
);