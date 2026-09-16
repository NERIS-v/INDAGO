// ============================================================================
// PR14-5 — Gap classification integration (REAL Postgres)
//
// Classifies, through the EXACT production chain, WHY a qualified A–B graph
// hole exists on the V2 SATURATED A–B–C region:
//   seed A–B–C → production region build on V2 → production recompute →
//   recompute bundle (nodes / edges / observations / HypothesisContext /
//   region) + PR5 QualifiedGraphHoleCandidate → GapClassificationInput assembled
//   EXCLUSIVELY from that production bundle → classifyGap.
//
// Frozen V1 expectations for this fixture: MISSING_INVESTIGATION —
// the supporting A–B observations exist AND the accepted A–C / B–C atomics
// already provide a comparison baseline, so the gap is an investigation not
// yet concluded, never data missing by the classifier. HIGH priority from the
// frozen PR5 significance (0.723606); impact/expectedInformationValue are
// copied verbatim; every returned reference id resolves inside the bounded
// input (closed world); the classification is byte-identical under an
// identical recompute bundle.
//
// Boundary coverage over production shapes: CONTEXT_MISMATCH on a cross-case
// candidate, UNSUPPORTED_POLICY, INVALID_INPUT, and the P2 emission path when
// the supplied region carries a truncating limitation flag.
//
// REQUIRES TEST_DATABASE_URL/schema; suite skips cleanly when unset.
// ============================================================================

import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { ObservedTime } from '@indago/contracts';
import { GapClassificationResultSchema } from '@indago/contracts';
import type { QualifiedGraphHoleCandidate } from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import {
  classifyGap,
  GapClassificationError,
  GapClassificationErrorCodes,
  CONSUMED_GAP_CLASSIFICATION_POLICY_VERSION,
  type GapClassificationInput,
} from '@indago/gap-classification';
import {
  makePhase5AStores,
  seedPhase5ACase,
  buildProductionRegion,
  recomputeViaProduction,
  makeProjectionService,
  sortedUnique,
  type Phase5AStores,
  type Phase5AIdSet,
  type RegionRecomputeBundle,
} from './pr13-fixtures.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const HEX64 = /^[0-9a-f]{64}$/;

// ============================================================================
// Suite
// ============================================================================

describe.skipIf(!TEST_DATABASE_URL)(
  'PR14 gap classification integration (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let stores: Phase5AStores;
    let ids: Phase5AIdSet;
    let region: GraphHoleRegion;

    const caseId = randomUUID();
    const investigationId = randomUUID();
    const computedAt: ObservedTime = {
      value: '2026-09-17T00:00:00.000Z',
      precision: 'exact',
    };

    async function cleanup(db: PrismaClient): Promise<void> {
      const where = { caseId };
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
      await cleanup(prisma);
      ids = await seedPhase5ACase(stores, { caseId, investigationId });
    }, 120_000);

    afterAll(async () => {
      await cleanup(prisma);
      await prisma.$disconnect();
    });

    // -----------------------------------------------------------------------
    // T1 — production region + recompute: ONE qualified MISSING_EDGE candidate
    // -----------------------------------------------------------------------

    let bundle: RegionRecomputeBundle;
    let candidate: QualifiedGraphHoleCandidate;

    it('T1: production recompute yields one qualified MISSING_EDGE candidate (the classification input)', async () => {
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
      expect(sortedUnique(region.nodeIds)).toEqual(
        sortedUnique([ids.entityAId, ids.entityBId, ids.entityCId]),
      );

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

      const q = bundle.output.qualification;
      expect(q.qualifiedCandidates).toHaveLength(1);
      candidate = q.qualifiedCandidates[0]!;
      expect(candidate.qualified).toBe(true);
      expect(candidate.rawCandidate.detectorType).toBe('MISSING_EDGE');
      expect(candidate.rawCandidate.expectedRelationshipType).toBe('association');
      expect(sortedUnique(candidate.rawCandidate.nodeIds)).toEqual(
        sortedUnique([ids.entityAId, ids.entityBId]),
      );
      expect(sortedUnique(candidate.rawCandidate.supportingObservationIds)).toEqual(
        sortedUnique([ids.obsA1, ids.obsB1, ids.obsC1]),
      );
      expect(candidate.rawCandidate.contradictingObservationIds).toEqual([]);
      expect(candidate.rawCandidate.supportingHypothesisIds).toEqual([
        `atomic:RELATION_HYPOTHESIS:${ids.hyGapId}`,
      ]);
      expect(candidate.significance).toBeCloseTo(0.723606, 4);
      expect(candidate.structuralScore).toBeCloseTo(0.782667, 4);
      expect(candidate.expectedInformationValue).toBe(0.25);
      expect(candidate.regionStatus).toBe('SATURATED');
    }, 60_000);

    // -----------------------------------------------------------------------
    // T2 — closed-world classification over the production bundle
    // -----------------------------------------------------------------------

    function buildClassificationInput(
      qc: QualifiedGraphHoleCandidate,
      ctx: RegionRecomputeBundle['context'],
    ): GapClassificationInput {
      return {
        caseId: ctx.scope.caseId,
        graphVersionId: ctx.scope.graphVersionId,
        qualifiedCandidate: qc,
        region: ctx.region,
        nodes: [...ctx.nodes],
        edges: [...ctx.edges],
        observations: [...ctx.observations],
        hypothesisContext: ctx.hypothesisContext,
        classificationPolicyVersion: CONSUMED_GAP_CLASSIFICATION_POLICY_VERSION,
        computedAt,
      };
    }

    it('T2: classifyGap over the production bundle ⇒ MISSING_INVESTIGATION (comparison baseline present, question identified)', () => {
      const ctx = bundle.context;
      const input = buildClassificationInput(candidate, ctx);

      // Closed-world axioms the authority boundary needs — every candidate
      // reference must resolve inside the supplied bounded context.
      const contextObservationIds = new Set(ctx.observations.map((o) => o.id));
      for (const id of [
        ...candidate.rawCandidate.supportingObservationIds,
        ...candidate.rawCandidate.contradictingObservationIds,
      ]) {
        expect(contextObservationIds.has(id)).toBe(true);
      }
      const contextNodeIds = new Set(ctx.nodes.map((n) => n.id));
      for (const id of candidate.rawCandidate.nodeIds) {
        expect(contextNodeIds.has(id)).toBe(true);
      }
      const atomics = ctx.hypothesisContext.atomic;
      const atomicDerivedIds = new Set(atomics.map((a) => a.derivedId));
      for (const id of candidate.rawCandidate.supportingHypothesisIds) {
        expect(atomicDerivedIds.has(id)).toBe(true);
      }
      // The accepted A–C / B–C atomics must be present as the comparison baseline.
      expect(atomicDerivedIds.has(`atomic:RELATION_HYPOTHESIS:${ids.hyACId}`)).toBe(true);
      expect(atomicDerivedIds.has(`atomic:RELATION_HYPOTHESIS:${ids.hyBCId}`)).toBe(true);

      const result = classifyGap(input);

      // Frozen V1 semantics.
      expect(result.graphHoleId).toBe(candidate.rawCandidate.candidateId);
      expect(result.type).toBe('MISSING_INVESTIGATION');
      expect(result.status).toBe('CONFIDENT');
      expect(result.reasonCodes).toEqual([
        'QUESTION_IDENTIFIED',
        'INVESTIGATION_NOT_CONCLUDED',
      ]);
      expect(result.classificationPolicyVersion).toBe('v1');
      expect(result.priority).toBe('HIGH');
      expect(result.impact).toBeCloseTo(0.723606, 4);
      expect(result.expectedInformationValue).toBe(0.25);
      expect(result.contextSha256).toMatch(HEX64);
      expect(result.computedAt).toEqual(computedAt);

      // The result binds to the frozen contract.
      expect(GapClassificationResultSchema.safeParse(result).success).toBe(true);

      // Provenance: every returned reference resolves inside the bounded input.
      for (const id of result.supportingReferences.supportingObservationIds) {
        expect(contextObservationIds.has(id)).toBe(true);
      }
      for (const id of result.supportingReferences.supportingHypothesisIds) {
        expect(atomicDerivedIds.has(id)).toBe(true);
      }
      for (const id of result.supportingReferences.structuralSignalIds) {
        expect(contextNodeIds.has(id)).toBe(true);
      }
      expect(result.supportingReferences.supportingHypothesisIds).toEqual([
        `atomic:RELATION_HYPOTHESIS:${ids.hyGapId}`,
      ]);
      expect(result.supportingReferences.structuralSignalIds).toEqual(
        sortedUnique([ids.entityAId, ids.entityBId]),
      );
    }, 30_000);

    // -----------------------------------------------------------------------
    // T3 — deterministic under an identical recompute bundle
    // -----------------------------------------------------------------------

    it('T3: identical recompute bundle ⇒ byte-identical result + same context digest', () => {
      const input = buildClassificationInput(candidate, bundle.context);
      const a = classifyGap(input);
      const b = classifyGap(input);
      expect(b).toEqual(a);
      expect(b.contextSha256).toBe(a.contextSha256);
      expect(b.type).toBe('MISSING_INVESTIGATION');
    });

    // -----------------------------------------------------------------------
    // T4 — the four typed boundary failures over production shapes
    // -----------------------------------------------------------------------

    it('T4: typed boundary failures (CONTEXT_MISMATCH / UNSUPPORTED_POLICY / INVALID_INPUT)', () => {
      const input = buildClassificationInput(candidate, bundle.context);
      const foreignCaseId = randomUUID();

      const captureCode = (fn: () => unknown): string | undefined => {
        try {
          classifyGap(fn() as GapClassificationInput);
        } catch (err) {
          if (err instanceof GapClassificationError) return err.code;
        }
        return undefined;
      };

      // Cross-case SCOPE on the classification input.
      expect(
        captureCode(() => ({ ...input, caseId: foreignCaseId })),
      ).toBe(GapClassificationErrorCodes.CONTEXT_MISMATCH);

      // Cross-case CANDIDATE (rawCandidate carries a foreign caseId).
      const foreignCandidate = {
        ...candidate,
        rawCandidate: { ...candidate.rawCandidate, caseId: foreignCaseId },
      };
      expect(
        captureCode(() => buildClassificationInput(foreignCandidate, bundle.context)),
      ).toBe(GapClassificationErrorCodes.CONTEXT_MISMATCH);

      expect(
        captureCode(() => ({ ...input, classificationPolicyVersion: 'v2' })),
      ).toBe(GapClassificationErrorCodes.UNSUPPORTED_POLICY);

      expect(captureCode(() => null)).toBe(GapClassificationErrorCodes.INVALID_INPUT);
    });

    // -----------------------------------------------------------------------
    // T5 — classification reacts to the SUPPLIED region flags (P2 path)
    // -----------------------------------------------------------------------

    it('T5: a truncating limitation on the supplied region emits INFRASTRUCTURE_GAP (REGION_REPRESENTATION_LIMITED)', () => {
      const limitedRegion: GraphHoleRegion = {
        ...bundle.context.region,
        limitations: [...bundle.context.region.limitations, 'CONTEXT_OBSERVATION_BOUND_REACHED'],
      };
      const input = {
        ...buildClassificationInput(candidate, bundle.context),
        region: limitedRegion,
      };
      const result = classifyGap(input);
      expect(result.type).toBe('INFRASTRUCTURE_GAP');
      expect(result.status).toBe('CONFIDENT');
      expect(result.reasonCodes).toEqual(['REGION_REPRESENTATION_LIMITED']);
      expect(GapClassificationResultSchema.safeParse(result).success).toBe(true);
    });
  },
);