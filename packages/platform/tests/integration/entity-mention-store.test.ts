import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  EntityMentionCandidateSchema,
  type EntityMentionCandidate,
  type Observation,
} from "@indago/contracts";
import {
  buildEntityMentionIdentityKey,
  buildObservationIdentityKey,
  deterministicEntityMentionId,
  extractEntityMentions,
  finalizeEntityMention,
  serializeSourceLocation,
} from "@indago/ingestion";
import { EntityMentionStore } from "../../src/persistence/entity-mention-store.js";
import {
  ObservationStore,
  type SourceWriteRecord,
  type EvidenceWriteRecord,
} from "../../src/persistence/observation-store.js";

// ============================================================================
// M-A07 EntityMentionStore — REAL round-trips against TEST_DATABASE_URL.
//
// Purpose: prove the durable pre-resolution candidate persistence boundary
// end-to-end against real Postgres, mirroring the M-A06 ObservationStore suite
// conventions. Requires `TEST_DATABASE_URL`/schema; the suite skips cleanly
// when unset.
//
// EntityMentionCandidate.observationId has an ON DELETE CASCADE FK to
// Observation, so the real Source → Evidence → Observation chain must be
// seeded before candidate rows can be inserted — candidates are always
// grounded to a durable observation (M-A07 grounding rule).
//
// Identity guarantees under test:
//   - id deterministic over (observationId, start, end, entityType,
//       canonicalMatchValue).
//   - identityKey @unique — an identical MA07 re-pass must insert ZERO rows.
//   - M-A07 boundary — candidate rows carry NO canonical EntityId / score;
//       provenance is inherited verbatim from the parent Observation.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A07 EntityMentionStore integration (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let store: EntityMentionStore;
    let obsStore: ObservationStore;
    let sourceStore: ObservationStore;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const sourceId = randomUUID();
    const evidenceId = randomUUID();
    const artifactId = randomUUID();
    // Real, durable Observation rows (FK targets) seeded in beforeAll.
    const observationId = randomUUID();
    const foreignObservationId = randomUUID();
    const listCaseId = randomUUID();
    const listSourceId = randomUUID();
    const listEvidenceId = randomUUID();
    const listObservationId = randomUUID();
    // Dedicated observation whose candidates come from the REAL extractor.
    const e2eObservationId = randomUUID();

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
      srcId: string,
      csId: string,
    ): EvidenceWriteRecord {
      return {
        id: evId,
        investigationId,
        caseId: csId,
        operationId: randomUUID(),
        sourceId: srcId,
        sourceName: "Ledger Export",
        sourceDescription: "Monthly balances",
        evidenceType: "FINANCIAL",
        title: "Ledger",
        description: "Monthly ledger",
        observedAt: { value: "2026-08-01T00:00:00.000Z", precision: "day" },
        artifactId,
        ...{},
      };
    }

    function makeObservationRow(
      obsId: string,
      evId: string,
      srcId: string,
      csId: string,
      overrides: Partial<Observation> = {},
    ): Observation {
      const now = new Date().toISOString();
      return {
        id: obsId,
        evidenceId: evId,
        sourceId: srcId,
        type: "FINANCIAL",
        content: "balance 42000.00",
        entityIds: [],
        candidateMentions: [],
        strength: 0.7,
        provenance: { sourceId: srcId, artifactId, extractor: "observation-extractor@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
        ...overrides,
      };
    }

    function makeCandidate(
      obsId: string,
      overrides: Partial<EntityMentionCandidate> = {},
    ): EntityMentionCandidate {
      const now = new Date().toISOString();
      return {
        id: randomUUID(),
        observationId: obsId,
        text: "ravi.akram@example.org",
        start: 0,
        end: 22,
        entityType: "EMAIL",
        extractionMethod: "PATTERN_MATCH",
        canonicalMatchValue: "ravi.akram@example.org",
        provenance: { sourceId, artifactId, extractor: "obs@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
        ...overrides,
      };
    }

    function identityKeyOf(candidate: EntityMentionCandidate): string {
      return buildEntityMentionIdentityKey({
        observationId: candidate.observationId,
        start: candidate.start,
        end: candidate.end,
        entityType: candidate.entityType ?? undefined,
        canonicalMatchValue: candidate.canonicalMatchValue,
      });
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      store = new EntityMentionStore(prisma);
      sourceStore = new ObservationStore(prisma);
      obsStore = sourceStore;

      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});

      // Seed the real Source → Evidence → Observation chain so candidate FK
      // targets exist. Mirror the M-A06 ObservationStore setup.
      await obsStore.upsertSource(makeSource());
      await obsStore.upsertEvidence(makeEvidence(evidenceId, sourceId, caseId));
      await obsStore.ensureObservations(
        [
          {
            identityKey: buildObservationIdentityKeyFor(makeObservationRow(observationId, evidenceId, sourceId, caseId)),
            observation: makeObservationRow(observationId, evidenceId, sourceId, caseId),
          },
          {
            identityKey: buildObservationIdentityKeyFor(makeObservationRow(foreignObservationId, evidenceId, sourceId, caseId, { content: "other content" })),
            observation: makeObservationRow(foreignObservationId, evidenceId, sourceId, caseId, { content: "other content" }),
          },
        ],
        { investigationId, caseId },
      );

      // A separate case boundary observation for the scoped read test.
      await obsStore.upsertSource(makeSource({ id: listSourceId, caseId: listCaseId }));
      await obsStore.upsertEvidence(makeEvidence(listEvidenceId, listSourceId, listCaseId));
      const listObs = makeObservationRow(listObservationId, listEvidenceId, listSourceId, listCaseId);
      await obsStore.ensureObservations(
        [{ identityKey: buildObservationIdentityKeyFor(listObs), observation: listObs }],
        { investigationId, caseId: listCaseId },
      );

      // Observation whose mentions will be produced by the REAL extractor.
      const e2eObs = makeObservationRow(
        e2eObservationId,
        evidenceId,
        sourceId,
        caseId,
        { content: "Dr. Ravi Akram called +91-98765-43210. email ravi.akram@example.org" },
      );
      await obsStore.ensureObservations(
        [{ identityKey: buildObservationIdentityKeyFor(e2eObs), observation: e2eObs }],
        { investigationId, caseId },
      );
    });

    afterAll(async () => {
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});
      await prisma.$disconnect();
    });

    it("deterministicEntityMentionId is retry-safe over the (observation, span, type, value) identity", async () => {
      const input = {
        observationId,
        start: 0,
        end: 22,
        entityType: "EMAIL" as const,
        canonicalMatchValue: "ravi.akram@example.org",
      };
      const a = await deterministicEntityMentionId(input);
      const b = await deterministicEntityMentionId(input);
      expect(a).toBe(b);
      expect(a).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const otherSpan = await deterministicEntityMentionId({ ...input, start: 5, end: 20 });
      expect(otherSpan).not.toBe(a);

      const otherObs = await deterministicEntityMentionId({ ...input, observationId: foreignObservationId });
      expect(otherObs).not.toBe(a);
    });

    it("ensureEntityMentions inserts rows; an identical re-pass yields created=0 (dedup second pass)", async () => {
      const cand = makeCandidate(observationId);
      const entries = [{ identityKey: identityKeyOf(cand), candidate: cand }];

      const first = await store.ensureEntityMentions(entries, { investigationId, caseId });
      expect(first.created).toBe(1);

      const second = await store.ensureEntityMentions(entries, { investigationId, caseId });
      expect(second.created).toBe(0);
    });

    it("persists distinct spans/types per observation without merging", async () => {
      const candA = makeCandidate(observationId, { start: 0, end: 5, text: "alpha" });
      const candB = makeCandidate(observationId, { start: 8, end: 13, text: "beta" });
      const candOtherObs = makeCandidate(foreignObservationId, { start: 0, end: 5, text: "alpha" });

      const { created } = await store.ensureEntityMentions(
        [
          { identityKey: identityKeyOf(candA), candidate: candA },
          { identityKey: identityKeyOf(candB), candidate: candB },
          { identityKey: identityKeyOf(candOtherObs), candidate: candOtherObs },
        ],
        { investigationId, caseId },
      );
      expect(created).toBe(3);
      // Same "alpha" text in another observation is a SEPARATE candidate.
      expect(await store.countByObservationIds([foreignObservationId])).toBe(1);
    });

    it("countByObservationIds scopes strictly by observation", async () => {
      expect(await store.countByObservationIds([randomUUID()])).toBe(0);
      expect(await store.countByObservationIds([])).toBe(0);
    });

    it("listByObservationIds reassembles canonical candidates scoped by case boundary", async () => {
      const cand = makeCandidate(listObservationId, {
        text: "Dr. Ravi Akram",
        start: 0,
        end: 14,
        entityType: "PERSON",
      });
      await store.ensureEntityMentions(
        [{ identityKey: identityKeyOf(cand), candidate: cand }],
        { investigationId, caseId: listCaseId },
      );

      const rows = await store.listByObservationIds([listObservationId], {
        investigationId,
        caseId: listCaseId,
      });
      expect(rows.length).toBe(1);
      const row = rows[0]!;
      expect(EntityMentionCandidateSchema.safeParse(row).success).toBe(true);
      expect(row.observationId).toBe(listObservationId);
      expect(row.entityType).toBe("PERSON");
      expect(row.extractionMethod).toBe("PATTERN_MATCH");
      expect(row.start).toBe(0);
      expect(row.end).toBe(14);
      expect(row.provenance.artifactId).toBe(artifactId);

      expect(
        await store.listByObservationIds([listObservationId], { investigationId, caseId: randomUUID() }),
      ).toEqual([]);

      await prisma.entityMentionCandidate.deleteMany({
        where: { observationId: listObservationId },
      });
    });

    it("listByObservationIds surfaces a schema-invalid row loudly rather than dropping it", async () => {
      const cand = makeCandidate(observationId, { start: 40, end: 45, text: "doomed" });
      await store.ensureEntityMentions(
        [{ identityKey: identityKeyOf(cand), candidate: cand }],
        { investigationId, caseId },
      );

      await prisma.entityMentionCandidate.update({
        where: { id: cand.id },
        data: { start: cand.start, end: cand.start },
      });

      await expect(
        store.listByObservationIds([observationId], { investigationId, caseId }),
      ).rejects.toThrow();
    });

    it("E2E: real extractor → finalize → store → Postgres (ID from the extractor, not the test)", async () => {
      // Re-assemble the real Observation exactly as persisted so the extractor
      // runs over the same content the store grounded.
      const obs = makeObservationRow(
        e2eObservationId,
        evidenceId,
        sourceId,
        caseId,
        { content: "Dr. Ravi Akram called +91-98765-43210. email ravi.akram@example.org" },
      );

      // 1. Real, pure extraction (NO gazetteer → empty default).
      const { drafts } = await extractEntityMentions(obs);
      expect(drafts.length).toBeGreaterThan(0);

      // 2. Finalize with the real deterministic ID (never supplied by the test).
      const nowIso = "2026-01-01T00:00:00.000Z";
      const finalized = [];
      for (const draft of drafts) {
        finalized.push({
          candidate: await finalizeEntityMention({ draft, nowIso }),
          identityKey: buildEntityMentionIdentityKey({
            observationId: draft.observationId,
            start: draft.start,
            end: draft.end,
            entityType: draft.entityType,
            canonicalMatchValue: draft.canonicalMatchValue,
          }),
        });
      }

      // 3. Persist through the real store.
      const { created } = await store.ensureEntityMentions(finalized, {
        investigationId,
        caseId,
      });
      expect(created).toBe(finalized.length);

      // 4. Read back and verify every guarantee.
      const rows = await store.listByObservationIds([e2eObservationId], {
        investigationId,
        caseId,
      });
      const email = rows.find((r) => r.entityType === "EMAIL");
      expect(email).toBeDefined();
      expect(email!.text).toBe("ravi.akram@example.org");

      // ID is deterministic — recompute and compare, not guessed.
      const emailKey = finalized.find((f) => f.candidate.entityType === "EMAIL")!;
      expect(email!.id).toBe(emailKey.candidate.id);
      expect(
        await deterministicEntityMentionId({
          observationId: e2eObservationId,
          start: email!.start,
          end: email!.end,
          entityType: email!.entityType,
          canonicalMatchValue: email!.canonicalMatchValue,
        }),
      ).toBe(email!.id);

      // identityKey persisted matches the canonical derivation.
      const raw = await prisma.entityMentionCandidate.findUnique({
        where: { id: email!.id },
      });
      expect(raw!.identityKey).toBe(
        buildEntityMentionIdentityKey({
          observationId: e2eObservationId,
          start: email!.start,
          end: email!.end,
          entityType: email!.entityType,
          canonicalMatchValue: email!.canonicalMatchValue,
        }),
      );

      // Provenance inherited from the Observation.
      expect(email!.provenance.artifactId).toBe(artifactId);
      expect(email!.provenance.sourceId).toBe(sourceId);
      expect(email!.provenance.extractor).toBe("observation-extractor@1.0.0");

      // M-A07 boundary: no EntityId, no ResolutionScore anywhere.
      for (const r of rows) {
        expect(r).not.toHaveProperty("entityId");
        expect(r).not.toHaveProperty("resolutionScore");
      }
      expect(raw).not.toHaveProperty("entityId");
      // No canonical EntityId column exists on the durable row either.
      expect(Object.hasOwn(raw!, "entityId")).toBe(false);

      // Cleanup the E2E row so later full-suite runs stay isolated.
      await prisma.entityMentionCandidate.deleteMany({
        where: { observationId: e2eObservationId },
      });
    });
  },
);

/** Local identity key builder mirroring the MA06 queue contract. */
function buildObservationIdentityKeyFor(observation: Observation): string {
  return buildObservationIdentityKey({
    evidenceId: observation.evidenceId,
    sourceId: observation.sourceId,
    locationKey: serializeSourceLocation("line", { line: 1 }),
    type: observation.type,
    canonicalContent: observation.content,
  });
}
