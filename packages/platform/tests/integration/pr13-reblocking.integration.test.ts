// ============================================================================
// PR13 lifecycle-transitions certification (real Postgres)
//
// Certifies the frozen PR6 GraphHole persistence lifecycle via the production
// transitionStatus seam against the real ConcreteLifecycleStatusModel:
//   ACTIVE  → REJECTED (REJECTION assessment) → ACTIVE (REVIVAL assessment)
//   ACTIVE  → RESOLVED (RESOLUTION assessment, terminal)
//   and REFUSAL of every illegal transition (ACTIVE→ACTIVE,
//   REJECTED→SUPERSEDED/RESOLVED, terminal→anything).
//
// Skipped when TEST_DATABASE_URL is not configured.
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

describe.skipIf(!TEST_DATABASE_URL)(
  'PR13 lifecycle transitions (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let stores: Phase5AStores;
    let runner: ReassessmentRunner;
    let caseId: string;
    let investigationId: string;
    let ids: Phase5AIdSet;

    let v2CandidateId: string;
    let v2HoleId: string;
    let successorCandidateId: string;
    let successorHoleId: string;

    async function establishV2Hole(): Promise<void> {
      const region = await buildProductionRegion({
        graphProjectionService: makeProjectionService(stores),
        observations: stores.observations,
        caseId,
        investigationId,
        graphVersionId: ids.v2Id,
        seedObservationIds: [ids.obsA1, ids.obsB1],
      });
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
      v2CandidateId = persisted.record.candidateId;
      v2HoleId = persisted.record.id;
    }

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL } },
      });
      stores = makePhase5AStores(prisma);
      runner = new ReassessmentRunner(
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

      caseId = randomUUID();
      investigationId = randomUUID();
      await cleanup(prisma, caseId);
      ids = await seedPhase5ACase(stores, { caseId, investigationId });
    }, 120_000);

    afterAll(async () => {
      await cleanup(prisma, caseId);
      await prisma.$disconnect();
    });

    it('T1: ACTIVE → REJECTED (REJECTION) → ACTIVE (REVIVAL) round-trip', async () => {
      await establishV2Hole();

      const rejected = await stores.holes.transitionStatus({
        caseId,
        candidateId: v2CandidateId,
        to: 'REJECTED',
        reason: 'pr13-adversarial-rejection',
      });
      expect(rejected.status).toBe('REJECTED');

      const revived = await stores.holes.transitionStatus({
        caseId,
        candidateId: v2CandidateId,
        to: 'ACTIVE',
        reason: 'pr13-adversarial-revival',
      });
      expect(revived.status).toBe('ACTIVE');

      // One REJECTION + one REVIVAL assessment appended after QUALIFICATION.
      const assessments = await prisma.graphHoleAssessment.findMany({
        where: { graphHoleId: v2HoleId },
        orderBy: { sequence: 'asc' },
      });
      expect(assessments.map((a) => a.assessmentType)).toEqual([
        'QUALIFICATION',
        'REJECTION',
        'REVIVAL',
      ]);
      expect(assessments[1]!.status).toBe('REJECTED');
      expect(assessments[1]!.reason).toBe('pr13-adversarial-rejection');
      expect(assessments[2]!.status).toBe('ACTIVE');
      expect(assessments[2]!.reason).toBe('pr13-adversarial-revival');

      // Transitioned in place — same physical hole row, no replacement.
      const hole = await prisma.graphHole.findFirstOrThrow({
        where: { id: v2HoleId, caseId },
      });
      expect(hole.status).toBe('ACTIVE');
    }, 60_000);

    it('T2: ACTIVE → ACTIVE self-transition is refused (INVALID_TRANSITION)', async () => {
      await expect(
        stores.holes.transitionStatus({ caseId, candidateId: v2CandidateId, to: 'ACTIVE' }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    }, 30_000);

    it('T3: supersession → REJECTED successor; REJECTED refuses SUPERSEDED/RESOLVED; RESOLVED legal+terminal', async () => {
      // Grow the case to V3 (entity D + ACCEPTED rAD) and let the production
      // runner supersede the V2 hole — the successor is a fresh ACTIVE v3 hole.
      const v3: Phase5ADV3Ids = await seedPhase5ADV3(stores, {
        caseId,
        investigationId,
        ids,
      });
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
      const run = await runner.runBatch(caseId, investigationId);
      expect(run.regionResults).toHaveLength(1);
      expect(run.regionResults[0]!.outcome).toBe('SUPERSEDED');
      expect(run.regionResults[0]!.holesSuperseded).toBe(1);

      const successor = await prisma.graphHole.findFirstOrThrow({
        where: { caseId, status: 'ACTIVE' },
      });
      expect(successor.graphVersionId).toBe(v3.v3Id);
      successorCandidateId = successor.candidateId;
      successorHoleId = successor.id;

      // REJECTED successor cannot supersede or resolve — only ACTIVE can move.
      await stores.holes.transitionStatus({
        caseId,
        candidateId: successorCandidateId,
        to: 'REJECTED',
        reason: 'lead-consequential-rejection',
      });
      for (const to of ['SUPERSEDED', 'RESOLVED'] as const) {
        await expect(
          stores.holes.transitionStatus({
            caseId,
            candidateId: successorCandidateId,
            to,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      }

      // REJECTED → ACTIVE (REVIVAL) is the only way out of REJECTED.
      await stores.holes.transitionStatus({
        caseId,
        candidateId: successorCandidateId,
        to: 'ACTIVE',
        reason: 'lead-approval-revival',
      });

      // ACTIVE → RESOLVED: legal, terminal mirror of a Lead consequence.
      const resolved = await stores.holes.transitionStatus({
        caseId,
        candidateId: successorCandidateId,
        to: 'RESOLVED',
        reason: 'lead-consequential-resolution',
      });
      expect(resolved.status).toBe('RESOLVED');
      const resolutionAssessment =
        await prisma.graphHoleAssessment.findFirstOrThrow({
          where: { graphHoleId: successorHoleId, assessmentType: 'RESOLUTION' },
        });
      expect(resolutionAssessment.status).toBe('RESOLVED');

      // RESOLVED (terminal) → nothing.
      await expect(
        stores.holes.transitionStatus({
          caseId,
          candidateId: successorCandidateId,
          to: 'ACTIVE',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    }, 60_000);

    it('T4: transitionStatus NOT_FOUND for unknown candidate', async () => {
      await expect(
        stores.holes.transitionStatus({
          caseId,
          candidateId: randomUUID(),
          to: 'ACTIVE',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }, 30_000);
  },
);