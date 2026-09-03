import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  EntityHypothesisSchema,
  type EntityMentionCandidate,
  type CandidatePair,
  type Observation,
  type EntityHypothesis,
} from "@indago/contracts";
import {
  buildObservationIdentityKey,
  buildEntityMentionIdentityKey,
  buildCandidatePairIdentityKey,
  serializeSourceLocation,
  deterministicCandidatePairId,
  finalizeCandidatePair,
  blockCandidates,
} from "@indago/ingestion";
import {
  buildEntityHypothesisIdentityKey,
  deterministicEntityHypothesisId,
  RESOLUTION_SCORE_MODEL_VERSION,
} from "@indago/entity-resolution";
import {
  buildRelationHypothesisIdentityKey,
  deterministicRelationHypothesisId,
  RELATION_SCORE_MODEL_VERSION,
} from "@indago/relation-resolution";
import {
  EntityHypothesisStore,
} from "../../src/persistence/entity-hypothesis-store.js";
import {
  ObservationStore,
  type SourceWriteRecord,
  type EvidenceWriteRecord,
} from "../../src/persistence/observation-store.js";
import { EntityMentionStore } from "../../src/persistence/entity-mention-store.js";
import { CandidatePairStore } from "../../src/persistence/candidate-pair-store.js";
import { EntityStore } from "../../src/persistence/entity-store.js";
import { RelationHypothesisStore } from "../../src/persistence/relation-hypothesis-store.js";
import { RelationHypothesisTransitionError } from "../../src/persistence/relation-hypothesis-store.js";
import { RelationStore } from "../../src/persistence/relation-store.js";
import {
  materializeCanonicalRelationFromAcceptedHypothesis,
  rejectRelationHypothesis,
  reverseRelationHypothesis,
  RelationMaterializationError,
} from "../../src/relations/relation-materialization.js";
import {
  buildRelationKey,
  deterministicRelationId,
} from "../../src/persistence/relation-store.js";
import {
  materializeCanonicalEntityFromAcceptedHypothesis,
  EntityMaterializationError,
} from "../../src/entities/entity-materialization.js";
import {
  buildEntityIdentityKey,
  deterministicEntityId,
} from "@indago/entity-resolution";

// ============================================================================
// M-A10 Relation Resolver — REAL round-trips against TEST_DATABASE_URL.
//
// Proves the M-A09.5 → M-A10 durable boundary end-to-end against real Postgres:
//
//   1. The explicit identity/LARMOR authority: a PROPOSED EntityHypothesis is
//      ACCEPTED and materialized into a canonical Entity with a REAL,
//      persisted EntityId (never a fake id invented from a score alone).
//   2. REJECTED / non-PROPOSED hypotheses are refused by the authority.
//   3. Re-accepting the same logical entity converges (identityKey @unique) —
//      no duplicate entities.
//   4. M-A10 RelationHypothesis rows consume the REAL canonical EntityIds from
//      step 1 — durable, idempotent, lifecycle-preserving, case-scoped — and
//      NEVER accept an EntityMentionCandidateId in place of an EntityId.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A10 RelationResolver integration (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let hypothesisStore: EntityHypothesisStore;
    let pairStore: CandidatePairStore;
    let candStore: EntityMentionStore;
    let obsStore: ObservationStore;
    let entityStore: EntityStore;
    let relationStore: RelationHypothesisStore;
    let canonRelationStore: RelationStore;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const otherCaseId = randomUUID();
    const sourceId = randomUUID();
    const evidenceId = randomUUID();
    const artifactId = randomUUID();

    const obsA = randomUUID();
    const obsB = randomUUID();
    const obsC = randomUUID();

    // Two canonical entity hypotheses (entityA = entityB shared value pair).
    const sharedA = "canonical-a@example.org";
    const sharedB = "canonical-b@example.org";

    function makeSource(overrides: Partial<SourceWriteRecord> = {}): SourceWriteRecord {
      return {
        id: sourceId,
        caseId,
        investigationId,
        catalog: "MANUAL",
        declaredCatalog: "ledger",
        name: "Ledger",
        description: "Ledger export",
        ...overrides,
      };
    }

    function makeEvidence(): EvidenceWriteRecord {
      return {
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
      };
    }

    function makeObservationRow(
      obsId: string,
      overrides: Partial<Observation> = {},
    ): Observation {
      const now = new Date().toISOString();
      return {
        id: obsId,
        evidenceId,
        sourceId,
        type: "FINANCIAL",
        content: "balance 42000.00",
        entityIds: [],
        candidateMentions: [],
        strength: 0.7,
        provenance: { sourceId, artifactId, extractor: "observation-extractor@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
        ...overrides,
      };
    }

    function makeCandidate(
      obsId: string,
      n: number,
      overrides: Partial<EntityMentionCandidate> = {},
    ): EntityMentionCandidate {
      const now = new Date().toISOString();
      return {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        observationId: obsId,
        text: overrides.text ?? `unique-${n}@example.org`,
        start: overrides.start ?? 0,
        end: overrides.end ?? 22,
        entityType: "EMAIL",
        extractionMethod: "PATTERN_MATCH",
        canonicalMatchValue: overrides.canonicalMatchValue ?? `unique-${n}@example.org`,
        provenance: { sourceId, artifactId, extractor: "obs@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
        ...overrides,
      };
    }

    async function seedCandidate(
      obsId: string,
      n: number,
      overrides: Partial<EntityMentionCandidate> = {},
    ): Promise<EntityMentionCandidate> {
      const cand = makeCandidate(obsId, n, overrides);
      await candStore.ensureEntityMentions(
        [
          {
            identityKey: buildEntityMentionIdentityKey({
              observationId: cand.observationId,
              start: cand.start,
              end: cand.end,
              entityType: cand.entityType,
              canonicalMatchValue: cand.canonicalMatchValue,
            }),
            candidate: cand,
          },
        ],
        { investigationId, caseId },
      );
      return cand;
    }

    async function buildPair(
      left: EntityMentionCandidate,
      right: EntityMentionCandidate,
      sharedValue: string,
    ): Promise<{ identityKey: string; pair: CandidatePair }> {
      const a = { ...left, canonicalMatchValue: sharedValue };
      const b = { ...right, canonicalMatchValue: sharedValue };
      const { drafts } = blockCandidates(
        { candidates: [a, b], caseId, investigationId },
        {},
      );
      const pair = await finalizeCandidatePair({
        draft: drafts[0]!,
        nowIso: new Date().toISOString(),
      });
      const identityKey = buildCandidatePairIdentityKey({
        caseId: pair.caseId,
        leftCandidateId: pair.leftCandidateId,
        rightCandidateId: pair.rightCandidateId,
      });
      return { identityKey, pair };
    }

    function buildTestHypothesis(params: {
      id: string;
      pair: CandidatePair;
      supportingCandidateIds: string[];
      supportingObservationIds: string[];
      status?: string;
      score?: number;
    }): EntityHypothesis {
      const now = new Date().toISOString();
      return EntityHypothesisSchema.parse({
        id: params.id,
        caseId,
        investigationId,
        candidatePairId: params.pair.id,
        supportingCandidateIds: params.supportingCandidateIds,
        status: params.status ?? "PROPOSED",
        comparisonStatus: "COMPARED_AND_UNRESOLVED",
        score: params.score ?? 0.35,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
        supportingObservationIds: params.supportingObservationIds,
        contradictingObservationIds: [],
        provenance: {
          sourceId,
          artifactId,
          extractor: "indago:resolution:engine",
          extractionMethod: RESOLUTION_SCORE_MODEL_VERSION,
        },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
      });
    }

    function buildObservationIdentityKeyFor(o: Observation): string {
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
      hypothesisStore = new EntityHypothesisStore(prisma);
      pairStore = new CandidatePairStore(prisma);
      candStore = new EntityMentionStore(prisma);
      obsStore = new ObservationStore(prisma);
      entityStore = new EntityStore(prisma);
      relationStore = new RelationHypothesisStore(prisma);
      canonRelationStore = new RelationStore(prisma);

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
      await obsStore.upsertEvidence(makeEvidence());
      await obsStore.ensureObservations(
        [
          {
            identityKey: buildObservationIdentityKeyFor(
              makeObservationRow(obsA, { content: "balance 42000.00 AAA" }),
            ),
            observation: makeObservationRow(obsA, { content: "balance 42000.00 AAA" }),
          },
          {
            identityKey: buildObservationIdentityKeyFor(
              makeObservationRow(obsB, { content: "balance 42000.00 BBB" }),
            ),
            observation: makeObservationRow(obsB, { content: "balance 42000.00 BBB" }),
          },
          {
            identityKey: buildObservationIdentityKeyFor(
              makeObservationRow(obsC, { content: "balance 42000.00 CCC" }),
            ),
            observation: makeObservationRow(obsC, { content: "balance 42000.00 CCC" }),
          },
        ],
        { investigationId, caseId },
      );
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

    async function prepareAcceptedEntity(
      sharedValue: string,
      aN: number,
      bN: number,
      obsForA: string,
      obsForB: string,
      startOffset = 0,
    ): Promise<{ entityId: string; hypothesisId: string }> {
      const left = await seedCandidate(obsForA, aN, {
        canonicalMatchValue: sharedValue,
        start: startOffset,
        end: startOffset + 22,
      });
      const right = await seedCandidate(obsForB, bN, {
        canonicalMatchValue: sharedValue,
        start: startOffset + 40,
        end: startOffset + 62,
      });
      const { identityKey, pair } = await buildPair(left, right, sharedValue);
      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const hypothesisId = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypothesis = buildTestHypothesis({
        id: hypothesisId,
        pair,
        supportingCandidateIds: [left.id, right.id],
        supportingObservationIds: [obsForA, obsForB],
      });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const result = await materializeCanonicalEntityFromAcceptedHypothesis(
        { caseId, investigationId, hypothesisId, actor: "test@indago" },
        {
          entityHypothesisStore: hypothesisStore,
          entityMentionStore: candStore,
          entityStore,
        },
      );
      return { entityId: result.entityId, hypothesisId };
    }

    it("authority materializes a REJECTED hypothesis — refused, no entity created", async () => {
      const left = await seedCandidate(obsA, 1, { canonicalMatchValue: "rejected@example.org" });
      const right = await seedCandidate(obsB, 2, { canonicalMatchValue: "rejected@example.org" });
      const { identityKey, pair } = await buildPair(left, right, "rejected@example.org");
      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const hypothesisId = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypothesis = buildTestHypothesis({
        id: hypothesisId,
        pair,
        supportingCandidateIds: [left.id, right.id],
        supportingObservationIds: [obsA, obsB],
        status: "REJECTED",
      });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      await expect(
        materializeCanonicalEntityFromAcceptedHypothesis(
          { caseId, investigationId, hypothesisId, actor: "test@indago" },
          {
            entityHypothesisStore: hypothesisStore,
            entityMentionStore: candStore,
            entityStore,
          },
        ),
      ).rejects.toBeInstanceOf(EntityMaterializationError);

      const entityCount = await prisma.entity.count({
        where: { caseId, canonicalName: "rejected@example.org" },
      });
      expect(entityCount).toBe(0);
    });

    it("PROPOSED hypothesis → canonical Entity with a REAL persisted EntityId", async () => {
      const { entityId, hypothesisId } = await prepareAcceptedEntity(sharedA, 1001, 1002, obsA, obsB);

      const entity = await prisma.entity.findUnique({ where: { id: entityId } });
      expect(entity).not.toBeNull();
      expect(entity!.canonicalName).toBe(sharedA);
      expect(entity!.caseId).toBe(caseId);
      expect(entity!.status).toBe("ACTIVE");

      const hyp = await hypothesisStore.findById(hypothesisId, { caseId });
      expect(hyp!.status).toBe("ACCEPTED");
      expect(hyp!.entityId).toBe(entityId);

      const expectedId = await deterministicEntityId({
        caseId,
        canonicalName: sharedA,
        entityType: "EMAIL",
      });
      expect(entityId).toBe(expectedId);
    });

    it("re-accepting the same logical entity converges — no duplicate (identityKey @unique)", async () => {
      const first = await prepareAcceptedEntity(sharedB, 1101, 1102, obsB, obsC);

      const second = await prepareAcceptedEntity(sharedB, 2101, 2102, obsB, obsC, 1000);

      expect(first.entityId).toBe(second.entityId);

      const count = await prisma.entity.count({
        where: { caseId, canonicalName: sharedB },
      });
      expect(count).toBe(1);
    });

    it("deterministic canonical EntityId does NOT depend on candidate/mention ids", async () => {
      const left = await seedCandidate(obsA, 1201, { canonicalMatchValue: "det-id@example.org" });
      const right = await seedCandidate(obsB, 1202, { canonicalMatchValue: "det-id@example.org" });
      const { identityKey, pair } = await buildPair(left, right, "det-id@example.org");
      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const hypothesisId = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      await hypothesisStore.upsertHypothesis({
        identityKey: hypIdentityKey,
        hypothesis: buildTestHypothesis({
          id: hypothesisId,
          pair,
          supportingCandidateIds: [left.id, right.id],
          supportingObservationIds: [obsA, obsB],
        }),
      });

      const result = await materializeCanonicalEntityFromAcceptedHypothesis(
        { caseId, investigationId, hypothesisId, actor: "test@indago" },
        { entityHypothesisStore: hypothesisStore, entityMentionStore: candStore, entityStore },
      );

      const ownKeyId = await deterministicEntityId({
        caseId,
        canonicalName: "det-id@example.org",
        entityType: "EMAIL",
      });
      expect(result.entityId).toBe(ownKeyId);
      expect(result.entityId).not.toBe(left.id);
      expect(result.entityId).not.toBe(right.id);
    });

    it("M-A10 relation persists against REAL canonical EntityIds — not mention ids", async () => {
      const entityA = await prepareAcceptedEntity("rel-a@example.org", 1301, 1302, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-b@example.org", 1303, 1304, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      const relIdentityKey = buildRelationHypothesisIdentityKey({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });

      const result = await relationStore.upsertHypothesis({
        id: relationId,
        identityKey: relIdentityKey,
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
        support: 0.65,
        evidenceBasis: [obsA, obsB, obsC],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 3,
        evidenceStrength: 0.62,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });
      expect(result.wrote).toBe(true);

      const readBack = await relationStore.findById(relationId, { caseId });
      expect(readBack).not.toBeNull();
      expect(readBack!.sourceEntityId).toBe(entityA.entityId);
      expect(readBack!.targetEntityId).toBe(entityB.entityId);
      expect(readBack!.relationType).toBe("association");
      expect(readBack!.status).toBe("PROPOSED");
      expect(readBack!.scoreModelVersion).toBe(RELATION_SCORE_MODEL_VERSION);

      expect(entityA.entityId).not.toBeUndefined();
      expect(entityA.entityId).not.toMatch(/^00000000-0000-4000-8000-/);
      expect(readBack!.sourceEntityId).not.toMatch(/^00000000-0000-4000-8000-/);
    });

    it("M-A10 relation identity is deterministic — idempotent across re-runs", async () => {
      const entityA = await prepareAcceptedEntity("rel-idem-a@example.org", 1401, 1402, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-idem-b@example.org", 1403, 1404, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
      });
      const relIdentityKey = buildRelationHypothesisIdentityKey({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
      });

      const base = {
        id: relationId,
        identityKey: relIdentityKey,
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
        support: 0.5,
        evidenceBasis: [obsA, obsB],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 2,
        evidenceStrength: 0.5,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      };

      const first = await relationStore.upsertHypothesis(base);
      expect(first.wrote).toBe(true);
      expect(first.reusedExisting).toBe(false);

      const second = await relationStore.upsertHypothesis(base);
      expect(second.reusedExisting).toBe(true);

      const count = await relationStore.countByCaseAndStatus(caseId, "PROPOSED");
      expect(count).toBeGreaterThanOrEqual(1);

      const rows = await relationStore.listByCase(caseId, { investigationId });
      const matches = rows.filter((r) => r.id === relationId);
      expect(matches.length).toBe(1);
    });

    it("M-A10 lifecycle preservation — REVERSED status is never reset to PROPOSED on re-run", async () => {
      const entityA = await prepareAcceptedEntity("rel-rev-a@example.org", 1501, 1502, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-rev-b@example.org", 1503, 1504, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
      });
      const relIdentityKey = buildRelationHypothesisIdentityKey({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
      });

      const base = {
        id: relationId,
        identityKey: relIdentityKey,
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
        support: 0.5,
        evidenceBasis: [obsA, obsB],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 2,
        evidenceStrength: 0.5,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      };

      await relationStore.upsertHypothesis(base);

      await prisma.relationHypothesis.update({
        where: { id: relationId },
        data: { status: "REVERSED" },
      });

      const rerun = await relationStore.upsertHypothesis(base);
      expect(rerun.preservedExisting).toBe(true);

      const readBack = await relationStore.findById(relationId, { caseId });
      expect(readBack!.status).toBe("REVERSED");
    });

    it("M-A10 relation store is case-scoped", async () => {
      const entityA = await prepareAcceptedEntity("rel-scope-a@example.org", 1601, 1602, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-scope-b@example.org", 1603, 1604, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
      });
      const relIdentityKey = buildRelationHypothesisIdentityKey({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
      });

      await relationStore.upsertHypothesis({
        id: relationId,
        identityKey: relIdentityKey,
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
        support: 0.5,
        evidenceBasis: [obsA, obsB],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 2,
        evidenceStrength: 0.5,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });

      const inCase = await relationStore.findById(relationId, { caseId });
      expect(inCase).not.toBeNull();
      const otherCase = await relationStore.findById(relationId, { caseId: otherCaseId });
      expect(otherCase).toBeNull();
    });

    it("relation authority ACCEPT materializes a canonical Relation (durable-first)", async () => {
      const entityA = await prepareAcceptedEntity("rel-auth-a@example.org", 1701, 1702, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-auth-b@example.org", 1703, 1704, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "financial",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      await relationStore.upsertHypothesis({
        id: relationId,
        identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: entityA.entityId,
          targetEntityId: entityB.entityId,
          relationType: "financial",
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }),
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "financial",
        support: 0.7,
        evidenceBasis: [obsA, obsB],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 2,
        evidenceStrength: 0.65,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });

      const result = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: relationId, actor: "test@indago" },
        { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
      );

      expect(result.materialized).toBe(true);
      expect(result.hypothesis.status).toBe("ACCEPTED");

      const canonical = await prisma.relation.findUnique({ where: { id: result.relationId } });
      expect(canonical).not.toBeNull();
      expect(canonical!.sourceEntityId).toBe(entityA.entityId);
      expect(canonical!.targetEntityId).toBe(entityB.entityId);
      expect(canonical!.relationType).toBe("financial");
      expect(canonical!.directed).toBe(false);
      expect(canonical!.status).toBe("ACTIVE");
      expect(canonical!.hypothesisId).toBe(relationId);

      // Canonical RelationId is deterministic and distinct from the hypothesis id.
      expect(result.relationId).toBe(await deterministicRelationId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "financial",
        directed: false,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      }));
      expect(result.relationId).not.toBe(relationId);
    });

    it("relation authority re-accept converges — canonical relation not duplicated", async () => {
      const entityA = await prepareAcceptedEntity("rel-auth2-a@example.org", 1801, 1802, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-auth2-b@example.org", 1803, 1804, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "ownership",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      const upsert = () => relationStore.upsertHypothesis({
        id: relationId,
        identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: entityA.entityId,
          targetEntityId: entityB.entityId,
          relationType: "ownership",
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }),
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "ownership",
        support: 0.6,
        evidenceBasis: [obsA, obsB],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 2,
        evidenceStrength: 0.6,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: true,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });
      await upsert();

      const first = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: relationId, actor: "test@indago" },
        { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
      );

      // Re-accepting an already-ACCEPTED hypothesis is REFUSED by the authority
      // rather than duplicating — the canonical relation converges to a single row.
      await expect(
        materializeCanonicalRelationFromAcceptedHypothesis(
          { caseId, hypothesisId: relationId, actor: "test@indago" },
          { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
        ),
      ).rejects.toBeInstanceOf(RelationMaterializationError);

      const count = await prisma.relation.count({
        where: { caseId, relationKey: buildRelationKey({
          sourceEntityId: entityA.entityId,
          targetEntityId: entityB.entityId,
          relationType: "ownership",
          directed: true,
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }) },
      });
      expect(count).toBe(1);
    });

    it("relation authority REJECT (PROPOSED→REJECTED) creates no canonical relation", async () => {
      const entityA = await prepareAcceptedEntity("rel-rej-a@example.org", 1901, 1902, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-rej-b@example.org", 1903, 1904, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "financial",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      await relationStore.upsertHypothesis({
        id: relationId,
        identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: entityA.entityId,
          targetEntityId: entityB.entityId,
          relationType: "financial",
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }),
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "financial",
        support: 0.7,
        evidenceBasis: [obsA, obsB],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 2,
        evidenceStrength: 0.65,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });

      const updated = await rejectRelationHypothesis(
        { caseId, hypothesisId: relationId },
        { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
      );
      expect(updated.status).toBe("REJECTED");

      const canonicalCount = await prisma.relation.count({ where: { caseId } });
      // No canonical relation was created from the rejected hypothesis.
      const rejected = await prisma.relation.findMany({
        where: { caseId, hypothesisId: relationId },
      });
      expect(rejected.length).toBe(0);
      expect(canonicalCount).toBeGreaterThanOrEqual(0);
    });

    it("relation authority REVERSE (ACCEPTED→REVERSED) flips the canonical relation", async () => {
      const entityA = await prepareAcceptedEntity("rel-rev2-a@example.org", 2001, 2002, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-rev2-b@example.org", 2003, 2004, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "communication",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      await relationStore.upsertHypothesis({
        id: relationId,
        identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: entityA.entityId,
          targetEntityId: entityB.entityId,
          relationType: "communication",
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }),
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "communication",
        support: 0.6,
        evidenceBasis: [obsA],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 1,
        evidenceStrength: 0.6,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });

      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: relationId, actor: "test@indago" },
        { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
      );

      const reversed = await reverseRelationHypothesis(
        { caseId, hypothesisId: relationId },
        { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
      );
      expect(reversed.hypothesis.status).toBe("REVERSED");

      const canonicalId = await deterministicRelationId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "communication",
        directed: false,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      const canonical = await prisma.relation.findUnique({ where: { id: canonicalId } });
      expect(canonical).not.toBeNull();
      expect(canonical!.status).toBe("REVERSED");
      expect(canonical!.reversedAt).not.toBeNull();
    });

    it("relation authority refutes invalid / repeat transitions (transition guard)", async () => {
      const entityA = await prepareAcceptedEntity("rel-bad-a@example.org", 5001, 5002, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-bad-b@example.org", 5003, 5004, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      await relationStore.upsertHypothesis({
        id: relationId,
        identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: entityA.entityId,
          targetEntityId: entityB.entityId,
          relationType: "association",
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }),
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "association",
        support: 0.6,
        evidenceBasis: [obsA, obsB],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 2,
        evidenceStrength: 0.6,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });

      // PROPOSED cannot go straight to REVERSED (transition guard refuses).
      await expect(
        reverseRelationHypothesis(
          { caseId, hypothesisId: relationId },
          { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
        ),
      ).rejects.toBeInstanceOf(RelationHypothesisTransitionError);

      // A terminal REVERSED hypothesis cannot be re-accepted.
      await relationStore.updateStatus(relationId, { caseId }, "ACCEPTED");
      await relationStore.updateStatus(relationId, { caseId }, "REVERSED");
      await expect(
        materializeCanonicalRelationFromAcceptedHypothesis(
          { caseId, hypothesisId: relationId, actor: "test@indago" },
          { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
        ),
      ).rejects.toBeInstanceOf(RelationMaterializationError);

      const finalStatus = await relationStore.findById(relationId, { caseId });
      expect(finalStatus!.status).toBe("REVERSED");
    });

    it("canonical-relation read seams are case-scoped and ACTIVE-only", async () => {
      const entityA = await prepareAcceptedEntity("rel-scope2-a@example.org", 2201, 2202, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-scope2-b@example.org", 2203, 2204, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "family",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      await relationStore.upsertHypothesis({
        id: relationId,
        identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: entityA.entityId,
          targetEntityId: entityB.entityId,
          relationType: "family",
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }),
        caseId,
        investigationId,
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "family",
        support: 0.6,
        evidenceBasis: [obsA],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 1,
        evidenceStrength: 0.6,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: true,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: relationId, actor: "test@indago" },
        { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
      );

      const canonicalId = await deterministicRelationId({
        sourceEntityId: entityA.entityId,
        targetEntityId: entityB.entityId,
        relationType: "family",
        directed: true,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });

      const active = await canonRelationStore.listActiveByCase(caseId, { investigationId });
      const inCase = await canonRelationStore.findById(canonicalId, { caseId });
      expect(inCase).not.toBeNull();
      const otherCase = await canonRelationStore.findById(canonicalId, { caseId: otherCaseId });
      expect(otherCase).toBeNull();
      expect(active.some((r) => r.id === canonicalId)).toBe(true);
    });

    it("relation hypothesis lifecycle matrix is locked (valid + invalid transitions)", async () => {
      // REJECTED → REVERSED: explicitly KEPT (documented intentional behavior —
      // an explicit reverse of a rejection, preserving history; REVERSED != MERGED).
      const entityA = await prepareAcceptedEntity("rel-life-a@example.org", 5301, 5302, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-life-b@example.org", 5303, 5304, obsB, obsC);
      const probe = async (id: string) => relationStore.findById(id, { caseId });

      // --- Valid transitions ---
      // PROPOSED → REJECTED (then REJECTED → REVERSED, kept intentionally).
      {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "association", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        await relationStore.upsertHypothesis({
          id, identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
            relationType: "association", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "association", support: 0.6, evidenceBasis: [obsA, obsB], contradictions: [],
          status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 2,
          evidenceStrength: 0.6, sourceCoverage: 1, temporalCoverage: 1, directed: false,
          provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
        });
        await relationStore.updateStatus(id, { caseId }, "REJECTED");
        expect((await probe(id))!.status).toBe("REJECTED");
        // REJECTED → REVERSED is the documented intentional reverse-of-rejection.
        await relationStore.updateStatus(id, { caseId }, "REVERSED");
        expect((await probe(id))!.status).toBe("REVERSED");
      }

      // PROPOSED → ACCEPTED → REVERSED (full canonical path).
      {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "family", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        await relationStore.upsertHypothesis({
          id, identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
            relationType: "family", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "family", support: 0.7, evidenceBasis: [obsA], contradictions: [],
          status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 1,
          evidenceStrength: 0.7, sourceCoverage: 1, temporalCoverage: 1, directed: true,
          provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
        });
        await relationStore.updateStatus(id, { caseId }, "ACCEPTED");
        expect((await probe(id))!.status).toBe("ACCEPTED");
        await relationStore.updateStatus(id, { caseId }, "REVERSED");
        expect((await probe(id))!.status).toBe("REVERSED");
      }

      // --- Invalid transitions: every terminal/illegal move is refused. ---
      const expectRefused = async (promise: Promise<unknown>) =>
        expect(promise).rejects.toBeInstanceOf(RelationHypothesisTransitionError);

      // PROPOSED → REVERSED is illegal (no direct jump).
      {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "ownership", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        await relationStore.upsertHypothesis({
          id, identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
            relationType: "ownership", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "ownership", support: 0.5, evidenceBasis: [], contradictions: [],
          status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 0,
          evidenceStrength: 0.5, sourceCoverage: 1, temporalCoverage: 1, directed: false,
          provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
        });
        await expectRefused(relationStore.updateStatus(id, { caseId }, "REVERSED"));
        expect((await probe(id))!.status).toBe("PROPOSED");
      }

      // REJECTED → ACCEPTED is illegal (rejection is irreversible except to REVERSED).
      {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "communication", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        await relationStore.upsertHypothesis({
          id, identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
            relationType: "communication", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "communication", support: 0.6, evidenceBasis: [], contradictions: [],
          status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 0,
          evidenceStrength: 0.6, sourceCoverage: 1, temporalCoverage: 1, directed: true,
          provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
        });
        await relationStore.updateStatus(id, { caseId }, "REJECTED");
        await expectRefused(relationStore.updateStatus(id, { caseId }, "ACCEPTED"));
        expect((await probe(id))!.status).toBe("REJECTED");
      }

      // ACCEPTED → ACCEPTED (re-accept a resolved hypothesis) is illegal.
      {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "transport", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        await relationStore.upsertHypothesis({
          id, identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
            relationType: "transport", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "transport", support: 0.6, evidenceBasis: [], contradictions: [],
          status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 0,
          evidenceStrength: 0.6, sourceCoverage: 1, temporalCoverage: 1, directed: false,
          provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
        });
        await relationStore.updateStatus(id, { caseId }, "ACCEPTED");
        await expectRefused(relationStore.updateStatus(id, { caseId }, "ACCEPTED"));
        expect((await probe(id))!.status).toBe("ACCEPTED");
      }

      // REVERSED → anything is illegal (REVERSED is terminal).
      {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "financial", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        await relationStore.upsertHypothesis({
          id, identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
            relationType: "financial", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "financial", support: 0.6, evidenceBasis: [], contradictions: [],
          status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 0,
          evidenceStrength: 0.6, sourceCoverage: 1, temporalCoverage: 1, directed: true,
          provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
        });
        await relationStore.updateStatus(id, { caseId }, "ACCEPTED");
        await relationStore.updateStatus(id, { caseId }, "REVERSED");
        await expectRefused(relationStore.updateStatus(id, { caseId }, "ACCEPTED"));
        await expectRefused(relationStore.updateStatus(id, { caseId }, "REJECTED"));
        expect((await probe(id))!.status).toBe("REVERSED");
      }
    });

    it("relation authority is concurrency-safe: simultaneous accepts yield ONE canonical relation", async () => {
      const entityA = await prepareAcceptedEntity("rel-cc-a@example.org", 5401, 5402, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-cc-b@example.org", 5403, 5404, obsB, obsC);

      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
        relationType: "financial", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      await relationStore.upsertHypothesis({
        id: relationId, identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "financial", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }),
        caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
        relationType: "financial", support: 0.7, evidenceBasis: [obsA], contradictions: [],
        status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 1,
        evidenceStrength: 0.7, sourceCoverage: 1, temporalCoverage: 1, directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });

      // Fire BOTH accepts concurrently over the same transactional authority.
      const [r1, r2] = await Promise.allSettled([
        materializeCanonicalRelationFromAcceptedHypothesis(
          { caseId, hypothesisId: relationId, actor: "test@indago" },
          { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
        ),
        materializeCanonicalRelationFromAcceptedHypothesis(
          { caseId, hypothesisId: relationId, actor: "test@indago" },
          { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
        ),
      ]);

      // Exactly ONE accept may win; the other must be refused (no double-commit,
      // no duplicate canonical relation, no resurrection to a second ACCEPTED).
      const wins = [r1, r2].filter((r) => r.status === "fulfilled");
      const refusals = [r1, r2].filter((r) => r.status === "rejected");
      expect(wins.length).toBe(1);

      const canonicalId = await deterministicRelationId({
        sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
        relationType: "financial", directed: false, scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });

      const final0 = await relationStore.findById(relationId, { caseId });
      expect(final0!.status).toBe("ACCEPTED");
      const canonical = await canonRelationStore.findById(canonicalId, { caseId });
      expect(canonical).not.toBeNull();
      expect(canonical!.status).toBe("ACTIVE");

      // Exactly ONE ACTIVE canonical relation exists for this (source,target,
      // type,directed,model) — the deterministic canonical id is unique, so a
      // double-commit can never produce two rows for the same relation.
      const activeMatching = (await canonRelationStore.listActiveByCase(caseId, { investigationId }))
        .filter((r) => r.id === canonical!.id);
      expect(activeMatching.length).toBe(1);

      // The losing accept (if refused for "not PROPOSED") reports a clean refusal.
      expect(refusals.length).toBe(1);
    });

    it("relation authority idempotency: accept→accept, accept→reject, reject→accept are refused", async () => {
      const entityA = await prepareAcceptedEntity("rel-idm-a@example.org", 5501, 5502, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-idm-b@example.org", 5503, 5504, obsB, obsC);
      const expectRefused = async (p: Promise<unknown>) =>
        expect(p).rejects.toBeInstanceOf(RelationHypothesisTransitionError);

      // accept then re-accept → refused (terminal, no resurrection).
      {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "communication", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        await relationStore.upsertHypothesis({
          id, identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
            relationType: "communication", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "communication", support: 0.6, evidenceBasis: [], contradictions: [],
          status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 0,
          evidenceStrength: 0.6, sourceCoverage: 1, temporalCoverage: 1, directed: true,
          provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
        });
        await relationStore.acceptHypothesis(id, { caseId });
        await expectRefused(relationStore.acceptHypothesis(id, { caseId }));
        expect((await relationStore.findById(id, { caseId }))!.status).toBe("ACCEPTED");
      }

      // ACCEPTED → REJECTED is refused (authority decisions on resolved rows are terminal).
      {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "transport", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        await relationStore.upsertHypothesis({
          id, identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
            relationType: "transport", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "transport", support: 0.6, evidenceBasis: [], contradictions: [],
          status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 0,
          evidenceStrength: 0.6, sourceCoverage: 1, temporalCoverage: 1, directed: false,
          provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
        });
        await relationStore.acceptHypothesis(id, { caseId });
        await expectRefused(relationStore.rejectHypothesis(id, { caseId }));
        expect((await relationStore.findById(id, { caseId }))!.status).toBe("ACCEPTED");
      }

      // REJECTED → ACCEPTED is refused (rejection is seeded; only REJECTED→REVERSED is allowed).
      {
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "ownership", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        });
        await relationStore.upsertHypothesis({
          id, identityKey: buildRelationHypothesisIdentityKey({
            sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
            relationType: "ownership", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "ownership", support: 0.6, evidenceBasis: [], contradictions: [],
          status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 0,
          evidenceStrength: 0.6, sourceCoverage: 1, temporalCoverage: 1, directed: true,
          provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
        });
        await relationStore.rejectHypothesis(id, { caseId });
        await expectRefused(relationStore.acceptHypothesis(id, { caseId }));
        expect((await relationStore.findById(id, { caseId }))!.status).toBe("REJECTED");
      }
    });

    it("relation authority reverse races are refused (reverse→reverse, reverse→accept)", async () => {
      const entityA = await prepareAcceptedEntity("rel-rv-a@example.org", 5601, 5602, obsA, obsB);
      const entityB = await prepareAcceptedEntity("rel-rv-b@example.org", 5603, 5604, obsB, obsC);
      const expectRefused = async (p: Promise<unknown>) =>
        expect(p).rejects.toBeInstanceOf(RelationHypothesisTransitionError);

      const id = await deterministicRelationHypothesisId({
        sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
        relationType: "case-link", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      await relationStore.upsertHypothesis({
        id, identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
          relationType: "case-link", scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }),
        caseId, investigationId, sourceEntityId: entityA.entityId, targetEntityId: entityB.entityId,
        relationType: "case-link", support: 0.6, evidenceBasis: [], contradictions: [],
        status: "PROPOSED", scoreModelVersion: RELATION_SCORE_MODEL_VERSION, evidenceCount: 0,
        evidenceStrength: 0.6, sourceCoverage: 1, temporalCoverage: 1, directed: false,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });
      await relationStore.acceptHypothesis(id, { caseId });

      // reverse→reverse (REVERSED is terminal → second refused).
      await reverseRelationHypothesis(
        { caseId, hypothesisId: id },
        { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
      );
      await expectRefused(
        reverseRelationHypothesis(
          { caseId, hypothesisId: id },
          { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
        ),
      );
      // reverse→accept refused (REVERSED cannot be re-accepted) — the
      // materializer's own guard rejects a non-PROPOSED hypothesis.
      await expect(
        materializeCanonicalRelationFromAcceptedHypothesis(
          { caseId, hypothesisId: id, actor: "test@indago" },
          { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
        ),
      ).rejects.toBeInstanceOf(RelationMaterializationError);
      expect((await relationStore.findById(id, { caseId }))!.status).toBe("REVERSED");
    });
  },
);
