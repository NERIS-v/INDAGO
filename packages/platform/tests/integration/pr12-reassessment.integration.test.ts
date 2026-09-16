// ============================================================================
// Phase 5A-PR12 — Incremental graph-hole reassessment (ordered change ledger)
// integration (REAL Postgres).
//
// Proves the reassessment worker loop end-to-end against the real schema
// exactly as the runner executes it in production:
//
//   - ordered change ledger: deterministic changeId dedup, per-case sequence,
//     cursor watermark, tail-skip, idempotent re-publication (crash-then-rerun);
//   - evidence-affecting pipeline over a persisted region + hole with a REAL
//     bounded context digest, including the contextSha256 skip gate
//     (SKIPPED_CONTEXT_UNCHANGED);
//   - per-case advisory-lock serialization across concurrent runBatch calls;
//   - failure isolation: a corrupt region fails its OWN item (change = PARTIAL,
//     cursor advances, other cases/holes untouched) — never a whole-case abort;
//   - graph-affecting trigger routing (ENTITY_RESOLUTION_ACCEPTED) with no
//     prior regions ⇒ well-formed COMPLETED/NO_AFFECTED;
//   - the frozen outcome-precedence producer rules (RESOLVED / SUPERSEDED /
//     CONTRADICTED / direction) as a pure surface of the same functions the
//     pipeline uses.
//
// REQUIRES TEST_DATABASE_URL/schema; suite skips cleanly when unset.
// ============================================================================

import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  DETECTION_POLICY_VERSION,
  GRAPH_HOLE_SCORING_POLICY_VERSION,
  PR12_REASSESSMENT_POLICY_VERSION,
  QualifiedGraphHoleCandidateSchema,
  RawGraphHoleCandidateSchema,
  canonicalizeGraphHoleCandidateIdentity,
  type QualifiedGraphHoleCandidate,
  type RawGraphHoleCandidate,
  type ReassessmentTrigger,
  type RegionIdentityV1,
} from '@indago/contracts';
import { sha256Hex, buildRegionIdentity, hashRegionIdentity } from '@indago/graph-hole-region';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import {
  deriveReassessmentOutcome,
  type AuthoritativeRelationRef,
} from '@indago/graph-hole-reassessment';
import { GraphHoleRegionAnalysisStore } from '../../src/persistence/graph-hole-region-analysis-store.js';
import { GraphHoleStore } from '../../src/persistence/graph-hole-store.js';
import { ObservationStore } from '../../src/persistence/observation-store.js';
import { EntityHypothesisStore } from '../../src/persistence/entity-hypothesis-store.js';
import { RelationHypothesisStore } from '../../src/persistence/relation-hypothesis-store.js';
import { RelationStore } from '../../src/persistence/relation-store.js';
import { EntityStore } from '../../src/persistence/entity-store.js';
import { GraphVersionStore } from '../../src/persistence/graph-version-store.js';
import { GraphProjectionService } from '../../src/relations/graph-version-service.js';
import { ReassessmentChangeStore } from '../../src/reassessment/reassessment-change-store.js';
import { ReassessmentRunner, type ReassessmentBatchResult } from '../../src/reassessment/reassessment-runner.js';
import {
  publishCaseChange,
  newObservationTrigger,
  entityResolutionAcceptedTrigger,
  type PublishedCaseChange,
} from '../../src/reassessment/publish-case-change.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const HEX64 = /^[0-9a-f]{64}$/;

// ----------------------------------------------------------------------------
// Fixture builders (mirrors PR6 patterns)
// ----------------------------------------------------------------------------

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function temporalInterval(
  start: string,
  end: string,
): {
  validFrom: { value: string; precision: 'day' };
  validTo: { value: string; precision: 'day' };
  precision: 'day';
  semantics: 'inferred';
} {
  return {
    validFrom: { value: start, precision: 'day' },
    validTo: { value: end, precision: 'day' },
    precision: 'day',
    semantics: 'inferred',
  };
}

function makeRegionIdentity(
  params: {
    caseId: string;
    graphVersionId: string;
    seedObservationIds: readonly string[];
    nodeIds: readonly string[];
    edgeIds: readonly string[];
    temporalContext?: unknown;
    regionPolicyVersion?: string;
    semanticRetrievalPolicyVersion?: string;
  },
): { identity: RegionIdentityV1; regionId: string } {
  const identity = buildRegionIdentity({
    caseId: params.caseId,
    graphVersionId: params.graphVersionId,
    seedObservationIds: sortedUnique(params.seedObservationIds),
    nodeIds: sortedUnique(params.nodeIds),
    edgeIds: sortedUnique(params.edgeIds),
    ...(params.temporalContext ? { temporalContext: params.temporalContext } : {}),
    regionPolicyVersion: params.regionPolicyVersion ?? 'v1',
    semanticRetrievalPolicyVersion: params.semanticRetrievalPolicyVersion ?? 'v1',
  });
  return { identity, regionId: hashRegionIdentity(identity) };
}

function buildRegionFixture(
  params: {
    caseId: string;
    graphVersionId: string;
    seedObservationIds: readonly string[];
    nodeIds: readonly string[];
    edgeIds: readonly string[];
    temporalContext?: { start: string; end: string } | null;
    regionPolicyVersion?: string;
    semanticRetrievalPolicyVersion?: string;
  },
): GraphHoleRegion {
  const { identity, regionId } = makeRegionIdentity({
    ...params,
    temporalContext: params.temporalContext
      ? temporalInterval(params.temporalContext.start, params.temporalContext.end)
      : undefined,
  });
  return {
    regionId,
    graphVersionId: params.graphVersionId,
    identity: identity as RegionIdentityV1,
    status: 'SATURATED',
    truncated: false,
    limitations: [],
    maxExpansionRounds: 2,
    maxRegionNodes: 500,
    maxRegionEdges: 500,
    maxContextObservations: 500,
    expansionRounds: 1,
    seedObservationIds: identity.seedObservationIds ?? [],
    resolvedSeedNodeIds: params.nodeIds.slice(0, 1) as string[],
    unresolvedSeedEntityIds: [],
    seedEdgeIds: [],
    nodeIds: sortedUnique(params.nodeIds),
    edgeIds: sortedUnique(params.edgeIds),
    roundRecords: [],
    saturation: { saturated: true, consecutiveSatisfyingRounds: 1 },
    semanticExpansion: {
      status: 'DISABLED',
      rounds: 0,
      totalSemanticResults: 0,
      totalMappedNodes: 0,
      totalUnresolved: 0,
      totalRejected: 0,
    },
  } as unknown as GraphHoleRegion;
}

function buildRawCandidate(
  params: {
    caseId: string;
    graphVersionId: string;
    regionId: string;
    detectorType: 'MISSING_EDGE' | 'ISOLATED_NODE' | 'BROKEN_CHAIN';
    nodeIds: readonly string[];
    expectedRelationshipType?: string | null;
    temporalScope?: unknown;
    supportingHypothesisIds?: string[];
    supportingObservationIds?: string[];
    contradictingObservationIds?: string[];
  },
): RawGraphHoleCandidate {
  const identity = {
    caseId: params.caseId,
    graphVersionId: params.graphVersionId,
    holeType: params.detectorType,
    canonicalNodeIds: [...params.nodeIds],
    ...(params.expectedRelationshipType ? { expectedRelationshipType: params.expectedRelationshipType } : {}),
    ...(params.temporalScope ? { temporalScope: params.temporalScope } : {}),
    detectionPolicyVersion: DETECTION_POLICY_VERSION,
  };
  const candidateId = sha256Hex(canonicalizeGraphHoleCandidateIdentity(identity));
  return RawGraphHoleCandidateSchema.parse({
    candidateId,
    caseId: params.caseId,
    graphVersionId: params.graphVersionId,
    regionId: params.regionId,
    detectionPolicyVersion: DETECTION_POLICY_VERSION,
    detectorType: params.detectorType,
    nodeIds: sortedUnique(params.nodeIds),
    observedEdgeIds: [],
    expectedRelationshipType: params.expectedRelationshipType ?? null,
    ...(params.temporalScope ? { temporalScope: params.temporalScope } : {}),
    supportingHypothesisIds: params.supportingHypothesisIds ?? [],
    supportingObservationIds: params.supportingObservationIds ?? [],
    contradictingObservationIds: params.contradictingObservationIds ?? [],
    structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT',
    detectorMetadata: {
      detectorType: params.detectorType,
      pairEvaluations: 42,
      boundReached: false,
    },
    provenance: {
      sourceId: randomUUID(),
      artifactId: randomUUID(),
      extractor: 'graph-hole-detection.v1',
      extractionMethod: 'test-fixture',
    },
  });
}

function buildQualifiedCandidate(
  raw: RawGraphHoleCandidate,
  overrides: Partial<QualifiedGraphHoleCandidate> = {},
): QualifiedGraphHoleCandidate {
  return QualifiedGraphHoleCandidateSchema.parse({
    rawCandidate: raw,
    qualified: true,
    failureReasons: [],
    structuralScore: 0.7,
    evidenceSupportScore: 0.6,
    expectedInformationValue: 0.5,
    significance: 0.55,
    independentSupportUnitIds: [],
    structuralComponents: { patternStrength: 0.7, connectivitySupport: 0.5 },
    scoreComponents: {
      evidenceSupport: {
        supportBreadth: 0.5,
        supportConsistency: 0.75,
        provenanceCompleteness: 0.6,
      },
      expectedInformationValue: {
        uncertaintyPotential: 0.4,
        hypothesisCoverage: 0.5,
        evidenceDiversity: 0.5,
      },
    },
    rankingKey: `${raw.candidateId}#0.55`,
    regionStatus: 'SATURATED',
    scoringPolicyVersion: GRAPH_HOLE_SCORING_POLICY_VERSION,
    ...overrides,
  });
}

// ----------------------------------------------------------------------------
// Suite
// ----------------------------------------------------------------------------

describe.skipIf(!TEST_DATABASE_URL)(
  'PR12 incremental reassessment integration (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let runner: ReassessmentRunner;
    let changeStore: ReassessmentChangeStore;

    const caseEmpty = randomUUID();
    const caseEvidence = randomUUID();
    const caseConcurrent = randomUUID();
    const caseCorrupt = randomUUID();
    const caseGraph = randomUUID();
    const allCases = [caseEmpty, caseEvidence, caseConcurrent, caseCorrupt, caseGraph];
    const investigationId = randomUUID();

    const nodeA = randomUUID();
    const nodeB = randomUUID();

    // Publish helper — binds the suite's change store + a no-op enqueue so this
    // suite stays Redis-free while still exercising the real publish seam.
    async function publish(input: {
      caseId: string;
      graphVersionId: string;
      trigger: ReassessmentTrigger;
    }): Promise<PublishedCaseChange> {
      return publishCaseChange(input, changeStore, async () => {});
    }

    async function cleanup(db: PrismaClient): Promise<void> {
      const inCases = { caseId: { in: allCases } };
      await db.reassessmentRun.deleteMany({ where: inCases });
      await db.caseReassessmentCursor.deleteMany({ where: inCases });
      await db.caseReassessmentChange.deleteMany({ where: inCases });
      await db.graphHoleAssessment.deleteMany({ where: inCases });
      await db.graphHoleDetectorContribution.deleteMany({ where: inCases });
      await db.graphHole.deleteMany({ where: inCases });
      await db.graphHoleRegionAnalysis.deleteMany({ where: inCases });
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      const graphVersions = new GraphVersionStore(prisma);
      const entities = new EntityStore(prisma);
      const relations = new RelationStore(prisma);
      changeStore = new ReassessmentChangeStore(prisma);
      runner = new ReassessmentRunner(
        {
          changeStore,
          holes: new GraphHoleStore(prisma),
          regions: new GraphHoleRegionAnalysisStore(prisma),
          observations: new ObservationStore(prisma),
          entityHypotheses: new EntityHypothesisStore(prisma),
          relationHypotheses: new RelationHypothesisStore(prisma),
          relations,
          graphVersions,
        },
        {
          graphProjection: new GraphProjectionService({
            graphVersions,
            entities,
            relations,
          }),
        },
      );
      await cleanup(prisma);
    });

    afterAll(async () => {
      await cleanup(prisma);
      await prisma.$disconnect();
    });

    // ------------------------------------------------------------------------
    // T1 — empty ledger, cursor, dedup, tail-skip
    // ------------------------------------------------------------------------

    it('T1: ordered ledger lifecycle — cursor watermark, deterministic dedup, tail-skip', async () => {
      const gvs = new GraphVersionStore(prisma);
      const v1 = await gvs.createVersion({
        caseId: caseEmpty,
        investigationId,
        status: 'DRAFT',
        reason: 'pr12-integration-t1',
      });
      const graphVersionId = v1.id;

      const obsA = randomUUID();
      const obsB = randomUUID();

      const changeA = await publish({
        caseId: caseEmpty,
        graphVersionId,
        trigger: newObservationTrigger({
          caseId: caseEmpty,
          observationId: obsA,
          observedAt: { value: '2024-01-01T00:00:00.000Z', precision: 'exact' },
        }),
      });
      const changeB = await publish({
        caseId: caseEmpty,
        graphVersionId,
        trigger: newObservationTrigger({
          caseId: caseEmpty,
          observationId: obsB,
          observedAt: { value: '2024-01-01T01:00:00.000Z', precision: 'exact' },
        }),
      });

      // Idempotent re-publication (crash-then-rerun) is a no-op — dedup, same seq.
      const dedupA = await publish({
        caseId: caseEmpty,
        graphVersionId,
        trigger: newObservationTrigger({
          caseId: caseEmpty,
          observationId: obsA,
          observedAt: { value: '2024-01-01T00:00:00.000Z', precision: 'exact' },
        }),
      });
      expect(dedupA.deduplicated).toBe(true);
      expect(dedupA.changeId).toBe(changeA.changeId);
      expect(dedupA.sequence).toBe(changeA.sequence);

      expect(changeA.sequence).toBe(1);
      expect(changeB.sequence).toBe(2);
      expect(changeA.effectClass).toBe('EVIDENCE_AFFECTING');

      const drain1 = await runner.runBatch(caseEmpty, null);
      expect(drain1.changesProcessed).toBe(2);
      expect(drain1.headChangeIds).toHaveLength(2);
      expect(drain1.tailChangesSkipped).toBe(0);
      expect(drain1.cursorAdvancedTo).toBe(2);
      expect(drain1.regionResults).toHaveLength(0);

      expect(
        await prisma.caseReassessmentChange.count({ where: { caseId: caseEmpty, status: 'PENDING' } }),
      ).toBe(0);
      const done = await prisma.caseReassessmentChange.findMany({
        where: { caseId: caseEmpty },
        orderBy: { sequence: 'asc' },
      });
      expect(done.map((c) => c.status)).toEqual(['COMPLETED', 'COMPLETED']);
      expect(done.map((c) => c.effectClass)).toEqual(['EVIDENCE_AFFECTING', 'EVIDENCE_AFFECTING']);

      const cursor = await prisma.caseReassessmentCursor.findUnique({ where: { caseId: caseEmpty } });
      expect(cursor?.lastProcessedSequence).toBe(2);
      expect(cursor?.policyVersion).toBe(PR12_REASSESSMENT_POLICY_VERSION);

      // Append-only audit: one frozen run envelope per change.
      expect(await prisma.reassessmentRun.count({ where: { caseId: caseEmpty } })).toBe(2);

      // Idle drain advances nothing.
      const idle = await runner.runBatch(caseEmpty, null);
      expect(idle.changesProcessed).toBe(0);
      expect(idle.cursorAdvancedTo).toBeNull();

      // Tail-skip: 3 new changes, bounded batch of 2 ⇒ third is recorded as a
      // modelled no-op (SKIPPED) and never re-picked; the cursor advances to the
      // highest APPLIED sequence in the batch.
      for (const [obs, t] of [
        [randomUUID(), '2024-01-01T02:00:00.000Z'],
        [randomUUID(), '2024-01-01T03:00:00.000Z'],
        [randomUUID(), '2024-01-01T04:00:00.000Z'],
      ] as const) {
        await publish({
          caseId: caseEmpty,
          graphVersionId,
          trigger: newObservationTrigger({
            caseId: caseEmpty,
            observationId: obs,
            observedAt: { value: t, precision: 'exact' },
          }),
        });
      }

      const drain2 = await runner.runBatch(caseEmpty, null, 2);
      expect(drain2.changesProcessed).toBe(2);
      expect(drain2.tailChangesSkipped).toBe(1);
      expect(drain2.cursorAdvancedTo).toBe(4);
      const skipped = await prisma.caseReassessmentChange.findFirst({
        where: { caseId: caseEmpty, sequence: 5 },
      });
      expect(skipped?.status).toBe('SKIPPED');

      // The SKIPPED change is terminal: a subsequent drain is idle.
      const drain3 = await runner.runBatch(caseEmpty, null, 2);
      expect(drain3.changesProcessed).toBe(0);
      expect(drain3.cursorAdvancedTo).toBeNull();
      expect(
        (await prisma.caseReassessmentCursor.findUnique({ where: { caseId: caseEmpty } })) ?? {},
      ).toMatchObject({ lastProcessedSequence: 4 });

      // Fresh changes after the skip sequence still process normally (seq 6).
      const obsF = randomUUID();
      const pubF = await publish({
        caseId: caseEmpty,
        graphVersionId,
        trigger: newObservationTrigger({
          caseId: caseEmpty,
          observationId: obsF,
          observedAt: { value: '2024-01-01T05:00:00.000Z', precision: 'exact' },
        }),
      });
      expect(pubF.sequence).toBe(6);
      const drain4 = await runner.runBatch(caseEmpty, null);
      expect(drain4.changesProcessed).toBe(1);
      expect(drain4.cursorAdvancedTo).toBe(6);

      // Republish after completion still dedupes; nothing is ever re-run.
      const rerun = await publish({
        caseId: caseEmpty,
        graphVersionId,
        trigger: newObservationTrigger({
          caseId: caseEmpty,
          observationId: obsB,
          observedAt: { value: '2024-01-01T01:00:00.000Z', precision: 'exact' },
        }),
      });
      expect(rerun.deduplicated).toBe(true);
      const final = await runner.runBatch(caseEmpty, null);
      expect(final.changesProcessed).toBe(0);
    }, 120_000);

    // ------------------------------------------------------------------------
    // T2 — evidence-affecting over a real region + hole; contextSha256 skip gate
    // ------------------------------------------------------------------------

    it('T2: evidence-affecting pipeline + contextSha256 gate skipping unchanged re-runs', async () => {
      const gvs = new GraphVersionStore(prisma);
      const regions = new GraphHoleRegionAnalysisStore(prisma);
      const holes = new GraphHoleStore(prisma);

      const v2 = await gvs.createVersion({
        caseId: caseEvidence,
        investigationId,
        status: 'DRAFT',
        reason: 'pr12-integration-t2',
      });
      const graphVersionId = v2.id;

      const obsSeed1 = randomUUID();
      const obsSeed2 = randomUUID();
      const region = buildRegionFixture({
        caseId: caseEvidence,
        graphVersionId,
        seedObservationIds: [obsSeed2, obsSeed1],
        nodeIds: [nodeB, nodeA],
        edgeIds: [],
      });
      await regions.persistRegionAnalysis({ caseId: caseEvidence, investigationId, region });

      const raw = buildRawCandidate({
        caseId: caseEvidence,
        graphVersionId,
        regionId: region.regionId,
        detectorType: 'MISSING_EDGE',
        nodeIds: [nodeA, nodeB],
        expectedRelationshipType: 'association',
      });
      const qualification = buildQualifiedCandidate(raw);
      const seeded = await holes.persistGraphHole({
        caseId: caseEvidence,
        investigationId,
        qualification,
        assessmentType: 'QUALIFICATION',
      });
      void seeded;

      // First NEW_OBSERVATION on the region's seed ⇒ region is affected.
      const pub1 = await publish({
        caseId: caseEvidence,
        graphVersionId,
        trigger: newObservationTrigger({
          caseId: caseEvidence,
          observationId: obsSeed1,
          observedAt: { value: '2024-02-01T00:00:00.000Z', precision: 'exact' },
        }),
      });
      const run1 = await runner.runBatch(caseEvidence, investigationId);
      expect(run1.changesProcessed).toBe(1);
      expect(run1.cursorAdvancedTo).toBe(1);
      expect(run1.regionResults).toHaveLength(1);

      const regionResult1 = run1.regionResults[0]!;
      const contextSha256 = regionResult1.contextSha256;
      expect(contextSha256).toBeDefined();
      expect(contextSha256).toMatch(HEX64);
      expect(['SKIPPED_NO_CHANGE', 'RECOMPUTED', 'SKIPPED_CONTEXT_UNCHANGED']).toContain(
        regionResult1.status,
      );
      expect(regionResult1.regionId).toBe(region.regionId);
      expect(pub1.effectClass).toBe('EVIDENCE_AFFECTING');

      const assessmentsAfterFirstRun = await prisma.graphHoleAssessment.count({
        where: { caseId: caseEvidence },
      });
      expect(assessmentsAfterFirstRun).toBeGreaterThanOrEqual(1);

      // Instrument the gate: stamp EVERY stored assessment with the digest the
      // previous run computed. The bounded context is byte-identical across both
      // runs (same region, same empty graph), so the second drain MUST skip
      // before detection/qualification.
      await prisma.graphHoleAssessment.updateMany({
        where: { caseId: caseEvidence },
        data: { contextSha256 },
      });

      // Second seed observation — same bounded context, new trigger/changeId.
      const pub2 = await publish({
        caseId: caseEvidence,
        graphVersionId,
        trigger: newObservationTrigger({
          caseId: caseEvidence,
          observationId: obsSeed2,
          observedAt: { value: '2024-02-01T02:00:00.000Z', precision: 'exact' },
        }),
      });
      expect(pub2.sequence).toBe(2);
      const run2 = await runner.runBatch(caseEvidence, investigationId);
      expect(run2.changesProcessed).toBe(1);
      expect(run2.cursorAdvancedTo).toBe(2);
      expect(run2.regionResults).toHaveLength(1);
      const regionResult2 = run2.regionResults[0]!;
      expect(regionResult2.status).toBe('SKIPPED_CONTEXT_UNCHANGED');
      expect(regionResult2.assessmentsAppended).toBe(0);
      expect(regionResult2.contextSha256).toBe(contextSha256);

      // Gate verified: no new assessment, hole untouched, change COMPLETED.
      const assessmentsAfterSecondRun = await prisma.graphHoleAssessment.count({
        where: { caseId: caseEvidence },
      });
      expect(assessmentsAfterSecondRun).toBe(assessmentsAfterFirstRun);
      expect(await prisma.graphHole.count({ where: { caseId: caseEvidence, status: 'ACTIVE' } })).toBe(1);

      const changeRows = await prisma.caseReassessmentChange.findMany({
        where: { caseId: caseEvidence },
        orderBy: { sequence: 'asc' },
      });
      expect(changeRows.map((c) => c.status)).toEqual(['COMPLETED', 'COMPLETED']);
      expect(changeRows[1]!.failureReason).toBeNull();
      expect(await prisma.reassessmentRun.count({ where: { caseId: caseEvidence } })).toBe(2);

      // Idle drain is truly idle now.
      const idle = await runner.runBatch(caseEvidence, investigationId);
      expect(idle.changesProcessed).toBe(0);
    }, 120_000);

    // ------------------------------------------------------------------------
    // T3 — per-case advisory-lock serialization across concurrent runBatch calls
    // ------------------------------------------------------------------------

    it('T3: concurrent runBatch on the SAME case serializes — every change once', async () => {
      const gvs = new GraphVersionStore(prisma);
      const v3 = await gvs.createVersion({
        caseId: caseConcurrent,
        investigationId,
        status: 'DRAFT',
        reason: 'pr12-integration-t3',
      });
      const graphVersionId = v3.id;

      // 6 distinct NEW_OBSERVATION changes, no regions anywhere ⇒ each drain
      // group resolves NO_AFFECTED and completes without any region work.
      const published: PublishedCaseChange[] = [];
      for (let i = 0; i < 6; i += 1) {
        published.push(
          await publish({
            caseId: caseConcurrent,
            graphVersionId,
            trigger: newObservationTrigger({
              caseId: caseConcurrent,
              observationId: randomUUID(),
              observedAt: {
                value: `2024-03-0${i + 1}T00:00:00.000Z`,
                precision: 'exact',
              },
            }),
          }),
        );
      }
      const changeIds = published.map((p) => p.changeId);
      expect(new Set(changeIds).size).toBe(6);

      // Two workers race on the same case. ONLY the per-case advisory lock
      // (pg_advisory_xact_lock held for the whole batch transaction) prevents
      // double-processing; serialization is asserted via exact accounting.
      const [r1, r2] = await Promise.all([
        runner.runBatch(caseConcurrent, null),
        runner.runBatch(caseConcurrent, null),
      ]);
      expect(r1.changesProcessed + r2.changesProcessed).toBe(6);
      expect(r1.changesProcessed > 0 || r2.changesProcessed > 0).toBe(true);

      const done = await prisma.caseReassessmentChange.findMany({
        where: { caseId: caseConcurrent },
        orderBy: { sequence: 'asc' },
      });
      expect(done.map((c) => c.status)).toEqual(Array(6).fill('COMPLETED'));
      expect(done.map((c) => c.changeId)).toEqual(changeIds);

      const cursor = await prisma.caseReassessmentCursor.findUnique({ where: { caseId: caseConcurrent } });
      expect(cursor?.lastProcessedSequence).toBe(6);

      // Exactly one run envelope per change — nothing double-applied.
      expect(await prisma.reassessmentRun.count({ where: { caseId: caseConcurrent } })).toBe(6);
      const runChangeCounts = await prisma.reassessmentRun.groupBy({
        by: ['changeId'],
        where: { caseId: caseConcurrent },
        _count: { changeId: true },
      });
      expect(runChangeCounts.every((r) => r._count.changeId === 1)).toBe(true);

      // Drain again — fully served.
      const idle = await runner.runBatch(caseConcurrent, null);
      expect(idle.changesProcessed).toBe(0);
    }, 120_000);

    // ------------------------------------------------------------------------
    // T4 — failure isolation: one corrupt region ⇒ PARTIAL, cursor advances
    // ------------------------------------------------------------------------

    it('T4: corrupt region identity fails ONLY its own item — PARTIAL, never whole-case abort', async () => {
      const gvs = new GraphVersionStore(prisma);
      const regions = new GraphHoleRegionAnalysisStore(prisma);
      const holes = new GraphHoleStore(prisma);

      const v4 = await gvs.createVersion({
        caseId: caseCorrupt,
        investigationId,
        status: 'DRAFT',
        reason: 'pr12-integration-t4',
      });
      const graphVersionId = v4.id;

      const obsSeed1 = randomUUID();
      const obsSeed2 = randomUUID();
      const region = buildRegionFixture({
        caseId: caseCorrupt,
        graphVersionId,
        seedObservationIds: [obsSeed1, obsSeed2],
        nodeIds: [nodeA, nodeB],
        edgeIds: [],
      });
      const persisted = await regions.persistRegionAnalysis({
        caseId: caseCorrupt,
        investigationId,
        region,
      });
      expect(persisted.created).toBe(true);

      // Corrupt the persisted region's content-address: the record's regionId no
      // longer equals hash(identity) ⇒ reconstruction must fail closed.
      const corruptedRegionId = `corrupted-${region.regionId}`;
      await prisma.graphHoleRegionAnalysis.update({
        where: { id: persisted.record.id },
        data: { regionId: corruptedRegionId },
      });

      // Bind the hole to the (now corrupt) region id so it lands in the plan.
      const raw = buildRawCandidate({
        caseId: caseCorrupt,
        graphVersionId,
        regionId: corruptedRegionId,
        detectorType: 'MISSING_EDGE',
        nodeIds: [nodeA, nodeB],
        expectedRelationshipType: 'association',
      });
      const qualification = buildQualifiedCandidate(raw);
      const seeded = await holes.persistGraphHole({
        caseId: caseCorrupt,
        investigationId,
        qualification,
        assessmentType: 'QUALIFICATION',
      });
      void seeded;

      await publish({
        caseId: caseCorrupt,
        graphVersionId,
        trigger: newObservationTrigger({
          caseId: caseCorrupt,
          observationId: obsSeed1,
          observedAt: { value: '2024-04-01T00:00:00.000Z', precision: 'exact' },
        }),
      });

      const run = await runner.runBatch(caseCorrupt, investigationId);
      expect(run.changesProcessed).toBe(1);
      expect(run.regionResults).toHaveLength(1);
      const regionResult = run.regionResults[0]!;
      expect(regionResult.status).toBe('FAILED');
      expect(regionResult.assessmentsAppended).toBe(0);
      expect(regionResult.holesSuperseded).toBe(0);

      const change = await prisma.caseReassessmentChange.findFirst({ where: { caseId: caseCorrupt } });
      expect(change?.status).toBe('PARTIAL');
      expect(change?.failureReason).toBe('one or more regions failed');

      // Cursor advances past the FAILED region; no silent retry on re-drain.
      expect(run.cursorAdvancedTo).toBe(1);
      expect(
        (await prisma.caseReassessmentCursor.findUnique({ where: { caseId: caseCorrupt } })) ?? {},
      ).toMatchObject({ lastProcessedSequence: 1 });

      // The hole and its qualification survived untouched.
      expect(await prisma.graphHole.count({ where: { caseId: caseCorrupt, status: 'ACTIVE' } })).toBe(1);
      expect(await prisma.graphHoleAssessment.count({ where: { caseId: caseCorrupt } })).toBe(1);
      expect(await prisma.reassessmentRun.count({ where: { caseId: caseCorrupt } })).toBe(1);

      // Other cases are untouched by the corruption (parallel-isolation check).
      expect(await prisma.caseReassessmentChange.count({ where: { caseId: caseEmpty } })).toBeGreaterThan(0);
      expect(await prisma.graphHole.count({ where: { caseId: caseEvidence } })).toBe(1);

      const again = await runner.runBatch(caseCorrupt, investigationId);
      expect(again.changesProcessed).toBe(0);
    }, 120_000);

    // ------------------------------------------------------------------------
    // T5 — GRAPH_AFFECTING trigger routing (no prior regions ⇒ well-formed)
    // ------------------------------------------------------------------------

    it('T5: ENTITY_RESOLUTION_ACCEPTED routes GRAPH_AFFECTING with a well-formed NO_AFFECTED envelope', async () => {
      const gvs = new GraphVersionStore(prisma);
      const v5 = await gvs.createVersion({
        caseId: caseGraph,
        investigationId,
        status: 'DRAFT',
        reason: 'pr12-integration-t5',
      });
      const graphVersionId = v5.id;

      const pub = await publish({
        caseId: caseGraph,
        graphVersionId,
        trigger: entityResolutionAcceptedTrigger({
          caseId: caseGraph,
          entityHypothesisId: randomUUID(),
          entityId: randomUUID(),
          graphVersionId,
          computedAt: { value: '2024-05-01T00:00:00.000Z', precision: 'exact' },
        }),
      });
      expect(pub.effectClass).toBe('GRAPH_AFFECTING');

      const run = await runner.runBatch(caseGraph, null);
      expect(run.changesProcessed).toBe(1);
      expect(run.regionResults).toHaveLength(0);
      expect(run.cursorAdvancedTo).toBe(1);

      const change = await prisma.caseReassessmentChange.findFirst({ where: { caseId: caseGraph } });
      expect(change?.effectClass).toBe('GRAPH_AFFECTING');
      expect(change?.status).toBe('COMPLETED');
      expect(change?.failureReason).toBeNull();

      expect(await prisma.reassessmentRun.count({ where: { caseId: caseGraph } })).toBe(1);
      const runRow = await prisma.reassessmentRun.findFirst({ where: { caseId: caseGraph } });
      const envelope = runRow?.envelope as { affectedSet?: { effectClass?: string; affectedRegionIds?: string[] }; accounting?: { appliedChangeCount?: number } };
      expect(envelope.affectedSet?.effectClass).toBe('GRAPH_AFFECTING');
      expect(envelope.affectedSet?.affectedRegionIds).toEqual([]);
    }, 120_000);

    // ------------------------------------------------------------------------
    // T6 — frozen outcome-precedence producer rules (pure, same fn as pipeline)
    // ------------------------------------------------------------------------

    it('T6: outcome precedence — RESOLVED>CONTRADICTED>direction, SUPERSEDED first, WEAKENED axis', async () => {
      const prior = {
        independentSupportUnitCount: 1,
        evidenceSupportScore: 0.5,
        structuralScore: 0.4,
        expectedInformationValue: 0.3,
        contradictingObservationIds: [],
      };
      const strongerOf = {
        independentSupportUnitCount: 2,
        evidenceSupportScore: 0.6,
        structuralScore: 0.45,
        expectedInformationValue: 0.35,
        contradictingObservationIds: [],
      };
      const weakerOf = {
        independentSupportUnitCount: 1,
        evidenceSupportScore: 0.4,
        structuralScore: 0.4,
        expectedInformationValue: 0.3,
        contradictingObservationIds: [],
      };
      const knowsAB: AuthoritativeRelationRef = {
        sourceNodeId: 'nA',
        targetNodeId: 'nB',
        relationType: 'association',
        directed: false,
      };

      // RESOLVED: authoritative canonical relation satisfies the expected
      // condition — even with zero support change (direction tie would be null).
      expect(
        deriveReassessmentOutcome({
          prior,
          current: {
            ...prior,
            expectedRelationshipType: 'association',
            canonicalNodeIds: ['nA', 'nB'],
          },
          presentRelations: [knowsAB],
          replacementCreated: false,
          candidateReplaced: false,
        }),
      ).toBe('RESOLVED');

      // Not resolved by mere strengthening: no matching authoritative relation.
      expect(
        deriveReassessmentOutcome({
          prior,
          current: {
            ...strongerOf,
            expectedRelationshipType: 'association',
            canonicalNodeIds: ['nA', 'nB'],
          },
          presentRelations: [],
          replacementCreated: false,
          candidateReplaced: false,
        }),
      ).toBe('STRENGTHENED');

      // Weak evidence ⇒ WEAKENED.
      expect(
        deriveReassessmentOutcome({
          prior,
          current: {
            ...weakerOf,
            expectedRelationshipType: null,
            canonicalNodeIds: ['nA', 'nB'],
          },
          presentRelations: [],
          replacementCreated: false,
          candidateReplaced: false,
        }),
      ).toBe('WEAKENED');

      // A NEW contradiction overrides the direction even when support grew.
      expect(
        deriveReassessmentOutcome({
          prior,
          current: {
            ...strongerOf,
            contradictingObservationIds: ['obs-new'],
            expectedRelationshipType: null,
            canonicalNodeIds: ['nA', 'nB'],
          },
          presentRelations: [],
          replacementCreated: false,
          candidateReplaced: false,
        }),
      ).toBe('CONTRADICTED');

      // SUPERSEDED outranks everything (even a satisfiable replacement).
      expect(
        deriveReassessmentOutcome({
          prior,
          current: {
            ...strongerOf,
            expectedRelationshipType: 'association',
            canonicalNodeIds: ['nA', 'nB'],
          },
          presentRelations: [knowsAB],
          replacementCreated: true,
          candidateReplaced: true,
        }),
      ).toBe('SUPERSEDED');

      // Score-direction tie ⇒ null (no-change), never a phantom outcome.
      expect(
        deriveReassessmentOutcome({
          prior,
          current: {
            ...prior,
            expectedRelationshipType: null,
            canonicalNodeIds: ['nA', 'nB'],
          },
          presentRelations: [],
          replacementCreated: false,
          candidateReplaced: false,
        }),
      ).toBeNull();
    });
  },
);