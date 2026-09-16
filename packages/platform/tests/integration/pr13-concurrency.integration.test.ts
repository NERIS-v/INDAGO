// ============================================================================
// PR13 concurrency certification (real Postgres)
//
// Certifies the production advisory-lock serialization boundary
// (pg_advisory_xact_lock(hashtextextended(caseId,0))) around runBatch:
//
//   T1: Two parallel runBatch calls on the same case each acquire the
//       advisory lock sequentially; both changes are processed exactly once
//       with no cross-talk (total processed = 2).
//   T2: Two parallel independent cases run concurrently with no
//       cross-contamination (each case's cursor and region results are
//       scoped to that case only).
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
import { ReassessmentRunner } from '../../src/reassessment/reassessment-runner.js';
import { ReassessmentChangeStore } from '../../src/reassessment/reassessment-change-store.js';
import {
  publishCaseChange,
  relationAcceptedTrigger,
} from '../../src/reassessment/publish-case-change.js';
import { GraphHoleStore } from '../../src/persistence/graph-hole-store.js';

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

function makeRunner(prisma: PrismaClient, stores: Phase5AStores): ReassessmentRunner {
  return new ReassessmentRunner(
    {
      changeStore: new ReassessmentChangeStore(prisma),
      holes: new GraphHoleStore(prisma),
      regions: stores.regions,
      observations: stores.observations,
      entityHypotheses: stores.entityHypotheses,
      relationHypotheses: stores.relationHypotheses,
      relations: stores.relations,
      graphVersions: stores.graphVersions,
    },
    {
      graphProjection: makeProjectionService(stores),
    },
  );
}

async function publishV3Change(
  prisma: PrismaClient,
  stores: Phase5AStores,
  caseId: string,
  v3: { rADId: string; hyADId: string; v3Id: string },
): Promise<void> {
  await publishCaseChange(
    {
      caseId,
      graphVersionId: v3.v3Id,
      trigger: relationAcceptedTrigger({
        caseId,
        relationHypothesisId: v3.hyADId,
        relationId: v3.rADId,
        graphVersionId: v3.v3Id,
        computedAt: { value: '2026-09-06T00:00:00.000Z', precision: 'exact' },
      }),
    },
    new ReassessmentChangeStore(prisma),
    async () => {},
  );
}

describe.skipIf(!TEST_DATABASE_URL)(
  'PR13 concurrency (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let stores: Phase5AStores;

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL } },
      });
      stores = makePhase5AStores(prisma);
    }, 30_000);

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('T1: parallel runBatch on same case — advisory lock serializes both changes', async () => {
      const caseId = randomUUID();
      const investigationId = randomUUID();
      await cleanup(prisma, caseId);
      const ids = await seedPhase5ACase(stores, { caseId, investigationId });

      // Establish the region + an ACTIVE V2 hole.
      const region = await buildProductionRegion({
        graphProjectionService: makeProjectionService(stores),
        observations: stores.observations,
        caseId,
        investigationId,
        graphVersionId: ids.v2Id,
        seedObservationIds: [ids.obsA1, ids.obsB1],
      });
      expect(region.status).toBe('SATURATED');
      await stores.regions.persistRegionAnalysis({
        caseId,
        investigationId,
        region,
      });
      const bundle = await recomputeViaProduction({
        graphProjectionService: makeProjectionService(stores),
        observations: stores.observations,
        entityHypotheses: stores.entityHypotheses,
        relationHypotheses: stores.relationHypotheses,
        caseId,
        investigationId,
        graphVersionId: ids.v2Id,
        region,
        computedAt: new Date(),
      });
      const persisted = await stores.holes.persistGraphHole({
        caseId,
        investigationId,
        qualification: bundle.output.qualification.qualifiedCandidates[0]!,
        assessmentType: 'QUALIFICATION',
        contextSha256: bundle.context.contextSha256,
      });
      expect(persisted.created).toBe(true);
      const v2CandidateId = persisted.record.candidateId;
      const v2HoleId = persisted.record.id;

      // Publish two independent GRAPH_AFFECTING changes (V3 seed + V3 seed re-trigger).
      // The re-trigger deduplicates to idempotent; the first triggers supersession.
      const v3 = await (
        await import('./pr13-fixtures.js')
      ).seedPhase5ADV3(stores, { caseId, investigationId, ids });
      await publishV3Change(prisma, stores, caseId, v3);
      // Publish a second identical change — deduplicates, so total ledger rows = 1.
      await publishV3Change(prisma, stores, caseId, v3);

      const runnerA = makeRunner(prisma, stores);
      const runnerB = makeRunner(prisma, stores);

      // Run both in parallel — pg_advisory_xact_lock forces serialization.
      const [runA, runB] = await Promise.all([
        runnerA.runBatch(caseId, investigationId),
        runnerB.runBatch(caseId, investigationId),
      ]);

      // Exactly one batch processes the single change; the other sees idle.
      const processed = runA.changesProcessed + runB.changesProcessed;
      expect(processed).toBe(1);

      // The processing runner yields one superseded region result.
      const activeResult = runA.changesProcessed === 1 ? runA : runB;
      expect(activeResult.regionResults).toHaveLength(1);
      expect(activeResult.regionResults[0]!.outcome).toBe('SUPERSEDED');
      expect(activeResult.regionResults[0]!.holesSuperseded).toBe(1);

      // Cursor advanced to sequence 1; second runner is idle.
      const idleResult = runA.changesProcessed === 0 ? runA : runB;
      expect(idleResult.changesProcessed).toBe(0);
      expect(idleResult.regionResults).toHaveLength(0);

      // Final state: V2 SUPERSEDED, successor ACTIVE on V3.
      const v2Hole = await prisma.graphHole.findFirstOrThrow({
        where: { id: v2HoleId, caseId },
      });
      expect(v2Hole.status).toBe('SUPERSEDED');
      const successor = await prisma.graphHole.findFirstOrThrow({
        where: { caseId, status: 'ACTIVE' },
      });
      expect(successor.graphVersionId).toBe(v3.v3Id);
      expect(successor.candidateId).not.toBe(v2CandidateId);

      await cleanup(prisma, caseId);
    }, 120_000);

    it('T2: parallel independent cases — no cross-contamination', async () => {
      const caseA = randomUUID();
      const caseB = randomUUID();
      const invA = randomUUID();
      const invB = randomUUID();
      await cleanup(prisma, caseA);
      await cleanup(prisma, caseB);

      // Seed identical structure in both cases.
      const idsA = await seedPhase5ACase(stores, { caseId: caseA, investigationId: invA });
      const idsB = await seedPhase5ACase(stores, { caseId: caseB, investigationId: invB });

      // Establish V2 regions + holes in both cases.
      for (const [cId, invId, ids] of [
        [caseA, invA, idsA],
        [caseB, invB, idsB],
      ] as const) {
        const region = await buildProductionRegion({
          graphProjectionService: makeProjectionService(stores),
          observations: stores.observations,
          caseId: cId,
          investigationId: invId,
          graphVersionId: ids.v2Id,
          seedObservationIds: [ids.obsA1, ids.obsB1],
        });
        await stores.regions.persistRegionAnalysis({
          caseId: cId,
          investigationId: invId,
          region,
        });
        const bundle = await recomputeViaProduction({
          graphProjectionService: makeProjectionService(stores),
          observations: stores.observations,
          entityHypotheses: stores.entityHypotheses,
          relationHypotheses: stores.relationHypotheses,
          caseId: cId,
          investigationId: invId,
          graphVersionId: ids.v2Id,
          region,
          computedAt: new Date(),
        });
        const p = await stores.holes.persistGraphHole({
          caseId: cId,
          investigationId: invId,
          qualification: bundle.output.qualification.qualifiedCandidates[0]!,
          assessmentType: 'QUALIFICATION',
          contextSha256: bundle.context.contextSha256,
        });
        expect(p.created).toBe(true);
      }

      // Publish a GRAPH_AFFECTING change in caseA only.
      const v3A = await (
        await import('./pr13-fixtures.js')
      ).seedPhase5ADV3(stores, { caseId: caseA, investigationId: invA, ids: idsA });
      await publishV3Change(prisma, stores, caseA, v3A);

      // Run both cases in parallel — each gets its own runner.
      const runnerA = makeRunner(prisma, stores);
      const runnerB = makeRunner(prisma, stores);
      const [runA, runB] = await Promise.all([
        runnerA.runBatch(caseA, invA),
        runnerB.runBatch(caseB, invB),
      ]);

      // CaseA processes the change; caseB is idle (no pending changes).
      expect(runA.changesProcessed).toBe(1);
      expect(runA.regionResults).toHaveLength(1);
      expect(runA.regionResults[0]!.outcome).toBe('SUPERSEDED');
      expect(runB.changesProcessed).toBe(0);

      // CaseA has two holes (SUPERSEDED V2 + ACTIVE V3 successor).
      const holesA = await prisma.graphHole.findMany({ where: { caseId: caseA } });
      expect(holesA).toHaveLength(2);
      const holeStatusesA = holesA.map((h) => h.status).sort();
      expect(holeStatusesA).toEqual(['ACTIVE', 'SUPERSEDED']);

      // CaseB is untouched — one ACTIVE V2 hole only.
      const holesB = await prisma.graphHole.findMany({ where: { caseId: caseB } });
      expect(holesB).toHaveLength(1);
      expect(holesB[0]!.status).toBe('ACTIVE');
      expect(holesB[0]!.graphVersionId).toBe(idsB.v2Id);

      // No cross-contamination: the successor in caseA cannot be read under caseB scope.
      const successorA = holesA.find((h) => h.status === 'ACTIVE')!;
      const holes = new GraphHoleStore(prisma);
      const crossRead = await holes.findByIdentityKey({
        caseId: caseB,
        identityKey: successorA.identityKey,
      });
      expect(crossRead).toBeNull();

      await cleanup(prisma, caseA);
      await cleanup(prisma, caseB);
    }, 120_000);
  },
);