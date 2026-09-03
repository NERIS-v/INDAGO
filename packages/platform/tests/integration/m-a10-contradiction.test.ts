import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  buildObservationIdentityKey,
  serializeSourceLocation,
} from "@indago/ingestion";
import {
  buildEntityIdentityKey,
  deterministicEntityId,
} from "@indago/entity-resolution";
import {
  resolveRelationsForCase,
  RELATION_SCORE_MODEL_VERSION,
  RELATION_PROPOSAL_THRESHOLD,
  buildRelationHypothesisIdentityKey,
  deterministicRelationHypothesisId,
} from "@indago/relation-resolution";
import { ObservationStore, type SourceWriteRecord } from "../../src/persistence/observation-store.js";
import { EntityStore } from "../../src/persistence/entity-store.js";
import { RelationHypothesisStore } from "../../src/persistence/relation-hypothesis-store.js";
import type { Observation, EntityId } from "@indago/contracts";

// ============================================================================
// M-A10 hardContradiction — REAL round-trips against TEST_DATABASE_URL.
//
// Proves the P0 contradiction flow through the exact seam the production worker
// (completeMA10) uses: canonical Entity rows + Observation.entityIds →
// resolveRelationsForCase with explicitContradictions → durable
// RelationHypothesis carrying the reduced score + precise contradiction
// provenance, listed exactly once (no double-listing).
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A10 contradiction flow (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let obsStore: ObservationStore;
    let entityStore: EntityStore;
    let relationStore: RelationHypothesisStore;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const sourceId = randomUUID();
    const evidenceId = randomUUID();
    const artifactId = randomUUID();

    const obsCoOccurA = randomUUID();
    const obsCoOccurB = randomUUID();
    const obsContradiction = randomUUID();

    // Two canonical entities, accepted/proposed-side canonical rows.
    const sharedA = "contrad-entity-a@example.org";
    const sharedB = "contrad-entity-b@example.org";

    let entityIdA: EntityId;
    let entityIdB: EntityId;

    function makeSource(): SourceWriteRecord {
      return {
        id: sourceId,
        caseId,
        investigationId,
        catalog: "MANUAL",
        declaredCatalog: "ledger",
        name: "Ledger",
        description: "Ledger export",
      };
    }

    function makeObservationRow(obsId: string, overrides: Partial<Observation> = {}): Observation {
      const now = new Date().toISOString();
      return {
        id: obsId,
        evidenceId,
        sourceId,
        type: "FINANCIAL",
        content: "joint ledger entry",
        entityIds: [],
        candidateMentions: [],
        strength: 0.7,
        provenance: { sourceId, artifactId, extractor: "observation-extractor@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
        ...overrides,
      };
    }

    function obsKey(o: Observation): string {
      return buildObservationIdentityKey({
        evidenceId: o.evidenceId,
        sourceId: o.sourceId,
        locationKey: serializeSourceLocation("line", { line: 1 }),
        type: o.type,
        canonicalContent: o.content,
      });
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      obsStore = new ObservationStore(prisma);
      entityStore = new EntityStore(prisma);
      relationStore = new RelationHypothesisStore(prisma);

      await prisma.relation.deleteMany({});
      await prisma.relationHypothesis.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.entityHypothesis.deleteMany({});
      await prisma.candidatePair.deleteMany({});
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});

      await obsStore.upsertSource(makeSource());
      await obsStore.upsertEvidence({
        id: evidenceId,
        investigationId,
        caseId,
        operationId: randomUUID(),
        sourceId,
        sourceName: "Ledger",
        sourceDescription: "Ledger export",
        evidenceType: "FINANCIAL",
        title: "Ledger",
        description: "Monthly ledger",
        observedAt: { value: "2026-08-01T00:00:00.000Z", precision: "day" },
        artifactId,
      });
      await obsStore.ensureObservations(
        [
          { identityKey: obsKey(makeObservationRow(obsCoOccurA, { content: "balance 42000.00 X" })), observation: makeObservationRow(obsCoOccurA, { content: "balance 42000.00 X" }) },
          { identityKey: obsKey(makeObservationRow(obsCoOccurB, { content: "balance 42000.00 Y" })), observation: makeObservationRow(obsCoOccurB, { content: "balance 42000.00 Y" }) },
          { identityKey: obsKey(makeObservationRow(obsContradiction, { content: "explicit disassociation M" })), observation: makeObservationRow(obsContradiction, { content: "explicit disassociation M" }) },
        ],
        { investigationId, caseId },
      );

      // Materialize two canonical entities that co-occur in the two FINANCIAL
      // observations. The contradiction observation references the same pair.
      entityIdA = await deterministicEntityId({ caseId, canonicalName: sharedA, entityType: "EMAIL" });
      entityIdB = await deterministicEntityId({ caseId, canonicalName: sharedB, entityType: "EMAIL" });

      await entityStore.materializeEntity({
        identityKey: buildEntityIdentityKey({ caseId, canonicalName: sharedA, entityType: "EMAIL" }),
        entity: {
          id: entityIdA,
          caseId,
          investigationId,
          canonicalName: sharedA,
          entityType: "EMAIL",
          status: "ACTIVE",
          observationIds: [obsCoOccurA, obsCoOccurB, obsContradiction],
          hypothesisIds: [],
          provenance: { sourceId, artifactId, extractor: "indago:materialization:authority" },
        },
      });
      await entityStore.materializeEntity({
        identityKey: buildEntityIdentityKey({ caseId, canonicalName: sharedB, entityType: "EMAIL" }),
        entity: {
          id: entityIdB,
          caseId,
          investigationId,
          canonicalName: sharedB,
          entityType: "EMAIL",
          status: "ACTIVE",
          observationIds: [obsCoOccurA, obsCoOccurB, obsContradiction],
          hypothesisIds: [],
          provenance: { sourceId, artifactId, extractor: "indago:materialization:authority" },
        },
      });

      // Link the canonical entity ids on the co-occurrence + contradiction
      // observations so the engine detects source-grounded co-occurrence.
      await prisma.observation.updateMany({
        where: { id: { in: [obsCoOccurA, obsCoOccurB, obsContradiction] } },
        data: { entityIds: [entityIdA, entityIdB] },
      });
    });

    afterAll(async () => {
      await prisma.relation.deleteMany({});
      await prisma.relationHypothesis.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.entityHypothesis.deleteMany({});
      await prisma.candidatePair.deleteMany({});
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});
      await prisma.$disconnect();
    });

    it("threads explicitContradictions so hardContradiction −0.25 fires with persisted provenance", async () => {
      // The worker (completeMA10) reads durable observations + canonical
      // entities and passes the case's explicit contradiction observation ids.
      const observations = await obsStore.listObservations({ investigationId, caseId });
      const entities = await entityStore.listByCaseWithObservations(caseId, { investigationId });

      const explicitContradictions = new Set<string>([obsContradiction]);

      const { resolutions } = resolveRelationsForCase({
        caseId,
        investigationId,
        observations,
        entities: entities.map((e) => ({ id: e.id, observationIds: e.observationIds })),
        explicitContradictions,
      });

      const res = resolutions.find(
        (r) =>
          (r.sourceEntityId === entityIdA && r.targetEntityId === entityIdB) ||
          (r.sourceEntityId === entityIdB && r.targetEntityId === entityIdA),
      );
      expect(res).toBeDefined();

      // Exactly −0.25 on top of the otherwise-positive signal. The three
      // FINANCIAL co-occurrences share ONE source and carry NO timestamps, so
      // the normal signal is co-occurrence(0.2) + repeated(0.15) + type-signal(0.15)
      // = 0.50, and the contradiction knocks it down by exactly 0.25 → 0.25.
      const uncontradictedSupport = 0.2 + 0.15 + 0.15;
      expect(res!.support).toBeCloseTo(uncontradictedSupport - 0.25, 6);
      // Precise provenance: ONLY the explicitly-contradicting observation is
      // listed in contradictions — NOT the whole evidence basis (no double
      // listing of the co-occurrence observations).
      expect(res!.contradictions).toEqual([obsContradiction]);
      expect(res!.contradictions).not.toContain(obsCoOccurA);
      expect(res!.contradictions).not.toContain(obsCoOccurB);
    });

    it("persists the contradiction-bearing hypothesis as a single durable row with reduced score", async () => {
      const observations = await obsStore.listObservations({ investigationId, caseId });
      const entities = await entityStore.listByCaseWithObservations(caseId, { investigationId });
      const explicitContradictions = new Set<string>([obsContradiction]);

      const { resolutions } = resolveRelationsForCase({
        caseId,
        investigationId,
        observations,
        entities: entities.map((e) => ({ id: e.id, observationIds: e.observationIds })),
        explicitContradictions,
      });
      const res = resolutions.find(
        (r) =>
          (r.sourceEntityId === entityIdA && r.targetEntityId === entityIdB) ||
          (r.sourceEntityId === entityIdB && r.targetEntityId === entityIdA),
      )!;
      expect(res.support).toBeGreaterThanOrEqual(RELATION_PROPOSAL_THRESHOLD);

      const identityKey = buildRelationHypothesisIdentityKey({
        sourceEntityId: res.sourceEntityId,
        targetEntityId: res.targetEntityId,
        relationType: res.relationType,
        directed: res.directed,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      const id = await deterministicRelationHypothesisId({
        sourceEntityId: res.sourceEntityId,
        targetEntityId: res.targetEntityId,
        relationType: res.relationType,
        directed: res.directed,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });

      // Idempotent: persist twice → converges to one row.
      const first = await relationStore.upsertHypothesis({
        id,
        identityKey,
        caseId,
        investigationId,
        sourceEntityId: res.sourceEntityId,
        targetEntityId: res.targetEntityId,
        relationType: res.relationType,
        support: res.support,
        evidenceBasis: res.evidenceBasis,
        contradictions: res.contradictions,
        status: "PROPOSED",
        scoreModelVersion: res.scoreModelVersion,
        evidenceCount: res.evidenceCount,
        evidenceStrength: res.evidenceStrength,
        sourceCoverage: res.sourceCoverage,
        temporalCoverage: res.temporalCoverage,
        directed: res.directed,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });
      const second = await relationStore.upsertHypothesis({
        id,
        identityKey,
        caseId,
        investigationId,
        sourceEntityId: res.sourceEntityId,
        targetEntityId: res.targetEntityId,
        relationType: res.relationType,
        support: res.support,
        evidenceBasis: res.evidenceBasis,
        contradictions: res.contradictions,
        status: "PROPOSED",
        scoreModelVersion: res.scoreModelVersion,
        evidenceCount: res.evidenceCount,
        evidenceStrength: res.evidenceStrength,
        sourceCoverage: res.sourceCoverage,
        temporalCoverage: res.temporalCoverage,
        directed: res.directed,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });

      // The second upsert converges to the existing row (idempotent) — PROPOSED is
      // a machine-refreshable state, so it reports reused, not preserved.
      expect(second.reusedExisting).toBe(true);

      const count = await prisma.relationHypothesis.count({ where: { caseId, id } });
      expect(count).toBe(1);

      const row = await relationStore.findById(id, { caseId });
      expect(row).not.toBeNull();
      expect(row!.support).toBeCloseTo(0.25, 6);
      expect(row!.contradictions).toEqual([obsContradiction]);
    });
  },
);