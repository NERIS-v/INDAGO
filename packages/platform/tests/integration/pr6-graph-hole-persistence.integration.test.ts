// ============================================================================
// Phase 5A-PR6 — GraphHole persistence integration (REAL Postgres).
//
// Purpose: prove the durable GraphHole persistence boundary end-to-end against
// real Postgres exactly as the ownership decision documents it:
//
//   - Producer: PR4/PR5 deterministic pipeline (persistence-free).
//   - Persistence & intelligence lifecycle: GraphHole stores (states
//     ACTIVE / SUPERSEDED / REJECTED / RESOLVED).
//   - Human consequential state: owned by the Phase-4 Lead authority.
//
// REQUIRES TEST_DATABASE_URL/schema; suite skips cleanly when unset.
//
// Covers (real-DB only; no mocks of Prisma/SQL):
//   - RegionAnalysis: exact identity round-trip, idempotent re-persist,
//     equivalent-analysis lookup, authority/identity guards, concurrent
//     identical writes converge, case isolation.
//   - GraphHole: qualified persist -> row + contribution + QUALIFICATION
//     assessment; strict read-back; authority/identity guards; UNQUALIFIED
//     rejected; identical re-run convergence (single row, single assessment,
//     single contribution); reassessment with changed snapshot appends;
//     concurrent identical writes converge; multi-detector coexistence;
//     first-provenance preservation; supersession single-demotion invariant;
//     INVALID_SUPERSESSION; transition machine ACTIVE->REJECTED->ACTIVE->
//     RESOLVED + terminal RESOLVED; append-only assessments ordering.
// ============================================================================

import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  DETECTION_POLICY_VERSION,
  GRAPH_HOLE_POLICY_VERSION,
  GRAPH_HOLE_SCORING_POLICY_VERSION,
  QualifiedGraphHoleCandidateSchema,
  RawGraphHoleCandidateSchema,
  canonicalizeGraphHoleCandidateIdentity,
  type QualifiedGraphHoleCandidate,
  type RawGraphHoleCandidate,
  type RegionIdentityV1,
} from '@indago/contracts';
import { sha256Hex, buildRegionIdentity, hashRegionIdentity } from '@indago/graph-hole-region';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import {
  GraphHoleRegionAnalysisStore,
  type RegionAnalysisRecord,
} from '../../src/persistence/graph-hole-region-analysis-store.js';
import {
  GraphHoleStore,
  type GraphHoleRecord,
} from '../../src/persistence/graph-hole-store.js';
import { GraphHoleStoreError } from '../../src/persistence/graph-hole-errors.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// ----------------------------------------------------------------------------
// Fixture builders
// ----------------------------------------------------------------------------

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
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
  const { identity, regionId } = makeRegionIdentity(params);
  return {
    regionId,
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
    nodeIds: [...params.nodeIds],
    edgeIds: [...params.edgeIds],
    roundRecords: [],
    saturation: { saturated: true, consecutiveSatisfyingRounds: 1 },
    semanticExpansion: {
      status: 'DISABLED',
      rounds: 0,
      totalSemanticResults: 0,
      totalMappedNodes: 0,
      totalUnresolved: 0,
      totalRejected: 0,
      semanticNodeBoundReached: false,
      totalResultsBoundReached: false,
      providerTruncated: false,
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
      sourceId: 'src-fixture',
      artifactId: 'art-fixture',
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
  'PR6 GraphHole persistence integration (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let regionStore: GraphHoleRegionAnalysisStore;
    let graphHoleStore: GraphHoleStore;

    const caseId = randomUUID();
    const otherCaseId = randomUUID();
    const investigationId = randomUUID();
    const graphVersionId = randomUUID();
    const nodeIds = [randomUUID(), randomUUID(), randomUUID()];
    const edgeIds = [randomUUID(), randomUUID()];
    const seedObservationIds = [randomUUID()];

    async function tableCounts(csId: string) {
      return {
        holes: await prisma.graphHole.count({ where: { caseId: csId } }),
        contributions: await prisma.graphHoleDetectorContribution.count({ where: { caseId: csId } }),
        assessments: await prisma.graphHoleAssessment.count({ where: { caseId: csId } }),
        regions: await prisma.graphHoleRegionAnalysis.count({ where: { caseId: csId } }),
      };
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      regionStore = new GraphHoleRegionAnalysisStore(prisma);
      graphHoleStore = new GraphHoleStore(prisma);

      await prisma.graphHoleAssessment.deleteMany({});
      await prisma.graphHoleDetectorContribution.deleteMany({});
      await prisma.graphHole.deleteMany({});
      await prisma.graphHoleRegionAnalysis.deleteMany({});
    });

    afterAll(async () => {
      await prisma.graphHoleAssessment.deleteMany({});
      await prisma.graphHoleDetectorContribution.deleteMany({});
      await prisma.graphHole.deleteMany({});
      await prisma.graphHoleRegionAnalysis.deleteMany({});
      await prisma.$disconnect();
    });

    // --------------------------------------------------------------------------
    // GraphHoleRegionAnalysisStore
    // --------------------------------------------------------------------------

    describe('GraphHoleRegionAnalysisStore', () => {
      it('persists a region analysis and round-trips the exact identity', async () => {
        const region = buildRegionFixture({
          caseId,
          graphVersionId,
          seedObservationIds,
          nodeIds,
          edgeIds,
          temporalContext: { start: '2023-01-01T00:00:00.000Z', end: '2023-06-01T00:00:00.000Z' },
        });
        const result = await regionStore.persistRegionAnalysis({ caseId, investigationId, region });
        expect(result.created).toBe(true);

        const rec = result.record;
        expect(rec.regionId).toBe(region.regionId);
        expect(rec.caseId).toBe(caseId);
        expect(rec.investigationId).toBe(investigationId);
        expect(rec.graphVersionId).toBe(graphVersionId);
        expect(rec.regionPolicyVersion).toBe('v1');
        expect(rec.semanticRetrievalPolicyVersion).toBe('v1');
        expect(rec.status).toBe('SATURATED');
        expect(rec.truncated).toBe(false);
        expect(rec.seedObservationIds).toEqual(sortedUnique(seedObservationIds));
        expect(rec.nodeIds).toEqual(sortedUnique(nodeIds));
        expect(rec.edgeIds).toEqual(sortedUnique(edgeIds));
        expect(rec.summary?.finalNodeCount).toBe(nodeIds.length);
        expect(rec.summary?.finalEdgeCount).toBe(edgeIds.length);
      });

      it('identical re-persist is a no-op (created=false) and converges to one row', async () => {
        const region = buildRegionFixture({ caseId, graphVersionId, seedObservationIds, nodeIds, edgeIds });
        const first = await regionStore.persistRegionAnalysis({ caseId, region });
        expect(first.created).toBe(true);
        const second = await regionStore.persistRegionAnalysis({ caseId, region });
        expect(second.created).toBe(false);
        expect(second.record.regionId).toBe(region.regionId);
        const count = await prisma.graphHoleRegionAnalysis.count({
          where: { identityKey: second.record.identityKey, caseId },
        });
        expect(count).toBe(1);
      });

      it('no-repeat lookup: findCompletedByRegionIdentity returns the completed record', async () => {
        const region = buildRegionFixture({
          caseId,
          graphVersionId,
          seedObservationIds,
          nodeIds,
          edgeIds,
          temporalContext: { start: '2023-01-01T00:00:00.000Z', end: '2023-06-01T00:00:00.000Z' },
        });
        const found = await regionStore.findCompletedByRegionIdentity({
          caseId,
          graphVersionId,
          identity: region.identity,
        });
        expect(found).not.toBeNull();
        expect(found!.regionId).toBe(region.regionId);
      });

      it('no-repeat lookup: findCompletedByRegionId matches only on exact equivalent identity', async () => {
        const region = buildRegionFixture({
          caseId,
          graphVersionId,
          seedObservationIds,
          nodeIds,
          edgeIds,
          temporalContext: { start: '2023-01-01T00:00:00.000Z', end: '2023-06-01T00:00:00.000Z' },
        });
        const equivalent = await regionStore.findCompletedByRegionId({
          caseId,
          graphVersionId,
          regionId: region.regionId,
          regionPolicyVersion: 'v1',
          semanticRetrievalPolicyVersion: 'v1',
        });
        expect(equivalent).not.toBeNull();
        expect(equivalent!.identityKey).toBe(regionStore.regionIdentityKey(region.identity));

        const differentVersion = await regionStore.findCompletedByRegionId({
          caseId,
          graphVersionId: randomUUID(),
          regionId: region.regionId,
          regionPolicyVersion: 'v1',
          semanticRetrievalPolicyVersion: 'v1',
        });
        expect(differentVersion).toBeNull();
      });

      it('rejects AUTHORITY_MISMATCH (case identity != caller case)', async () => {
        const region = buildRegionFixture({ caseId, graphVersionId, seedObservationIds, nodeIds, edgeIds });
        let error: GraphHoleStoreError | null = null;
        try {
          await regionStore.persistRegionAnalysis({ caseId: otherCaseId, region });
        } catch (e) {
          error = e as GraphHoleStoreError;
        }
        expect(error).toBeInstanceOf(GraphHoleStoreError);
        expect(error!.code).toBe('AUTHORITY_MISMATCH');
      });

      it('rejects INVALID_IDENTITY (tampered regionId)', async () => {
        const region = buildRegionFixture({ caseId, graphVersionId, seedObservationIds, nodeIds, edgeIds });
        const tampered = { ...region, regionId: '0'.repeat(64) } as GraphHoleRegion;
        let error: GraphHoleStoreError | null = null;
        try {
          await regionStore.persistRegionAnalysis({ caseId, region: tampered });
        } catch (e) {
          error = e as GraphHoleStoreError;
        }
        expect(error).toBeInstanceOf(GraphHoleStoreError);
        expect(error!.code).toBe('INVALID_IDENTITY');
      });

      it('concurrent identical persists converge to exactly one row', async () => {
        const region = buildRegionFixture({
          caseId: otherCaseId,
          graphVersionId: randomUUID(),
          seedObservationIds,
          nodeIds: [randomUUID(), randomUUID()],
          edgeIds: [],
        });
        const [a, b] = await Promise.all([
          regionStore.persistRegionAnalysis({ caseId: otherCaseId, region }),
          regionStore.persistRegionAnalysis({ caseId: otherCaseId, region }),
        ]);
        expect(a.record.regionId).toBe(region.regionId);
        expect(b.record.regionId).toBe(region.regionId);
        const count = await prisma.graphHoleRegionAnalysis.count({
          where: { identityKey: a.record.identityKey, caseId: otherCaseId },
        });
        expect(count).toBe(1);
        expect(a.created || b.created).toBe(true);
      });
    });

    // --------------------------------------------------------------------------
    // GraphHoleStore
    // --------------------------------------------------------------------------

    describe('GraphHoleStore', () => {
      const region = buildRegionFixture({
        caseId,
        graphVersionId,
        seedObservationIds,
        nodeIds,
        edgeIds,
        temporalContext: { start: '2023-01-01T00:00:00.000Z', end: '2023-06-01T00:00:00.000Z' },
      });
      const expectedRelationType = 'communication';

      function rawFor(detectorType: 'MISSING_EDGE' | 'ISOLATED_NODE' | 'BROKEN_CHAIN', overrides = {}) {
        return buildRawCandidate({
          caseId,
          graphVersionId,
          regionId: region.regionId,
          detectorType,
          nodeIds: nodeIds.slice(0, 2),
          expectedRelationshipType: detectorType === 'MISSING_EDGE' ? expectedRelationType : null,
          temporalScope: { start: '2023-02-01T00:00:00.000Z', end: '2023-02-28T00:00:00.000Z' },
          supportingHypothesisIds: ['h-1'],
          supportingObservationIds: seedObservationIds,
          contradictingObservationIds: [],
          ...overrides,
        });
      }

      it('persists a qualified candidate: GraphHole + contribution + QUALIFICATION assessment, strict read-back', async () => {
        const raw = rawFor('MISSING_EDGE');
        const qualification = buildQualifiedCandidate(raw);
        const result = await graphHoleStore.persistGraphHole({ caseId, investigationId, qualification });
        expect(result.created).toBe(true);

        const rec = result.record;
        expect(rec.candidateId).toBe(raw.candidateId);
        expect(rec.caseId).toBe(caseId);
        expect(rec.graphVersionId).toBe(graphVersionId);
        expect(rec.regionId).toBe(region.regionId);
        expect(rec.holeType).toBe('MISSING_EDGE');
        expect(rec.expectedRelationshipType).toBe(expectedRelationType);
        expect(rec.canonicalNodeIds).toEqual(sortedUnique(nodeIds.slice(0, 2)));
        expect(rec.detectionPolicyVersion).toBe(DETECTION_POLICY_VERSION);
        expect(rec.scoringPolicyVersion).toBe(GRAPH_HOLE_SCORING_POLICY_VERSION);
        expect(rec.qualificationPolicyVersion).toBe(GRAPH_HOLE_POLICY_VERSION);
        expect(rec.status).toBe('ACTIVE');
        expect(rec.structuralScore).toBe(0.7);
        expect(rec.significance).toBe(0.55);
        expect(rec.supersedesGraphHoleId).toBeNull();
        expect(rec.id).not.toBe(raw.candidateId); // record id ≠ domain candidate id

        const counts = await tableCounts(caseId);
        expect(counts.holes).toBe(1);
        expect(counts.contributions).toBe(1);
        expect(counts.assessments).toBe(1);

        const contribution = await prisma.graphHoleDetectorContribution.findFirst({
          where: { graphHoleId: rec.id },
        });
        expect(contribution).not.toBeNull();
        expect(contribution!.detectorType).toBe('MISSING_EDGE');
        expect(contribution!.provenance).toMatchObject({ extractor: 'graph-hole-detection.v1' });

        const assessment = await prisma.graphHoleAssessment.findFirst({
          where: { graphHoleId: rec.id },
        });
        expect(assessment).not.toBeNull();
        expect(assessment!.assessmentType).toBe('QUALIFICATION');
        expect(assessment!.sequence).toBe(1);
      });

      it('rejects INVALID_IDENTITY for a tampered candidateId', async () => {
        const raw = rawFor('ISOLATED_NODE');
        const qualification = buildQualifiedCandidate({ ...raw, candidateId: '0'.repeat(64) });
        let error: GraphHoleStoreError | null = null;
        try {
          await graphHoleStore.persistGraphHole({ caseId, qualification });
        } catch (e) {
          error = e as GraphHoleStoreError;
        }
        expect(error).toBeInstanceOf(GraphHoleStoreError);
        expect(error!.code).toBe('INVALID_IDENTITY');
      });

      it('rejects AUTHORITY_MISMATCH (candidate belongs to another case)', async () => {
        const raw = rawFor('BROKEN_CHAIN');
        const qualification = buildQualifiedCandidate(raw);
        let error: GraphHoleStoreError | null = null;
        try {
          await graphHoleStore.persistGraphHole({ caseId: otherCaseId, qualification });
        } catch (e) {
          error = e as GraphHoleStoreError;
        }
        expect(error).toBeInstanceOf(GraphHoleStoreError);
        expect(error!.code).toBe('AUTHORITY_MISMATCH');
      });

      it('never persists UNQUALIFIED candidates', async () => {
        const raw = rawFor('BROKEN_CHAIN');
        const unqualified = buildQualifiedCandidate(raw, { qualified: false });
        let error: GraphHoleStoreError | null = null;
        try {
          await graphHoleStore.persistGraphHole({ caseId, qualification: unqualified });
        } catch (e) {
          error = e as GraphHoleStoreError;
        }
        expect(error).toBeInstanceOf(GraphHoleStoreError);
        expect(error!.code).toBe('UNQUALIFIED_CANDIDATE');
      });

      it('identical re-run converges: one row, one contribution, one assessment (logicalKey dedup)', async () => {
        const raw = rawFor('ISOLATED_NODE');
        const qualification = buildQualifiedCandidate(raw);
        const first = await graphHoleStore.persistGraphHole({ caseId, qualification });
        const second = await graphHoleStore.persistGraphHole({ caseId, qualification });
        const third = await graphHoleStore.persistGraphHole({ caseId, qualification });

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(third.created).toBe(false);
        expect(second.record.id).toBe(first.record.id);

        const contributionCount = await prisma.graphHoleDetectorContribution.count({
          where: { graphHoleId: first.record.id },
        });
        expect(contributionCount).toBe(1);
        const assessmentCount = await prisma.graphHoleAssessment.count({
          where: { graphHoleId: first.record.id },
        });
        expect(assessmentCount).toBe(1);
      });

      it('reassessment with a changed snapshot appends a REASSESSMENT and updates the current record', async () => {
        const raw = rawFor('MISSING_EDGE');
        const base = buildQualifiedCandidate(raw, { evidenceSupportScore: 0.6 });
        const result = await graphHoleStore.persistGraphHole({ caseId, qualification: base });
        const reassessed = buildQualifiedCandidate(raw, { evidenceSupportScore: 0.85, significance: 0.8 });
        const rerun = await graphHoleStore.persistGraphHole({ caseId, qualification: reassessed });

        expect(rerun.created).toBe(false);
        expect(rerun.record.id).toBe(result.record.id);
        expect(rerun.record.evidenceSupportScore).toBe(0.85);
        expect(rerun.record.significance).toBe(0.8);

        const assessments = await prisma.graphHoleAssessment.findMany({
          where: { graphHoleId: result.record.id },
          orderBy: { sequence: 'asc' },
        });
        expect(assessments.map((a) => a.assessmentType)).toEqual(['QUALIFICATION', 'REASSESSMENT']);
        expect(assessments[0]!.sequence).toBe(1);
        expect(assessments[1]!.sequence).toBe(2);
      });

      it('concurrent identical persists converge to one row', async () => {
        const raw = rawFor('BROKEN_CHAIN');
        const qualification = buildQualifiedCandidate(raw);
        const [a, b] = await Promise.all([
          graphHoleStore.persistGraphHole({ caseId, qualification }),
          graphHoleStore.persistGraphHole({ caseId, qualification }),
        ]);
        expect(a.record.id).toBe(b.record.id);
        expect(a.record.candidateId).toBe(raw.candidateId);
        const contributionCount = await prisma.graphHoleDetectorContribution.count({
          where: { graphHoleId: a.record.id },
        });
        expect(contributionCount).toBe(1);
      });

      it('concurrent different-content reassessments allocate unique, gap-free sequences (no lost assessment)', async () => {
        const raw = rawFor('BROKEN_CHAIN', { graphVersionId: randomUUID() });
        const seed = buildQualifiedCandidate(raw, { significance: 0.6 });
        const vA = buildQualifiedCandidate(raw, { significance: 0.61 });
        const vB = buildQualifiedCandidate(raw, { significance: 0.62 });

        const seeded = await graphHoleStore.persistGraphHole({ caseId, qualification: seed });
        expect(seeded.created).toBe(true);
        const holeId = seeded.record.id;

        // Two reassessments with DIFFERENT content (distinct logicalKeys) race
        // for the same next sequence. Both compute nextSequence = max+1 inside
        // their own transaction; at most one can insert; the loser must fail on
        // the unique (graphHoleId, sequence) constraint - never deadlock, never
        // overwrite, never lose an assessment.
        const snapshots: QualifiedGraphHoleCandidate[] = [vA, vB];
        const settled = await Promise.allSettled(
          snapshots.map((s) => graphHoleStore.persistGraphHole({ caseId, qualification: s })),
        );
        expect(settled.some((r) => r.status === 'fulfilled')).toBe(true);

        const losers: Array<{ snapshot: QualifiedGraphHoleCandidate; reason: unknown }> = [];
        for (let i = 0; i < settled.length; i++) {
          const r = settled[i]!;
          if (r.status === 'rejected') {
            losers.push({ snapshot: snapshots[i]!, reason: r.reason });
          }
        }
        for (const loser of losers) {
          expect(loser.reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
          expect((loser.reason as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
          await graphHoleStore.persistGraphHole({ caseId, qualification: loser.snapshot });
        }

        const assessments = await prisma.graphHoleAssessment.findMany({
          where: { graphHoleId: holeId },
          orderBy: { sequence: 'asc' },
        });
        expect(assessments.map((a) => a.sequence)).toEqual([1, 2, 3]);
        expect(assessments.map((a) => a.assessmentType)).toEqual([
          'QUALIFICATION',
          'REASSESSMENT',
          'REASSESSMENT',
        ]);
        const keys = assessments.map((a) => a.logicalKey);
        expect(new Set(keys).size).toBe(3);
      });

      it('first-detector provenance is preserved on re-persist (contribution identityKey dedup)', async () => {
        const raw = rawFor('ISOLATED_NODE');
        const first = buildQualifiedCandidate(raw);
        await graphHoleStore.persistGraphHole({ caseId, qualification: first });

        // Same detector + policy but a differently-serialized provenance: the
        // contribution identityKey must dedup and PRESERVE the first write.
        const reserialized = buildQualifiedCandidate(
          buildRawCandidate({
            caseId,
            graphVersionId,
            regionId: region.regionId,
            detectorType: 'ISOLATED_NODE',
            nodeIds: [...nodeIds.slice(0, 2)].reverse(),
          }),
        );
        const rerun = await graphHoleStore.persistGraphHole({ caseId, qualification: reserialized });
        expect(rerun.created).toBe(false);

        const rows = await prisma.graphHoleDetectorContribution.findMany({
          where: { candidateId: raw.candidateId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]!.detectorMetadata).toMatchObject({ pairEvaluations: 42 });
      });

      it('supersession: new record demotes the prior ACTIVE record once and links lineage', async () => {
        const priorRegion = buildRegionFixture({
          caseId,
          graphVersionId: randomUUID(),
          seedObservationIds,
          nodeIds,
          edgeIds,
        });
        const prior = buildQualifiedCandidate(
          buildRawCandidate({
            caseId,
            graphVersionId: priorRegion.graphVersionId,
            regionId: priorRegion.regionId,
            detectorType: 'MISSING_EDGE',
            nodeIds: nodeIds.slice(0, 2),
            expectedRelationshipType: expectedRelationType,
          }),
        );
        const priorResult = await graphHoleStore.persistGraphHole({ caseId, qualification: prior });
        expect(priorResult.record.status).toBe('ACTIVE');

        const nextRegion = buildRegionFixture({
          caseId,
          graphVersionId: randomUUID(),
          seedObservationIds,
          nodeIds,
          edgeIds,
        });
        const next = buildQualifiedCandidate(
          buildRawCandidate({
            caseId,
            graphVersionId: nextRegion.graphVersionId,
            regionId: nextRegion.regionId,
            detectorType: 'MISSING_EDGE',
            nodeIds: nodeIds.slice(0, 2),
            expectedRelationshipType: expectedRelationType,
          }),
        );
        const nextResult = await graphHoleStore.persistGraphHole({
          caseId,
          qualification: next,
          supersedesGraphHoleId: priorResult.record.id,
        });
        expect(nextResult.created).toBe(true);
        expect(nextResult.record.supersedesGraphHoleId).toBe(priorResult.record.id);
        expect(nextResult.record.status).toBe('ACTIVE');

        const priorRow = await prisma.graphHole.findFirst({ where: { id: priorResult.record.id } });
        expect(priorRow!.status).toBe('SUPERSEDED');
        expect(priorRow!.supersededAt).not.toBeNull();

        const priorAssessments = await prisma.graphHoleAssessment.findMany({
          where: { graphHoleId: priorResult.record.id },
          orderBy: { sequence: 'asc' },
        });
        expect(priorAssessments.map((a) => a.assessmentType)).toEqual(['QUALIFICATION', 'SUPERSESSION']);
        expect(priorAssessments[1]!.snapshot).toMatchObject({ status: 'SUPERSEDED' });

        // Single-demotion invariant: re-running `next` never demotes again.
        const rerun = await graphHoleStore.persistGraphHole({
          caseId,
          qualification: next,
          supersedesGraphHoleId: priorResult.record.id,
        });
        expect(rerun.created).toBe(false);
        const priorAssessmentsAfter = await prisma.graphHoleAssessment.count({
          where: { graphHoleId: priorResult.record.id, assessmentType: 'SUPERSESSION' },
        });
        expect(priorAssessmentsAfter).toBe(1);
      });

      it('rejects INVALID_SUPERSESSION when the target is not ACTIVE', async () => {
        const target = buildQualifiedCandidate(
          buildRawCandidate({
            caseId,
            graphVersionId,
            regionId: region.regionId,
            detectorType: 'BROKEN_CHAIN',
            nodeIds: nodeIds.slice(0, 1),
          }),
        );
        const created = await graphHoleStore.persistGraphHole({ caseId, qualification: target });
        // Take the target OUT of ACTIVE, then attempt a supersede against it.
        await graphHoleStore.transitionStatus({
          caseId,
          candidateId: created.record.candidateId,
          to: 'RESOLVED',
        });

        const other = buildQualifiedCandidate(
          buildRawCandidate({
            caseId,
            graphVersionId,
            regionId: region.regionId,
            detectorType: 'ISOLATED_NODE',
            nodeIds: nodeIds.slice(0, 1),
          }),
        );
        let error: GraphHoleStoreError | null = null;
        try {
          await graphHoleStore.persistGraphHole({
            caseId,
            qualification: other,
            supersedesGraphHoleId: created.record.id,
          });
        } catch (e) {
          error = e as GraphHoleStoreError;
        }
        expect(error).toBeInstanceOf(GraphHoleStoreError);
        expect(error!.code).toBe('INVALID_SUPERSESSION');
      });

      it('transition machine: ACTIVE->REJECTED->ACTIVE->RESOLVED with append-only history; RESOLVED is terminal', async () => {
        const raw = buildRawCandidate({
          caseId,
          graphVersionId,
          regionId: region.regionId,
          detectorType: 'MISSING_EDGE',
          nodeIds: nodeIds.slice(0, 1),
          expectedRelationshipType: expectedRelationType,
        });
        const created = await graphHoleStore.persistGraphHole({
          caseId,
          qualification: buildQualifiedCandidate(raw),
        });
        const candidateId = created.record.candidateId;

        const rejected = await graphHoleStore.transitionStatus({
          caseId,
          candidateId,
          to: 'REJECTED',
          reason: 'insufficient support after review',
        });
        expect(rejected.status).toBe('REJECTED');

        const revived = await graphHoleStore.transitionStatus({ caseId, candidateId, to: 'ACTIVE' });
        expect(revived.status).toBe('ACTIVE');

        const resolved = await graphHoleStore.transitionStatus({ caseId, candidateId, to: 'RESOLVED' });
        expect(resolved.status).toBe('RESOLVED');

        let error: GraphHoleStoreError | null = null;
        try {
          await graphHoleStore.transitionStatus({ caseId, candidateId, to: 'REJECTED' });
        } catch (e) {
          error = e as GraphHoleStoreError;
        }
        expect(error).toBeInstanceOf(GraphHoleStoreError);
        expect(error!.code).toBe('INVALID_TRANSITION');

        const history = await graphHoleStore.listAssessments({
          caseId,
          identityKey: created.record.identityKey,
        });
        expect(history.map((a) => a.assessmentType)).toEqual([
          'QUALIFICATION',
          'REJECTION',
          'REVIVAL',
          'RESOLUTION',
        ]);
        expect(history.map((a) => a.status)).toEqual(['ACTIVE', 'REJECTED', 'ACTIVE', 'RESOLVED']);
        expect(history.map((a) => a.sequence)).toEqual([1, 2, 3, 4]);
        expect(history.every((a) => a.caseId === caseId)).toBe(true);
      });
    });

    void tableCounts;
  },
);