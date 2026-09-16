// ============================================================================
// PR13 incremental certification (real Postgres)
//
// Grows the A–B–C case into V3 (entity D + ACCEPTED rAD added) and certifies
// the production GRAPH_AFFECTING supersession path: rebuild prior region on the
// new version → recompute → deterministic old→new logical-gap matching → the
// successor candidate SUPERSEDES the V2 hole (old hole demoted with a
// SUPERSESSION assessment, successor ACTIVE with supersedesGraphHoleId).
// Also certifies change-ledger dedup (identical re-publication is idempotent).
//
// Everything exercises the REAL production wiring: publishCaseChange → the
// ReassessmentRunner → RegionPipeline.executeGraphAffecting → persistGraphHole.
// Tests are skipped when TEST_DATABASE_URL is not configured.
// ============================================================================

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  makePhase5AStores,
  seedPhase5ACase,
  seedPhase5ADV3,
  buildProductionRegion,
  makeProjectionService,
  recomputeViaProduction,
  type Phase5AStores,
  type Phase5AIdSet,
  type Phase5ADV3Ids,
} from './pr13-fixtures.js';
import { ReassessmentRunner } from '../../src/reassessment/reassessment-runner.js';
import {
  ReassessmentChangeStore,
} from '../../src/reassessment/reassessment-change-store.js';
import {
  publishCaseChange,
  relationAcceptedTrigger,
} from '../../src/reassessment/publish-case-change.js';
import { GraphHoleStore } from '../../src/persistence/graph-hole-store.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const HEX64 = /^[0-9a-f]{64}$/;

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

describe.skipIf(!TEST_DATABASE_URL)(
  'PR13 incremental supersession (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let stores: Phase5AStores;
    let runner: ReassessmentRunner;
    let changeStore: ReassessmentChangeStore;
    let caseId: string;
    let investigationId: string;
    let ids: Phase5AIdSet;
    let v3: Phase5ADV3Ids;

    let v2RegionId: string;
    let v2HoleId: string;
    let v2CandidateId: string;

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL } },
      });
      stores = makePhase5AStores(prisma);
      changeStore = new ReassessmentChangeStore(prisma);
      runner = new ReassessmentRunner(
        {
          changeStore,
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

      caseId = randomUUID();
      investigationId = randomUUID();
      await cleanup(prisma, caseId);
      ids = await seedPhase5ACase(stores, { caseId, investigationId });
    }, 120_000);

    afterAll(async () => {
      await cleanup(prisma, caseId);
      await prisma.$disconnect();
    });

    async function publish(input: {
      caseId: string;
      graphVersionId: string;
      trigger: Parameters<typeof publishCaseChange>[0]['trigger'];
    }): ReturnType<typeof publishCaseChange> {
      return publishCaseChange(input, changeStore, async () => {});
    }

    it('T1: baseline — V2 build + QUALIFICATION hole (ACTIVE, v2)', async () => {
      const region = await buildProductionRegion({
        graphProjectionService: makeProjectionService(stores),
        observations: stores.observations,
        caseId,
        investigationId,
        graphVersionId: ids.v2Id,
        seedObservationIds: [ids.obsA1, ids.obsB1],
      });
      expect(region.status).toBe('SATURATED');
      v2RegionId = region.regionId;

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
      expect(bundle.output.qualification.qualifiedCandidates).toHaveLength(1);
      const candidate = bundle.output.qualification.qualifiedCandidates[0]!;

      const persisted = await stores.holes.persistGraphHole({
        caseId,
        investigationId,
        qualification: candidate,
        assessmentType: 'QUALIFICATION',
        contextSha256: bundle.context.contextSha256,
      });
      expect(persisted.created).toBe(true);
      expect(persisted.record.status).toBe('ACTIVE');
      expect(persisted.record.graphVersionId).toBe(ids.v2Id);

      v2HoleId = persisted.record.id;
      v2CandidateId = persisted.record.candidateId;
    }, 60_000);

    it('T2: V3 GRAPH_AFFECTING ⇒ REGION_CHANGED recompute + SUPERSEDED hole', async () => {
      // Grow the graph: entity D, ACCEPTED rAD (A→D), graph version V3.
      v3 = await seedPhase5ADV3(stores, { caseId, investigationId, ids });
      expect(v3.rADId).toBeDefined();

      const pub = await publish({
        caseId,
        graphVersionId: v3.v3Id,
        trigger: relationAcceptedTrigger({
          caseId,
          relationHypothesisId: v3.hyADId,
          relationId: v3.rADId,
          graphVersionId: v3.v3Id,
          computedAt: { value: '2026-09-06T00:00:00.000Z', precision: 'exact' },
        }),
      });
      expect(pub.effectClass).toBe('GRAPH_AFFECTING');
      expect(pub.deduplicated).toBe(false);

      const run = await runner.runBatch(caseId, investigationId);
      expect(run.changesProcessed).toBe(1);
      expect(run.cursorAdvancedTo).toBe(1);
      expect(run.regionResults).toHaveLength(1);
      expect(run.regionResults[0]!.status).toBe('RECOMPUTED');
      expect(run.regionResults[0]!.outcome).toBe('SUPERSEDED');
      expect(run.regionResults[0]!.recomputeIdentity).toBe(true);
      expect(run.regionResults[0]!.assessmentsAppended).toBe(1);
      expect(run.regionResults[0]!.holesSuperseded).toBe(1);
      expect(run.regionResults[0]!.contextSha256).toMatch(HEX64);

      // --- Old hole demoted to SUPERSEDED with a SUPERSESSION assessment ---
      const oldHole = await prisma.graphHole.findFirstOrThrow({
        where: { id: v2HoleId, caseId },
      });
      expect(oldHole.status).toBe('SUPERSEDED');

      // --- Successor hole ACTIVE on v3, linked via supersedesGraphHoleId ---
      const successor = await prisma.graphHole.findFirstOrThrow({
        where: { caseId, status: 'ACTIVE' },
      });
      expect(successor.graphVersionId).toBe(v3.v3Id);
      expect(successor.supersedesGraphHoleId).toBe(v2HoleId);
      expect(successor.candidateId).not.toBe(v2CandidateId);
      expect(successor.regionId).toBe(run.regionResults[0]!.regionId);
      expect(successor.regionId).not.toBe(v2RegionId);

      // --- Assessment ledger ---
      const oldAssessments = await prisma.graphHoleAssessment.findMany({
        where: { graphHoleId: v2HoleId },
        orderBy: { sequence: 'asc' },
      });
      expect(oldAssessments.map((a) => a.assessmentType)).toEqual([
        'QUALIFICATION',
        'SUPERSESSION',
      ]);
      expect(oldAssessments[1]!.status).toBe('SUPERSEDED');
      expect(oldAssessments[1]!.graphVersionId).toBe(ids.v2Id);
      expect(oldAssessments[1]!.reason).toContain(successor.candidateId);

      const successorAssessments = await prisma.graphHoleAssessment.findMany({
        where: { graphHoleId: successor.id },
      });
      expect(successorAssessments).toHaveLength(1);
      expect(successorAssessments[0]!.assessmentType).toBe('QUALIFICATION');
      expect(successorAssessments[0]!.graphVersionId).toBe(v3.v3Id);
      expect(successorAssessments[0]!.contextSha256).toBe(
        run.regionResults[0]!.contextSha256,
      );
      expect(successorAssessments[0]!.reason).toContain(v2CandidateId);

      // --- Change COMPLETED, one ledger row ---
      const change = await prisma.caseReassessmentChange.findFirstOrThrow({
        where: { caseId },
      });
      expect(change.status).toBe('COMPLETED');
      expect(change.effectClass).toBe('GRAPH_AFFECTING');

      // Idle drain
      const idle = await runner.runBatch(caseId, investigationId);
      expect(idle.changesProcessed).toBe(0);
    }, 60_000);

    it('T3: duplicate re-publication is deduplicated + runner stays idle', async () => {
      // Re-publish the identical RELATION_ACCEPTED trigger → same changeId →
      // ledger dedup: NOT re-enqueued, and runBatch does no further work.
      const dup = await publish({
        caseId,
        graphVersionId: v3.v3Id,
        trigger: relationAcceptedTrigger({
          caseId,
          relationHypothesisId: v3.hyADId,
          relationId: v3.rADId,
          graphVersionId: v3.v3Id,
          computedAt: { value: '2026-09-06T00:00:00.000Z', precision: 'exact' },
        }),
      });
      expect(dup.deduplicated).toBe(true);

      const changeCount = await prisma.caseReassessmentChange.count({
        where: { caseId },
      });
      expect(changeCount).toBe(1);

      const run = await runner.runBatch(caseId, investigationId);
      expect(run.changesProcessed).toBe(0);
      expect(run.regionResults).toHaveLength(0);

      // Ledger state unchanged: 1 ACTIVE successor + 1 SUPERSEDED predecessor.
      expect(
        await prisma.graphHole.count({ where: { caseId, status: 'ACTIVE' } }),
      ).toBe(1);
      expect(
        await prisma.graphHole.count({
          where: { caseId, status: 'SUPERSEDED' },
        }),
      ).toBe(1);
    }, 30_000);
  },
);