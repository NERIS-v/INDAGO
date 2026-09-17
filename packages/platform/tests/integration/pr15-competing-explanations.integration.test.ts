// ============================================================================
// PR15-7 — Competing explanations integration (REAL Postgres)
//
// Generates, through the EXACT production chain, the bounded competing
// explanation set for the V2 SATURATED A–B–C region:
//   seed A–B–C → production region build on V2 → production recompute →
//   recompute bundle + PR5 QualifiedGraphHoleCandidate → classifyGap →
//   generateCompetingExplanations (input assembled EXCLUSIVELY from the
//   production bundle; the classification side is the REAL PR14 result).
//
// Frozen V1 expectations for this fixture: MISSING_INVESTIGATION CONFIDENT
// (supporting refs exist AND accepted A–C / B–C atomics provide the comparison
// baseline — the gap is an investigation not yet concluded). The PRIMARY
// family is MISSING_INVESTIGATION_EXPLANATION (SUPPORTED) and the
// INNOCENT_ALTERNATIVE family is grounded by the REAL competing atomics.
//
// Boundary coverage over production shapes: cross-case candidate →
// CONTEXT_MISMATCH (mapped through the PR14 authority checks),
// UNSUPPORTED_POLICY, deterministic byte-identical sets.
//
// REQUIRES TEST_DATABASE_URL/schema; suite skips cleanly when unset.
// ============================================================================

import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { ObservedTime, QualifiedGraphHoleCandidate } from '@indago/contracts';
import { CompetingExplanationSetSchema } from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import { classifyGap, type GapClassificationInput } from '@indago/gap-classification';
import {
  generateCompetingExplanations,
  CompetingExplanationError,
  CompetingExplanationErrorCodes,
  type CompetingExplanationInput,
} from '@indago/competing-explanations';
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
  'PR15 competing explanations integration (real Postgres)',
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
    // T0/T1 — production region + recompute → ONE qualified MISSING_EDGE
    // -----------------------------------------------------------------------

    let bundle: RegionRecomputeBundle;
    let candidate: QualifiedGraphHoleCandidate;

    it('T0: production recompute yields one qualified MISSING_EDGE candidate', async () => {
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
      expect(candidate.rawCandidate.expectedRelationshipType).toBe('association');
      expect(sortedUnique(candidate.rawCandidate.nodeIds)).toEqual(
        sortedUnique([ids.entityAId, ids.entityBId]),
      );
    }, 60_000);

    // -----------------------------------------------------------------------
    // The PR15 input assembled EXCLUSIVELY from the production bundle
    // -----------------------------------------------------------------------

    function buildCompetingInput(
      qc: QualifiedGraphHoleCandidate,
      ctx: RegionRecomputeBundle['context'],
    ): CompetingExplanationInput {
      const gapInput: GapClassificationInput = {
        caseId: ctx.scope.caseId,
        graphVersionId: ctx.scope.graphVersionId,
        qualifiedCandidate: qc,
        region: ctx.region,
        nodes: [...ctx.nodes],
        edges: [...ctx.edges],
        observations: [...ctx.observations],
        hypothesisContext: ctx.hypothesisContext,
        classificationPolicyVersion: 'v1',
        computedAt,
      };
      const classification = classifyGap(gapInput);
      return {
        context: gapInput,
        gapClassification: classification,
        competingExplanationPolicyVersion: 'v1',
        computedAt,
      };
    }

    it('T1: classifyGap over the production bundle ⇒ MISSING_INVESTIGATION CONFIDENT', () => {
      const input = buildCompetingInput(candidate, bundle.context);
      expect(input.gapClassification.type).toBe('MISSING_INVESTIGATION');
      expect(input.gapClassification.status).toBe('CONFIDENT');
      expect(input.gapClassification.reasonCodes).toEqual([
        'QUESTION_IDENTIFIED',
        'INVESTIGATION_NOT_CONCLUDED',
      ]);
    });

    // -----------------------------------------------------------------------
    // T2 — the generated set over the production bundle
    // -----------------------------------------------------------------------

    it('T2: generateCompetingExplanations over the REAL production bundle binds and ranks grounded families', () => {
      const input = buildCompetingInput(candidate, bundle.context);
      const classification = input.gapClassification;
      const set = generateCompetingExplanations(input);

      // The set binds to the classification the context actually produces.
      expect(set.caseId).toBe(caseId);
      expect(set.graphVersionId).toBe(ids.v2Id);
      expect(set.graphHoleId).toBe(classification.graphHoleId);
      expect(set.policyVersion).toBe('v1');
      expect(set.classification.type).toBe('MISSING_INVESTIGATION');
      expect(set.classification.status).toBe('CONFIDENT');
      expect(set.classification.classificationPolicyVersion).toBe('v1');
      expect(set.classification.contextSha256).toBe(classification.contextSha256);

      // Bounded + ranked (rank 1 = smallest key).
      expect(set.explanations.length).toBeGreaterThanOrEqual(1);
      expect(set.explanations.length).toBeLessThanOrEqual(5);
      expect(set.explanationCount).toBe(set.explanations.length);
      for (let i = 1; i < set.explanations.length; i++) {
        expect(set.explanations[i - 1]!.rankingKey < set.explanations[i]!.rankingKey).toBe(true);
      }

      // PRIMARY family first, exact frozen semantics.
      const primary = set.explanations[0]!;
      expect(primary.type).toBe('MISSING_INVESTIGATION_EXPLANATION');
      expect(primary.basis).toBe('QUESTION_IDENTIFIED_NOT_EVALUATED');
      expect(primary.supportLevel).toBe('SUPPORTED');
      expect(primary.gapClassificationType).toBe('MISSING_INVESTIGATION');
      expect(primary.statement).toContain('association');
      expect(primary.explanationId).toMatch(HEX64);
      expect(sortedUnique(primary.structuralSignalIds)).toEqual(
        sortedUnique([ids.entityAId, ids.entityBId]),
      );

      // INNOCENT_ALTERNATIVE is grounded by the REAL A–C / B–C atomics.
      const innocent = set.explanations.find(
        (e) => e.type === 'INNOCENT_ALTERNATIVE_EXPLANATION',
      );
      expect(innocent).toBeDefined();
      expect(innocent!.supportLevel).toBe('PLAUSIBLE');
      expect(innocent!.supportingHypothesisIds).toContain(
        `atomic:RELATION_HYPOTHESIS:${ids.hyACId}`,
      );
      expect(innocent!.supportingHypothesisIds).toContain(
        `atomic:RELATION_HYPOTHESIS:${ids.hyBCId}`,
      );

      // Closed world: every returned reference resolves inside the bundle.
      const obsIds = new Set(bundle.context.observations.map((o) => o.id));
      const hypIds = new Set(bundle.context.hypothesisContext.atomic.map((a) => a.derivedId));
      const nodeIds = new Set(bundle.context.nodes.map((n) => n.id));
      const explanationIds = new Set<string>();
      for (const e of set.explanations) {
        expect(e.explanationId).toMatch(HEX64);
        explanationIds.add(e.explanationId);
        expect([...e.supportingObservationIds, ...e.contradictingObservationIds]
          .every((id) => obsIds.has(id))).toBe(true);
        expect([...e.supportingHypothesisIds, ...e.contradictingHypothesisIds]
          .every((id) => hypIds.has(id))).toBe(true);
        expect(e.structuralSignalIds.every((id) => nodeIds.has(id))).toBe(true);
      }
      expect(explanationIds.size).toBe(set.explanations.length);

      // The set binds to the frozen contract.
      expect(CompetingExplanationSetSchema.safeParse(set).success).toBe(true);
    });

    // -----------------------------------------------------------------------
    // T3 — deterministic byte-identical generation under the same bundle
    // -----------------------------------------------------------------------

    it('T3: identical production bundle ⇒ byte-identical explanation sets', () => {
      const a = generateCompetingExplanations(buildCompetingInput(candidate, bundle.context));
      const b = generateCompetingExplanations(buildCompetingInput(candidate, bundle.context));
      expect(b).toEqual(a);
      expect(b.explanations[0]!.explanationId).toBe(a.explanations[0]!.explanationId);
      expect(b.contextSha256).toBe(a.contextSha256);
    });

    // -----------------------------------------------------------------------
    // T4 — typed boundary failures over production shapes
    // -----------------------------------------------------------------------

    it('T4: typed boundary failures (CONTEXT_MISMATCH / UNSUPPORTED_POLICY / INVALID_INPUT)', () => {
      const input = buildCompetingInput(candidate, bundle.context);
      const foreignCaseId = randomUUID();

      const captureCode = (fn: () => CompetingExplanationInput): string | undefined => {
        try {
          generateCompetingExplanations(fn());
        } catch (err) {
          if (err instanceof CompetingExplanationError) return err.code;
        }
        return undefined;
      };

      // Cross-case CANDIDATE: hand-assembled package whose context carries a
      // foreign candidate while the supplied classification binds the original
      // hole — the generator's re-run surfaces the mismatch as CONTEXT_MISMATCH.
      const foreignCandidate = {
        ...candidate,
        rawCandidate: { ...candidate.rawCandidate, caseId: foreignCaseId },
      };
      const foreignInput: CompetingExplanationInput = {
        context: { ...input.context, qualifiedCandidate: foreignCandidate },
        gapClassification: input.gapClassification,
        competingExplanationPolicyVersion: 'v1',
        computedAt,
      };
      expect(captureCode(() => foreignInput)).toBe(
        CompetingExplanationErrorCodes.CONTEXT_MISMATCH,
      );

      // Unsupported policy version.
      expect(
        captureCode(() => ({
          ...buildCompetingInput(candidate, bundle.context),
          competingExplanationPolicyVersion: 'v2' as 'v1',
        })),
      ).toBe(CompetingExplanationErrorCodes.UNSUPPORTED_POLICY);

      expect(captureCode(() => null as unknown as CompetingExplanationInput)).toBe(
        CompetingExplanationErrorCodes.INVALID_INPUT,
      );
    });
  },
);