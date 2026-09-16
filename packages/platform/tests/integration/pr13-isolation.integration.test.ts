// ============================================================================
// PR13 isolation certification (real Postgres)
//
// Certifies the fail-closed authority boundaries of the production Phase 5A
// persistence seams: persistRegionAnalysis refuses a foreign-case region
// (AUTHORITY_MISMATCH) and a tampered regionId (INVALID_IDENTITY), and
// case-scoped reads never leak across cases — two identically-seeded cases
// yield disjoint deterministic identities and non-cross-readable records.
//
// Skipped when TEST_DATABASE_URL is not configured.
// ============================================================================

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  makePhase5AStores,
  seedPhase5ACase,
  buildProductionRegion,
  makeProjectionService,
  recomputeViaProduction,
  type Phase5AStores,
  type Phase5AIdSet,
} from './pr13-fixtures.js';
import { GraphHoleStore } from '../../src/persistence/graph-hole-store.js';
import {
  GraphHoleStoreError,
  type GraphHoleStoreErrorCode,
} from '../../src/persistence/graph-hole-errors.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

async function cleanup(prisma: PrismaClient, caseId: string): Promise<void> {
  const inCases = { caseId };
  await prisma.reassessmentRun.deleteMany({ where: inCases });
  await prisma.caseReassessmentCursor.deleteMany({ where: inCases });
  await prisma.caseReassessmentChange.deleteMany({ where: inCases });
  await prisma.graphHoleAssessment.deleteMany({ where: inCases });
  await prisma.graphHoleDetectorContribution.deleteMany({ where: inCases });
  await prisma.graphHole.deleteMany({ where: inCases });
  await prisma.graphHoleRegionAnalysis.deleteMany({ where: inCases });
}

async function rejectsWithCode(
  promise: Promise<unknown>,
  code: GraphHoleStoreErrorCode,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe.skipIf(!TEST_DATABASE_URL)(
  'PR13 isolation + authority boundaries (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let stores: Phase5AStores;

    let caseA: string;
    let investigationA: string;
    let idsA: Phase5AIdSet;
    let regionA: Awaited<ReturnType<typeof buildProductionRegion>>;

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL } },
      });
      stores = makePhase5AStores(prisma);

      caseA = randomUUID();
      investigationA = randomUUID();
      await cleanup(prisma, caseA);
      idsA = await seedPhase5ACase(stores, {
        caseId: caseA,
        investigationId: investigationA,
      });
    }, 120_000);

    afterAll(async () => {
      await cleanup(prisma, caseA);
      await prisma.$disconnect();
    });

    it('T1: persistRegionAnalysis refuses a foreign-case region (AUTHORITY_MISMATCH)', async () => {
      regionA = await buildProductionRegion({
        graphProjectionService: makeProjectionService(stores),
        observations: stores.observations,
        caseId: caseA,
        investigationId: investigationA,
        graphVersionId: idsA.v2Id,
        seedObservationIds: [idsA.obsA1, idsA.obsB1],
      });
      expect(regionA.status).toBe('SATURATED');
      expect(regionA.identity.caseId).toBe(caseA);

      const foreignCase = randomUUID();
      await rejectsWithCode(
        stores.regions.persistRegionAnalysis({
          caseId: foreignCase,
          investigationId: investigationA,
          region: regionA,
        }),
        'AUTHORITY_MISMATCH',
      );
    }, 60_000);

    it('T2: persistRegionAnalysis refuses a tampered regionId (INVALID_IDENTITY)', async () => {
      // Leave regionId as-is but recompute identity with an extra node →
      // the regionId no longer hashes from identity.
      const tampered = {
        ...regionA,
        identity: {
          ...regionA.identity,
          nodeIds: [...regionA.identity.nodeIds, randomUUID()],
        },
      };
      await rejectsWithCode(
        stores.regions.persistRegionAnalysis({
          caseId: caseA,
          investigationId: investigationA,
          region: tampered,
        }),
        'INVALID_IDENTITY',
      );
    }, 30_000);

    it('T3: two identically-seeded cases are fully disjoint', async () => {
      const caseB = randomUUID();
      const investigationB = randomUUID();
      await cleanup(prisma, caseB);
      const idsB = await seedPhase5ACase(stores, {
        caseId: caseB,
        investigationId: investigationB,
      });

      const regionB = await buildProductionRegion({
        graphProjectionService: makeProjectionService(stores),
        observations: stores.observations,
        caseId: caseB,
        investigationId: investigationB,
        graphVersionId: idsB.v2Id,
        seedObservationIds: [idsB.obsA1, idsB.obsB1],
      });
      await stores.regions.persistRegionAnalysis({
        caseId: caseB,
        investigationId: investigationB,
        region: regionB,
      });

      // Same structure, different case → different deterministic identities.
      expect(regionB.regionId).not.toBe(regionA.regionId);
      expect(regionB.identity.caseId).toBe(caseB);

      const bundleA = await recomputeViaProduction({
        graphProjectionService: makeProjectionService(stores),
        observations: stores.observations,
        entityHypotheses: stores.entityHypotheses,
        relationHypotheses: stores.relationHypotheses,
        caseId: caseA,
        investigationId: investigationA,
        graphVersionId: idsA.v2Id,
        region: regionA,
        computedAt: new Date(),
      });
      const bundleB = await recomputeViaProduction({
        graphProjectionService: makeProjectionService(stores),
        observations: stores.observations,
        entityHypotheses: stores.entityHypotheses,
        relationHypotheses: stores.relationHypotheses,
        caseId: caseB,
        investigationId: investigationB,
        graphVersionId: idsB.v2Id,
        region: regionB,
        computedAt: new Date(),
      });
      expect(bundleA.context.contextSha256).not.toBe(
        bundleB.context.contextSha256,
      );
      const candA = bundleA.output.qualification.qualifiedCandidates[0]!;
      const candB = bundleB.output.qualification.qualifiedCandidates[0]!;
      expect(candA.rawCandidate.candidateId).not.toBe(
        candB.rawCandidate.candidateId,
      );

      const persistA = await stores.holes.persistGraphHole({
        caseId: caseA,
        investigationId: investigationA,
        qualification: candA,
        assessmentType: 'QUALIFICATION',
        contextSha256: bundleA.context.contextSha256,
      });
      expect(persistA.created).toBe(true);

      const persistB = await stores.holes.persistGraphHole({
        caseId: caseB,
        investigationId: investigationB,
        qualification: candB,
        assessmentType: 'QUALIFICATION',
        contextSha256: bundleB.context.contextSha256,
      });
      expect(persistB.created).toBe(true);

      // Cross-case read isolation: A's record is not visible under B's scope.
      const holes = new GraphHoleStore(prisma);
      const keyA = persistA.record.identityKey;
      expect(
        await holes.findByIdentityKey({ caseId: caseB, identityKey: keyA }),
      ).toBeNull();

      await cleanup(prisma, caseB);
    }, 90_000);
  },
);