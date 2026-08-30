import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ObservationSchema, type Observation } from "@indago/contracts";
import { buildObservationIdentityKey, serializeSourceLocation } from "@indago/ingestion";
import { ObservationStore, deterministicEvidenceId } from "../../src/persistence/observation-store.js";
import type {
  SourceWriteRecord,
  EvidenceWriteRecord,
} from "../../src/persistence/observation-store.js";

// ============================================================================
// M-A06 ObservationStore — REAL round-trips against TEST_DATABASE_URL.
//
// Purpose: prove the durable observation persistence boundary (Source /
// Evidence / Observation) end-to-end against real Postgres, mirroring the
// I-PR3 IngestionStore suite conventions. Requires `TEST_DATABASE_URL` to be
// set and the schema pushed; the whole suite skips cleanly when unset.
//
// Identity guarantees under test:
//   - Evidence: deterministic (investigationId, operationId, artifactId) triple
//   - Source:   deterministic source key (one row per sourceId)
//   - Dedup:    Observation.identityKey @unique — an identical MA06 re-pass
//               with the same canonical identity keys must insert ZERO rows
//               (that is what gates the append-only OBSERVATION_EXTRACTED audit)
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A06 ObservationStore integration (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let store: ObservationStore;

    const investigationId = randomUUID();
    const foreignInvestigationId = randomUUID();
    const caseId = randomUUID();
    const operationId = randomUUID();
    const artifactId = randomUUID();
    const sourceId = randomUUID();

    function makeSource(overrides: Partial<SourceWriteRecord> = {}): SourceWriteRecord {
      return {
        id: sourceId,
        caseId,
        investigationId,
        catalog: "MANUAL",
        declaredCatalog: "legacy-ledger-system",
        name: "Ledger Export",
        description: "Monthly balances",
        ...overrides,
      };
    }

    function makeEvidence(
      evId: string,
      overrides: Partial<EvidenceWriteRecord> = {},
    ): EvidenceWriteRecord {
      return {
        id: evId,
        investigationId,
        caseId,
        operationId,
        sourceId,
        sourceName: "Ledger Export",
        sourceDescription: "Monthly balances",
        evidenceType: "FINANCIAL",
        title: "Ledger",
        description: "Monthly ledger",
        observedAt: { value: "2026-08-01T00:00:00.000Z", precision: "day" },
        artifactId,
        ...overrides,
      };
    }

    function makeObservation(
      evId: string,
      obsSourceId: string,
      overrides: Partial<Observation> = {},
    ): Observation {
      const now = new Date().toISOString();
      return {
        id: randomUUID(),
        evidenceId: evId,
        sourceId: obsSourceId,
        type: "FINANCIAL",
        content: "balance 42000.00",
        entityIds: [],
        candidateMentions: ["42000.00"],
        strength: 0.7,
        provenance: { sourceId: obsSourceId, artifactId, extractor: "observation-extractor@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
        ...overrides,
      };
    }

    function identityKeyOf(
      evId: string,
      obsSourceId: string,
      observation: Observation,
      locationKey: string,
    ): string {
      return buildObservationIdentityKey({
        evidenceId: evId,
        sourceId: obsSourceId,
        locationKey,
        type: observation.type,
        canonicalContent: observation.content,
      });
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      store = new ObservationStore(prisma);
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});
    });

    afterAll(async () => {
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});
      await prisma.$disconnect();
    });

    it("deterministicEvidenceId is retry-safe over the (investigation, operation, artifact) identity", async () => {
      const a = await deterministicEvidenceId(investigationId, operationId, artifactId);
      const b = await deterministicEvidenceId(investigationId, operationId, artifactId);
      expect(a).toBe(b);
      expect(a).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const otherArtifact = await deterministicEvidenceId(
        investigationId,
        operationId,
        randomUUID(),
      );
      expect(otherArtifact).not.toBe(a);
    });

    it("upsertSource resolves the same sourceId to one durable row and preserves the declared catalog", async () => {
      const written = await store.upsertSource(makeSource());
      expect(written.id).toBe(sourceId);
      expect(written.catalog).toBe("MANUAL");
      expect(written.declaredCatalog).toBe("legacy-ledger-system");
      expect(written.caseId).toBe(caseId);

      // Idempotent re-upsert with a changed label — same row, updated in place.
      const again = await store.upsertSource(makeSource({ name: "Ledger Export (renamed)" }));
      expect(again.id).toBe(written.id);
      expect(again.name).toBe("Ledger Export (renamed)");
      expect(
        await prisma.source.count({ where: { id: sourceId, investigationId, caseId } }),
      ).toBe(1);
    });

    it("upsertEvidence is idempotent on the (investigationId, operationId, artifactId) triple", async () => {
      const evidenceId = randomUUID();
      const written = await store.upsertEvidence(makeEvidence(evidenceId));
      expect(written.id).toBe(evidenceId);
      expect(written.evidenceType).toBe("FINANCIAL");
      expect(written.title).toBe("Ledger");

      const reloaded = await prisma.evidence.findUnique({ where: { id: evidenceId } });
      expect((reloaded!.observedAt as { precision?: string }).precision).toBe("day");
      expect((reloaded!.observedAt as { value?: string }).value).toBe(
        "2026-08-01T00:00:00.000Z",
      );

      const again = await store.upsertEvidence(
        makeEvidence(evidenceId, { title: "Ledger (revised)" }),
      );
      expect(again.id).toBe(evidenceId);
      expect(again.title).toBe("Ledger (revised)");
      expect(
        await prisma.evidence.count({
          where: { investigationId, operationId, artifactId },
        }),
      ).toBe(1);

      // A different artifactId is a different evidence identity.
      const otherEvidence = await store.upsertEvidence(
        makeEvidence(randomUUID(), { artifactId: randomUUID() }),
      );
      expect(otherEvidence.id).not.toBe(evidenceId);
    });

    it("ensureObservations inserts rows; an identical re-pass yields created=0 (dedup second-pass → 0 rows)", async () => {
      const evidenceId = randomUUID();
      const evOperationId = randomUUID();
      const evArtifactId = randomUUID();
      await store.upsertSource(makeSource());
      await store.upsertEvidence(
        makeEvidence(evidenceId, { operationId: evOperationId, artifactId: evArtifactId }),
      );

      const obs = [
        makeObservation(evidenceId, sourceId),
        makeObservation(evidenceId, sourceId, { id: randomUUID(), type: "TEMPORAL", content: "reported August" }),
      ];
      const entries = obs.map((o) => ({
        identityKey: identityKeyOf(evidenceId, sourceId, o, serializeSourceLocation("line", { line: 1 })),
        observation: o,
      }));

      const first = await store.ensureObservations(entries, { investigationId, caseId });
      expect(first.created).toBe(2);
      expect(await store.countObservationsByEvidence(evidenceId)).toBe(2);

      // Re-entrant MA06 pass with the SAME canonical identity keys must be a
      // no-op — this is what gates the single OBSERVATION_EXTRACTED audit.
      const second = await store.ensureObservations(entries, { investigationId, caseId });
      expect(second.created).toBe(0);
      expect(await store.countObservationsByEvidence(evidenceId)).toBe(2);
    });

    it("countObservationsByEvidence scopes strictly by evidenceId", async () => {
      const evA = randomUUID();
      const evB = randomUUID();
      await store.upsertEvidence(
        makeEvidence(evA, { operationId: randomUUID(), artifactId: randomUUID() }),
      );
      await store.upsertEvidence(
        makeEvidence(evB, { operationId: randomUUID(), artifactId: randomUUID() }),
      );

      const obsForA = [
        makeObservation(evA, sourceId, { type: "FINANCIAL", content: "balance 12000.00" }),
        makeObservation(evA, sourceId, { type: "FINANCIAL", content: "balance 33000.00" }),
      ];
      await store.ensureObservations(
        obsForA.map((o) => ({
          identityKey: identityKeyOf(evA, sourceId, o, serializeSourceLocation("line", { line: 2 })),
          observation: o,
        })),
        { investigationId, caseId },
      );

      expect(await store.countObservationsByEvidence(evA)).toBe(2);
      expect(await store.countObservationsByEvidence(evB)).toBe(0);
    });

    it("listEvidenceByInvestigation projects persisted rows with observationCount and derived status", async () => {
      const evWithObs = randomUUID();
      const evWithoutObs = randomUUID();
      const evArtifactId = randomUUID();
      const listCaseId = randomUUID();
      const listSourceId = randomUUID();
      await store.upsertSource(makeSource({ id: listSourceId, caseId: listCaseId }));
      await store.upsertEvidence(
        makeEvidence(evWithObs, {
          caseId: listCaseId,
          sourceId: listSourceId,
operationId: randomUUID(),
        artifactId: evArtifactId,
        title: "Ledger Export Q1",
      }),
      );
      await store.upsertEvidence(
        makeEvidence(evWithoutObs, {
          caseId: listCaseId,
          sourceId: listSourceId,
          operationId: randomUUID(),
          artifactId: randomUUID(),
          title: "Ledger Export Q2",
        }),
      );

      // One observation only against the first evidence row.
      const obs = makeObservation(evWithObs, listSourceId);
      await store.ensureObservations(
        [
          {
            identityKey: identityKeyOf(evWithObs, listSourceId, obs, serializeSourceLocation("line", { line: 4 })),
            observation: obs,
          },
        ],
        { investigationId, caseId: listCaseId },
      );

      const rows = await store.listEvidenceByInvestigation({ investigationId, caseId: listCaseId });
      expect(rows.length).toBe(2);

      const withObs = rows.find((r) => r.id === evWithObs)!;
      expect(withObs.title).toBe("Ledger Export Q1");
      expect(withObs.type).toBe("FINANCIAL");
      expect(withObs.sourceId).toBe(listSourceId);
      expect(withObs.sourceName).toBe("Ledger Export");
      expect(withObs.description).toBe("Monthly ledger");
      expect(withObs.operationId).toBeTruthy();
      expect(withObs.artifactId).toBeTruthy();
      expect(withObs.observationCount).toBe(1);
      expect(withObs.artifactIds).toEqual([evArtifactId]);
      expect(withObs.sourceRef).toBe("Ledger Export");
      expect(withObs.status).toBe("PROCESSED");
      expect(withObs.observedAt).toEqual({
        value: "2026-08-01T00:00:00.000Z",
        precision: "day",
      });
      expect(new Date(withObs.createdAt).toISOString()).toBe(withObs.createdAt);

      const withoutObs = rows.find((r) => r.id === evWithoutObs)!;
      expect(withoutObs.observationCount).toBe(0);
      expect(withoutObs.status).toBe("INGESTED");

      // Foreign investigation and wrong case boundary are excluded.
      expect(await store.listEvidenceByInvestigation({ investigationId: foreignInvestigationId })).toEqual([]);
      expect(await store.listEvidenceByInvestigation({ investigationId, caseId: randomUUID() })).toEqual([]);
    });

    it("listObservations reassembles canonical observations scoped by investigation/case/evidence", async () => {
      const evidenceId = randomUUID();
      // Own case boundary so this test's scoped assertions are exact and never
      // absorb rows written by earlier tests in this suite.
      const listCaseId = randomUUID();
      const listSourceId = randomUUID();
      await store.upsertSource(makeSource({ id: listSourceId, caseId: listCaseId }));
      await store.upsertEvidence(
        makeEvidence(evidenceId, {
          operationId: randomUUID(),
          artifactId: randomUUID(),
          caseId: listCaseId,
          sourceId: listSourceId,
        }),
      );
      const obs = [
        makeObservation(evidenceId, listSourceId),
        makeObservation(evidenceId, listSourceId, { id: randomUUID(), content: "status under-review" }),
      ];
      await store.ensureObservations(
        obs.map((o, i) => ({
          identityKey: identityKeyOf(evidenceId, listSourceId, o, serializeSourceLocation("line", { line: i + 1 })),
          observation: o,
        })),
        { investigationId, caseId: listCaseId },
      );

      // Scoped by investigation + case: both rows, schema-validated round-trip.
      const all = await store.listObservations({ investigationId, caseId: listCaseId });
      expect(all.length).toBe(2);
      for (const row of all) {
        expect(ObservationSchema.safeParse(row).success).toBe(true);
        expect(row.evidenceId).toBe(evidenceId);
        expect(row.sourceId).toBe(listSourceId);
        expect(row.type).toBe("FINANCIAL");
        expect(row.strength).toBe(0.7);
        expect(row.provenance.extractor).toBe("observation-extractor@1.0.0");
      }

      // Evidence-scoped.
      const byEvidence = await store.listObservations({
        investigationId,
        caseId: listCaseId,
        evidenceId,
      });
      expect(byEvidence.length).toBe(2);

      // Foreign investigation → excluded.
      expect(await store.listObservations({ investigationId: foreignInvestigationId })).toEqual([]);

      // Wrong case boundary → excluded.
      expect(await store.listObservations({ investigationId, caseId: randomUUID() })).toEqual([]);
    });

    it("listObservations surfaces a schema-invalid row loudly rather than dropping it", async () => {
      const evidenceId = randomUUID();
      await store.upsertEvidence(
        makeEvidence(evidenceId, { operationId: randomUUID(), artifactId: randomUUID() }),
      );
      const doomed = makeObservation(evidenceId, sourceId, { id: randomUUID(), content: "legit seed" });
      await store.ensureObservations(
        [
          {
            identityKey: identityKeyOf(evidenceId, sourceId, doomed, serializeSourceLocation("line", { line: 3 })),
            observation: doomed,
          },
        ],
        { investigationId, caseId },
      );

      // Tamper the row below the store boundary (empty content violates
      // ObservationSchema content.min(1)) — the read seam must not hide it.
      await prisma.observation.update({ where: { id: doomed.id }, data: { content: "" } });

      await expect(
        store.listObservations({ investigationId, caseId }),
      ).rejects.toThrow();
    });
  },
);