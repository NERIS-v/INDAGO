// ============================================================================
// PR13-1 — Full pipeline integration (REAL Postgres)
//
// Exercises the entire production chain end-to-end on a REAL Postgres schema:
//   V1 (rAC accepted) → V2 (rBC accepted, activate)
//   → production region build on V2 (seed A, B) → SATURATED A–B–C region
//   → production recompute → exactly one MISSING_EDGE A–B candidate
//   → qualification (frozen V1.1 scores) → persist ACTIVE hole + QUALIFICATION assessment
//   → byte-identical recompute determinism
//   → runner EVIDENCE_AFFECTING context-gate: SKIPPED_CONTEXT_UNCHANGED
//   → authority boundary: tampered / cross-case persistence refusal.
//
// REQUIRES TEST_DATABASE_URL/schema; suite skips cleanly when unset.
// ============================================================================

import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  makePhase5AStores,
  seedPhase5ACase,
  buildProductionRegion,
  recomputeViaProduction,
  makeProjectionService,
  sortedUnique,
  RELATION_TYPE,
  type Phase5AStores,
  type Phase5AIdSet,
} from './pr13-fixtures.js';
import { GraphHoleStoreError } from '../../src/persistence/graph-hole-errors.js';
import { ReassessmentChangeStore } from '../../src/reassessment/reassessment-change-store.js';
import { ReassessmentRunner } from '../../src/reassessment/reassessment-runner.js';
import {
  publishCaseChange,
  newObservationTrigger,
  type PublishedCaseChange,
} from '../../src/reassessment/publish-case-change.js';
import type { ReassessmentTrigger } from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import type { QualifiedGraphHoleCandidate } from '@indago/contracts';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const HEX64 = /^[0-9a-f]{64}$/;

// ============================================================================
// Suite
// ============================================================================

describe.skipIf(!TEST_DATABASE_URL)(
  'PR13 full pipeline integration (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let stores: Phase5AStores;
    let changeStore: ReassessmentChangeStore;
    let runner: ReassessmentRunner;
    let ids: Phase5AIdSet;
    let region: GraphHoleRegion;

    const caseId = randomUUID();
    const investigationId = randomUUID();

    // Publish helper — bound to suite's change store, no-op enqueue (Redis-free)
    async function publish(input: {
      caseId: string;
      graphVersionId: string;
      trigger: ReassessmentTrigger;
    }): Promise<PublishedCaseChange> {
      return publishCaseChange(input, changeStore, async () => {});
    }

    async function cleanup(db: PrismaClient): Promise<void> {
      const where = { caseId };
      await db.reassessmentRun.deleteMany({ where });
      await db.caseReassessmentCursor.deleteMany({ where });
      await db.caseReassessmentChange.deleteMany({ where });
      await db.graphHoleAssessment.deleteMany({ where });
      await db.graphHoleDetectorContribution.deleteMany({ where });
      await db.graphHole.deleteMany({ where });
      await db.graphHoleRegionAnalysis.deleteMany({ where });
    }

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL! } },
      });
      stores = makePhase5AStores(prisma);
      changeStore = new ReassessmentChangeStore(prisma);
      runner = new ReassessmentRunner(
        {
          changeStore,
          holes: stores.holes,
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
      await cleanup(prisma);
      ids = await seedPhase5ACase(stores, { caseId, investigationId });
    }, 120_000);

    afterAll(async () => {
      await cleanup(prisma);
      await prisma.$disconnect();
    });

    // -----------------------------------------------------------------------
    // T1 — production region build on V2 yields SATURATED A–B–C region
    // -----------------------------------------------------------------------

    it('T1: production region build on V2 yields a SATURATED A-B-C region', async () => {
      const projection = makeProjectionService(stores);
      region = await buildProductionRegion({
        graphProjectionService: projection,
        observations: stores.observations,
        caseId,
        investigationId,
        graphVersionId: ids.v2Id,
        seedObservationIds: [ids.obsA1, ids.obsB1],
      });

      expect(region.status).toBe('SATURATED');
      expect(region.truncated).toBe(false);
      expect(region.limitations).toEqual([]);
      expect(region.semanticExpansion.status).toBe('DISABLED');

      // 3 rounds: round1 add C (novelty 0.333 not satisfying), round2 nothing
      // (0 → 1 satisfying), round3 nothing (→ 2 satisfying) → SATURATED.
      // NOTE: GraphHoleRegion carries roundRecords (not a `saturation` field);
      // consecutive zero-novelty rounds + status SATURATED are the assertions.
      expect(region.expansionRounds).toBe(3);
      expect(region.roundRecords).toHaveLength(3);
      expect(region.roundRecords[0]!.round).toBe(1);
      expect(sortedUnique(region.roundRecords[0]!.addedNodeIds)).toEqual([
        ids.entityCId,
      ]);
      expect(region.roundRecords[0]!.nodeNoveltyRatio).toBeCloseTo(1 / 3, 5);
      expect(region.roundRecords[1]!.addedNodeIds).toEqual([]);
      expect(region.roundRecords[1]!.nodeNoveltyRatio).toBe(0);
      expect(region.roundRecords[2]!.addedNodeIds).toEqual([]);
      expect(region.roundRecords[2]!.nodeNoveltyRatio).toBe(0);

      expect(sortedUnique(region.nodeIds)).toEqual(
        sortedUnique([ids.entityAId, ids.entityBId, ids.entityCId]),
      );
      expect(sortedUnique(region.edgeIds)).toEqual(
        sortedUnique([ids.rACId, ids.rBCId]),
      );
      expect(sortedUnique(region.seedObservationIds)).toEqual(
        sortedUnique([ids.obsA1, ids.obsB1]),
      );
      expect(sortedUnique(region.resolvedSeedNodeIds)).toEqual(
        sortedUnique([ids.entityAId, ids.entityBId]),
      );
      expect(sortedUnique(region.seedEdgeIds)).toEqual(
        sortedUnique([ids.rACId, ids.rBCId]),
      );
    }, 60_000);

    // -----------------------------------------------------------------------
    // T2 — recompute on V2 region: exactly one qualified MISSING_EDGE candidate
    // -----------------------------------------------------------------------

    let bundle: Awaited<ReturnType<typeof recomputeViaProduction>>;
    let candidate: QualifiedGraphHoleCandidate;

    it('T2: recompute emits EXACTLY ONE qualified MISSING_EDGE candidate with frozen V1.1 scores', async () => {
      const projection = makeProjectionService(stores);
      bundle = await recomputeViaProduction({
        graphProjectionService: projection,
        observations: stores.observations,
        entityHypotheses: stores.entityHypotheses,
        relationHypotheses: stores.relationHypotheses,
        caseId,
        investigationId,
        graphVersionId: ids.v2Id,
        region,
        computedAt: new Date(),
      });

      expect(bundle.context.contextSha256).toMatch(HEX64);
      expect(bundle.context.truncated).toBe(false);

      const q = bundle.output.qualification;
      expect(q.qualifiedCandidates).toHaveLength(1);
      candidate = q.qualifiedCandidates[0]!;
      expect(candidate.qualified).toBe(true);
      expect(candidate.failureReasons).toEqual([]);

      const raw = candidate.rawCandidate;
      expect(raw.detectorType).toBe('MISSING_EDGE');
      expect(raw.structuralBasis).toBe('SHARED_HYPOTHESIS_CONTEXT');
      expect(sortedUnique(raw.nodeIds)).toEqual(
        sortedUnique([ids.entityAId, ids.entityBId]),
      );
      expect(sortedUnique(raw.supportingObservationIds)).toEqual(
        sortedUnique([ids.obsA1, ids.obsB1, ids.obsC1]),
      );
      expect(
        sortedUnique(raw.supportingHypothesisIds),
      ).toEqual([`atomic:RELATION_HYPOTHESIS:${ids.hyGapId}`]);
      expect(raw.contradictingObservationIds).toEqual([]);

      // Frozen V1.1 scoring arithmetic
      expect(candidate.structuralScore).toBeCloseTo(0.782667, 4);
      expect(candidate.evidenceSupportScore).toBeCloseTo(0.866025, 4);
      expect(candidate.expectedInformationValue).toBe(0.25);
      expect(candidate.significance).toBeCloseTo(0.723606, 4);
      expect(candidate.regionStatus).toBe('SATURATED');
      expect(candidate.scoringPolicyVersion).toBeDefined();

      // Structural components
      expect(candidate.structuralComponents.patternStrength).toBeCloseTo(0.9, 4);
      expect(candidate.structuralComponents.connectivitySupport).toBeCloseTo(
        0.5,
        4,
      );

      // Support units: one per DISTINCT evidence (evA, evB, evC) → the region
      // recompute context maps each observation's sourceContextId to its
      // evidenceId, so V1 support-unit keys are `sourceContext:<evidenceId>`.
      expect(candidate.independentSupportUnitIds).toHaveLength(3);
      expect(
        sortedUnique(candidate.independentSupportUnitIds),
      ).toEqual(
        sortedUnique([
          `sourceContext:${ids.evidenceA}`,
          `sourceContext:${ids.evidenceB}`,
          `sourceContext:${ids.evidenceC}`,
        ]),
      );

      // Score components
      expect(
        candidate.scoreComponents.evidenceSupport.supportConsistency,
      ).toBe(1.0); // no contradicting
      expect(
        candidate.scoreComponents.evidenceSupport.provenanceCompleteness,
      ).toBe(1.0); // no missing
    }, 60_000);

    // -----------------------------------------------------------------------
    // T3 — persist hole + assessment; byte-identical recompute determinism
    // -----------------------------------------------------------------------

    it('T3: persist ACTIVE GraphHole + QUALIFICATION assessment; determinism replay', async () => {
      // Persist the region analysis first so runner affected-set / supersession
      // resolution (which read persisted regions) can locate it in T4.
      const regionPersist = await stores.regions.persistRegionAnalysis({
        caseId,
        investigationId,
        region,
      });
      expect(regionPersist.created).toBe(true);

      const persisted = await stores.holes.persistGraphHole({
        caseId,
        investigationId,
        qualification: candidate,
        assessmentType: 'QUALIFICATION',
        contextSha256: bundle.context.contextSha256,
      });

      expect(persisted.created).toBe(true);
      expect(persisted.record.status).toBe('ACTIVE');
      expect(persisted.record.caseId).toBe(caseId);
      expect(persisted.record.candidateId).toBe(
        candidate.rawCandidate.candidateId,
      );
      expect(persisted.record.graphVersionId).toBe(ids.v2Id);
      expect(persisted.record.regionId).toBe(region.regionId);
      expect(sortedUnique(persisted.record.canonicalNodeIds)).toEqual(
        sortedUnique([ids.entityAId, ids.entityBId]),
      );
      expect(persisted.record.structuralScore).toBeCloseTo(
        candidate.structuralScore,
        4,
      );

      expect(persisted.assessment.assessmentType).toBe('QUALIFICATION');
      expect(persisted.assessment.contextSha256).toBe(
        bundle.context.contextSha256,
      );
      expect(persisted.assessment.graphVersionId).toBe(ids.v2Id);

      // Exactly 1 ACTIVE hole, 1 assessment row
      expect(
        await prisma.graphHole.count({
          where: { caseId, status: 'ACTIVE' },
        }),
      ).toBe(1);
      expect(
        await prisma.graphHoleAssessment.count({ where: { caseId } }),
      ).toBe(1);

      // Determinism replay: second recompute with identical inputs → byte-identical
      const projection = makeProjectionService(stores);
      const bundle2 = await recomputeViaProduction({
        graphProjectionService: projection,
        observations: stores.observations,
        entityHypotheses: stores.entityHypotheses,
        relationHypotheses: stores.relationHypotheses,
        caseId,
        investigationId,
        graphVersionId: ids.v2Id,
        region,
        computedAt: new Date(),
      });

      expect(bundle2.context.contextSha256).toBe(
        bundle.context.contextSha256,
      );
      expect(bundle2.output.qualification.qualifiedCandidates).toHaveLength(1);
      expect(
        bundle2.output.qualification.qualifiedCandidates[0]!.rawCandidate
          .candidateId,
      ).toBe(candidate.rawCandidate.candidateId);
      expect(
        bundle2.output.qualification.qualifiedCandidates[0]!.structuralScore,
      ).toBe(candidate.structuralScore);
      expect(
        bundle2.output.qualification.qualifiedCandidates[0]!.significance,
      ).toBe(candidate.significance);
    }, 60_000);

    // -----------------------------------------------------------------------
    // T4 — runner EVIDENCE_AFFECTING: SKIPPED_CONTEXT_UNCHANGED
    // -----------------------------------------------------------------------

    it('T4: runner EVIDENCE_AFFECTING re-check over same region ⇒ SKIPPED_CONTEXT_UNCHANGED', async () => {
      // Publish a NEW_OBSERVATION for an already-seeded observation (obsC1 touches
      // entityC, which is in the region). The bounded context is identical.
      const pub = await publish({
        caseId,
        graphVersionId: ids.v2Id,
        trigger: newObservationTrigger({
          caseId,
          observationId: ids.obsC1,
          observedAt: {
            value: '2026-09-02T00:00:00.000Z',
            precision: 'exact',
          },
        }),
      });
      expect(pub.effectClass).toBe('EVIDENCE_AFFECTING');

      const run = await runner.runBatch(caseId, investigationId);
      expect(run.changesProcessed).toBe(1);
      expect(run.cursorAdvancedTo).toBe(1);
      expect(run.regionResults).toHaveLength(1);

      const regionResult = run.regionResults[0]!;
      expect(regionResult.status).toBe('SKIPPED_CONTEXT_UNCHANGED');
      expect(regionResult.assessmentsAppended).toBe(0);
      expect(regionResult.regionId).toBe(region.regionId);
      expect(regionResult.contextSha256).toMatch(HEX64);
      expect(regionResult.contextSha256).toBe(bundle.context.contextSha256);

      // Hole count unchanged
      expect(
        await prisma.graphHole.count({
          where: { caseId, status: 'ACTIVE' },
        }),
      ).toBe(1);
      expect(
        await prisma.graphHoleAssessment.count({ where: { caseId } }),
      ).toBe(1);

      // Change COMPLETED
      const change = await prisma.caseReassessmentChange.findFirst({
        where: { caseId },
      });
      expect(change?.status).toBe('COMPLETED');
      expect(change?.effectClass).toBe('EVIDENCE_AFFECTING');

      // Run envelope recorded
      expect(
        await prisma.reassessmentRun.count({ where: { caseId } }),
      ).toBe(1);

      // Idle drain
      const idle = await runner.runBatch(caseId, investigationId);
      expect(idle.changesProcessed).toBe(0);
    }, 60_000);

    // -----------------------------------------------------------------------
    // T5 — authority boundary: tampered / cross-case persistence refusal
    // -----------------------------------------------------------------------

    it('T5: persistGraphHole refuses UNQUALIFIED candidates, AUTHORITY_MISMATCH, and tampered identity', async () => {
      const qualified = { ...candidate, qualified: false };

      // 1) unqualified candidate → UNQUALIFIED_CANDIDATE
      await expect(
        stores.holes.persistGraphHole({
          caseId,
          investigationId,
          qualification: qualified,
          assessmentType: 'QUALIFICATION',
        }),
      ).rejects.toThrow(GraphHoleStoreError);

      // 2) cross-case candidate → AUTHORITY_MISMATCH
      const foreignCaseId = randomUUID();
      const crossCaseCandidate = {
        ...candidate,
        rawCandidate: { ...candidate.rawCandidate, caseId: foreignCaseId },
      };
      await expect(
        stores.holes.persistGraphHole({
          caseId,
          investigationId,
          qualification: crossCaseCandidate,
          assessmentType: 'QUALIFICATION',
        }),
      ).rejects.toThrow(GraphHoleStoreError);

      // 3) tampered nodeIds → INVALID_IDENTITY (recomputed candidateId mismatches)
      const tampered = {
        ...candidate,
        rawCandidate: {
          ...candidate.rawCandidate,
          nodeIds: sortedUnique([
            ids.entityAId,
            ids.entityCId,
          ]) as readonly string[],
        },
      };
      await expect(
        stores.holes.persistGraphHole({
          caseId,
          investigationId,
          qualification: tampered,
          assessmentType: 'QUALIFICATION',
        }),
      ).rejects.toThrow(GraphHoleStoreError);
    }, 30_000);
  },
);
