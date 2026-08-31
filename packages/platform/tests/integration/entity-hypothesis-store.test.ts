import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  EntityHypothesisSchema,
  CandidateResolutionSchema,
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
import { EntityHypothesisStore } from "../../src/persistence/entity-hypothesis-store.js";
import {
  ObservationStore,
  type SourceWriteRecord,
  type EvidenceWriteRecord,
} from "../../src/persistence/observation-store.js";
import { EntityMentionStore } from "../../src/persistence/entity-mention-store.js";
import { CandidatePairStore } from "../../src/persistence/candidate-pair-store.js";

// ============================================================================
// M-A09 EntityHypothesisStore — REAL round-trips against TEST_DATABASE_URL.
//
// Purpose: prove the durable hypothesis persistence boundary end-to-end
// against real Postgres. Requires TEST_DATABASE_URL/schema; the suite skips
// cleanly when unset.
//
// Full FK chain required: Source → Evidence → Observation →
// EntityMentionCandidate → CandidatePair → EntityHypothesis
//
// Tests cover:
//   - create + read hypothesis (schema round-trip)
//   - same pair retry (idempotency — identityKey @unique)
//   - concurrent identical writes (converge to one row)
//   - case scoping
//   - status preservation (PROPOSED→ACCEPTED→rerun→still ACCEPTED)
//   - supporting/contradicting arrays + non-overlap
//   - deterministic hypothesis ID (same pair + model = same ID)
//   - score model version differentiation
//   - read seams: findById, findByCandidatePair, listByCase, countByCaseAndStatus
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A09 EntityHypothesisStore integration (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let hypothesisStore: EntityHypothesisStore;
    let pairStore: CandidatePairStore;
    let candStore: EntityMentionStore;
    let obsStore: ObservationStore;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const otherCaseId = randomUUID();
    const sourceId = randomUUID();
    const evidenceId = randomUUID();
    const artifactId = randomUUID();
    const otherSourceId = randomUUID();
    const otherEvidenceId = randomUUID();

    const obsA = randomUUID();
    const obsB = randomUUID();
    const otherObsA = randomUUID();
    const otherObsB = randomUUID();

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

    function observationIdForCandidate(n: number): string {
      return n <= 100 ? obsA : obsB;
    }

    async function seedCandidate(
      obsId: string,
      n: number,
      csId: string = caseId,
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
        { investigationId, caseId: csId },
      );
      return cand;
    }

    async function buildPair(
      left: EntityMentionCandidate,
      right: EntityMentionCandidate,
      csId: string,
      sharedValue: string,
    ): Promise<{ identityKey: string; pair: CandidatePair }> {
      const a = { ...left, canonicalMatchValue: sharedValue };
      const b = { ...right, canonicalMatchValue: sharedValue };
      const { drafts } = blockCandidates(
        { candidates: [a, b], caseId: csId, investigationId },
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
      score?: number;
      status?: string;
      comparisonStatus?: string;
      scoreModelVersion?: string;
      supportingObservationIds?: string[];
      contradictingObservationIds?: string[];
    }): EntityHypothesis {
      const now = new Date().toISOString();
      return EntityHypothesisSchema.parse({
        id: params.id,
        caseId: params.pair.caseId,
        investigationId,
        candidatePairId: params.pair.id,
        supportingCandidateIds: [params.pair.leftCandidateId, params.pair.rightCandidateId],
        status: params.status ?? "PROPOSED",
        comparisonStatus: params.comparisonStatus ?? "COMPARED_AND_UNRESOLVED",
        score: params.score ?? 0.35,
        scoreModelVersion: params.scoreModelVersion ?? RESOLUTION_SCORE_MODEL_VERSION,
        supportingObservationIds: params.supportingObservationIds ?? [],
        contradictingObservationIds: params.contradictingObservationIds ?? [],
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

      await prisma.entityHypothesis.deleteMany({});
      await prisma.candidatePair.deleteMany({});
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});

      await obsStore.upsertSource(makeSource());
      await obsStore.upsertEvidence(makeEvidence(evidenceId, sourceId, caseId));
      await obsStore.ensureObservations(
        [
          {
            identityKey: buildObservationIdentityKeyFor(
              makeObservationRow(obsA, evidenceId, sourceId, caseId, { content: "balance 42000.00 AAA" }),
            ),
            observation: makeObservationRow(obsA, evidenceId, sourceId, caseId, { content: "balance 42000.00 AAA" }),
          },
          {
            identityKey: buildObservationIdentityKeyFor(
              makeObservationRow(obsB, evidenceId, sourceId, caseId, { content: "balance 42000.00 BBB" }),
            ),
            observation: makeObservationRow(obsB, evidenceId, sourceId, caseId, { content: "balance 42000.00 BBB" }),
          },
        ],
        { investigationId, caseId },
      );

      await obsStore.upsertSource(makeSource({ id: otherSourceId, caseId: otherCaseId }));
      await obsStore.upsertEvidence(makeEvidence(otherEvidenceId, otherSourceId, otherCaseId));
      await obsStore.ensureObservations(
        [
          {
            identityKey: buildObservationIdentityKeyFor(
              makeObservationRow(otherObsA, otherEvidenceId, otherSourceId, otherCaseId, { content: "other balance CCC" }),
            ),
            observation: makeObservationRow(otherObsA, otherEvidenceId, otherSourceId, otherCaseId, { content: "other balance CCC" }),
          },
          {
            identityKey: buildObservationIdentityKeyFor(
              makeObservationRow(otherObsB, otherEvidenceId, otherSourceId, otherCaseId, { content: "other balance DDD" }),
            ),
            observation: makeObservationRow(otherObsB, otherEvidenceId, otherSourceId, otherCaseId, { content: "other balance DDD" }),
          },
        ],
        { investigationId, caseId: otherCaseId },
      );
    });

    afterAll(async () => {
      await prisma.entityHypothesis.deleteMany({});
      await prisma.candidatePair.deleteMany({});
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});
      await prisma.$disconnect();
    });

    it("deterministicEntityHypothesisId produces same ID for same pair + model", async () => {
      const input = { candidatePairId: randomUUID(), scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION };
      const a = await deterministicEntityHypothesisId(input);
      const b = await deterministicEntityHypothesisId(input);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const different = await deterministicEntityHypothesisId({
        ...input,
        scoreModelVersion: "indago:resolution-score:v2",
      });
      expect(different).not.toBe(a);
    });

    it("upsertHypothesis creates a new hypothesis and findById reads it back with strict schema round-trip", async () => {
      const left = await seedCandidate(obsA, 1001);
      const right = await seedCandidate(obsB, 1002);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-hypo-1@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const hypothesis = buildTestHypothesis({
        id,
        pair,
        score: 0.35,
        supportingObservationIds: [obsA, obsB],
        contradictingObservationIds: [],
      });

      const result = await hypothesisStore.upsertHypothesis({
        identityKey: hypIdentityKey,
        hypothesis,
      });
      expect(result.wrote).toBe(true);
      expect(result.reusedExisting).toBe(false);
      expect(result.preservedExisting).toBe(false);

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack).not.toBeNull();
      expect(EntityHypothesisSchema.safeParse(readBack).success).toBe(true);
      expect(readBack!.id).toBe(id);
      expect(readBack!.candidatePairId).toBe(pair.id);
      expect(readBack!.score).toBe(0.35);
      expect(readBack!.status).toBe("PROPOSED");
      expect(readBack!.comparisonStatus).toBe("COMPARED_AND_UNRESOLVED");
      expect(readBack!.scoreModelVersion).toBe(RESOLUTION_SCORE_MODEL_VERSION);
    });

    it("same pair retry is idempotent — no duplicate hypothesis created", async () => {
      const left = await seedCandidate(obsA, 1101);
      const right = await seedCandidate(obsB, 1102);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-idem@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const hypothesis = buildTestHypothesis({ id, pair });

      const first = await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });
      expect(first.wrote).toBe(true);

      const second = await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });
      expect(second.wrote).toBe(true);
      expect(second.reusedExisting).toBe(true);

      const count = await hypothesisStore.countByCaseAndStatus(caseId, "PROPOSED");
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it("concurrent identical writes converge to one hypothesis row", async () => {
      const left = await seedCandidate(obsA, 1201);
      const right = await seedCandidate(obsB, 1202);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-concurrent@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const hypothesis = buildTestHypothesis({ id, pair });

      const [a, b] = await Promise.all([
        hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis }),
        hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis }),
      ]);

      expect(a.hypothesis.id).toBe(b.hypothesis.id);
      expect(a.hypothesis.id).toBe(id);

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack).not.toBeNull();
    });

    it("findByCandidatePair returns the hypothesis for a specific pair", async () => {
      const left = await seedCandidate(obsA, 1301);
      const right = await seedCandidate(obsB, 1302);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-findbypair@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const hypothesis = buildTestHypothesis({ id, pair });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const found = await hypothesisStore.findByCandidatePair(pair.id, {
        caseId,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      expect(found).not.toBeNull();
      expect(found!.candidatePairId).toBe(pair.id);
      expect(found!.id).toBe(id);

      const notFound = await hypothesisStore.findByCandidatePair(randomUUID(), { caseId });
      expect(notFound).toBeNull();
    });

    it("listByCase returns all hypotheses within case scope", async () => {
      const left = await seedCandidate(obsA, 1401);
      const right = await seedCandidate(obsB, 1402);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-listbycase@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const hypothesis = buildTestHypothesis({ id, pair });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const all = await hypothesisStore.listByCase(caseId, { investigationId });
      expect(all.length).toBeGreaterThan(0);
      for (const h of all) {
        expect(EntityHypothesisSchema.safeParse(h).success).toBe(true);
        expect(h.caseId).toBe(caseId);
      }
    });

    it("listByCase is case-scoped — otherCase hypotheses are excluded", async () => {
      const left = await seedCandidate(otherObsA, 1501, otherCaseId);
      const right = await seedCandidate(otherObsB, 1502, otherCaseId);
      const { identityKey, pair } = await buildPair(left, right, otherCaseId, "test-othercase@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const hypothesis = buildTestHypothesis({
        id,
        pair: { ...pair, caseId: otherCaseId },
      });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const mainCase = await hypothesisStore.listByCase(caseId, { investigationId });
      const otherCase = await hypothesisStore.listByCase(otherCaseId, { investigationId });
      expect(otherCase.length).toBeGreaterThanOrEqual(1);
      for (const h of mainCase) {
        expect(h.caseId).toBe(caseId);
      }
      for (const h of otherCase) {
        expect(h.caseId).toBe(otherCaseId);
      }
    });

    it("status preservation — ACCEPTED status is not overwritten on retry", async () => {
      const left = await seedCandidate(obsA, 1601);
      const right = await seedCandidate(obsB, 1602);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-preserve@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const proposedHypothesis = buildTestHypothesis({ id, pair, status: "PROPOSED" });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis: proposedHypothesis });

      await prisma.entityHypothesis.update({
        where: { id },
        data: { status: "ACCEPTED" },
      });

      const rerun = await hypothesisStore.upsertHypothesis({
        identityKey: hypIdentityKey,
        hypothesis: proposedHypothesis,
      });
      expect(rerun.preservedExisting).toBe(true);

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack!.status).toBe("ACCEPTED");
    });

    it("status preservation — REVERSED status is not overwritten on retry", async () => {
      const left = await seedCandidate(obsA, 1701);
      const right = await seedCandidate(obsB, 1702);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-reversed@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const proposedHypothesis = buildTestHypothesis({ id, pair, status: "PROPOSED" });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis: proposedHypothesis });

      await prisma.entityHypothesis.update({
        where: { id },
        data: { status: "REVERSED" },
      });

      const rerun = await hypothesisStore.upsertHypothesis({
        identityKey: hypIdentityKey,
        hypothesis: proposedHypothesis,
      });
      expect(rerun.preservedExisting).toBe(true);

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack!.status).toBe("REVERSED");
    });

    it("status preservation — REJECTED status is not overwritten on retry", async () => {
      const left = await seedCandidate(obsA, 1801);
      const right = await seedCandidate(obsB, 1802);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-rejected@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const proposedHypothesis = buildTestHypothesis({ id, pair, status: "PROPOSED" });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis: proposedHypothesis });

      await prisma.entityHypothesis.update({
        where: { id },
        data: { status: "REJECTED" },
      });

      const rerun = await hypothesisStore.upsertHypothesis({
        identityKey: hypIdentityKey,
        hypothesis: proposedHypothesis,
      });
      expect(rerun.preservedExisting).toBe(true);

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack!.status).toBe("REJECTED");
    });

    it("PROPOSED status IS refreshed on retry (not a preserved authority state)", async () => {
      const left = await seedCandidate(obsA, 1901);
      const right = await seedCandidate(obsB, 1902);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-refresh-proposed@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const v1 = buildTestHypothesis({ id, pair, score: 0.25, status: "PROPOSED" });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis: v1 });

      const v2 = buildTestHypothesis({ id, pair, score: 0.60, status: "PROPOSED" });
      const rerun = await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis: v2 });
      expect(rerun.preservedExisting).toBe(false);

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack!.status).toBe("PROPOSED");
      expect(readBack!.score).toBe(0.60);
    });

    it("supporting and contradicting observation arrays are stored correctly and do not overlap", async () => {
      const left = await seedCandidate(obsA, 2001);
      const right = await seedCandidate(obsB, 2002);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-support-contradict@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const hypothesis = buildTestHypothesis({
        id,
        pair,
        supportingObservationIds: [obsA, obsB],
        contradictingObservationIds: [],
      });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack).not.toBeNull();
      expect(readBack!.supportingObservationIds).toContain(obsA);
      expect(readBack!.supportingObservationIds).toContain(obsB);
      expect(readBack!.contradictingObservationIds).toHaveLength(0);

      const overlap = readBack!.supportingObservationIds.filter((o) =>
        readBack!.contradictingObservationIds.includes(o),
      );
      expect(overlap).toHaveLength(0);
    });

    it("hypothesis identity is deterministic — same pair + model version always yields same ID", async () => {
      const left = await seedCandidate(obsA, 2101);
      const right = await seedCandidate(obsB, 2102);
      const { pair } = await buildPair(left, right, caseId, "test-deterministic-id@example.org");

      const id1 = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const id2 = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      expect(id1).toBe(id2);

      const id3 = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: "indago:resolution-score:v2",
      });
      expect(id3).not.toBe(id1);
    });

    it("different score model version produces different hypothesis ID", async () => {
      const left = await seedCandidate(obsA, 2201);
      const right = await seedCandidate(obsB, 2202);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-diff-model@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const idV1 = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: "indago:resolution-score:v1",
      });
      const hypKeyV1 = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: "indago:resolution-score:v1",
      });

      const idV2 = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: "indago:resolution-score:v2",
      });
      const hypKeyV2 = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: "indago:resolution-score:v2",
      });

      expect(idV1).not.toBe(idV2);

      const hypV1 = buildTestHypothesis({
        id: idV1,
        pair,
        score: 0.35,
        scoreModelVersion: "indago:resolution-score:v1",
      });
      await hypothesisStore.upsertHypothesis({ identityKey: hypKeyV1, hypothesis: hypV1 });

      const hypV2 = buildTestHypothesis({
        id: idV2,
        pair,
        score: 0.50,
        scoreModelVersion: "indago:resolution-score:v2",
      });
      await hypothesisStore.upsertHypothesis({ identityKey: hypKeyV2, hypothesis: hypV2 });

      const foundV1 = await hypothesisStore.findByCandidatePair(pair.id, {
        caseId,
        scoreModelVersion: "indago:resolution-score:v1",
      });
      const foundV2 = await hypothesisStore.findByCandidatePair(pair.id, {
        caseId,
        scoreModelVersion: "indago:resolution-score:v2",
      });
      expect(foundV1).not.toBeNull();
      expect(foundV2).not.toBeNull();
      expect(foundV1!.id).toBe(idV1);
      expect(foundV2!.id).toBe(idV2);
      expect(foundV1!.score).toBe(0.35);
      expect(foundV2!.score).toBe(0.50);
    });

    it("score is stored exactly as the pure engine produced it — no platform recalculation", async () => {
      const left = await seedCandidate(obsA, 2301);
      const right = await seedCandidate(obsB, 2302);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-score-exact@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const exactScore = 0.25;
      const hypothesis = buildTestHypothesis({ id, pair, score: exactScore });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack!.score).toBe(exactScore);
    });

    it("no fake entityId/resolvedEntityId created in v1 Candidate↔Candidate", async () => {
      const left = await seedCandidate(obsA, 2401);
      const right = await seedCandidate(obsB, 2402);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-no-entity@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const hypothesis = buildTestHypothesis({ id, pair });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack).not.toBeNull();
      expect(readBack!.entityId).toBeUndefined();
      expect(readBack!.resolvedEntityId).toBeUndefined();
    });

    it("schema round-trip passes strict EntityHypothesisSchema parse on every field", async () => {
      const left = await seedCandidate(obsA, 2501);
      const right = await seedCandidate(obsB, 2502);
      const { identityKey, pair } = await buildPair(left, right, caseId, "test-roundtrip@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const id = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });

      const hypothesis = buildTestHypothesis({
        id,
        pair,
        score: 0.25,
        supportingObservationIds: [obsA],
        contradictingObservationIds: [],
      });
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const readBack = await hypothesisStore.findById(id, { caseId });
      expect(readBack).not.toBeNull();
      const parsed = EntityHypothesisSchema.safeParse(readBack);
      expect(parsed.success).toBe(true);
    });
  },
);
