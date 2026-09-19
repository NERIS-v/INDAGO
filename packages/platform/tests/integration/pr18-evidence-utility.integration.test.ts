// ============================================================================
// PR18-7 — candidate evidence utility selection integration (REAL Postgres)
//
// Through the EXACT production chain over a persisted GraphHole:
//   PR13 persisted region + recompute → REAL PR14 classification → REAL PR15
//   competing explanations → REAL PR16 ER-split → REAL PR17 candidate evidence
//   requests → PR18 candidate utility selection.
//
// PR18 is PERSISTENCE-FREE (pure, no store); this suite verifies the full
// PR14→PR15→PR16→PR17→PR18 chain over production shapes, deterministic
// regeneration, and typed case-scope isolation. It does NOT write/recommend
// evidence (no lifecycle, no acquisition).
//
// REQUIRES TEST_DATABASE_URL/schema; suite skips cleanly when unset. Live
// execution DEFERRED — ENVIRONMENTAL (Neon unreachable, affects PR13–PR18
// suites identically).
// ============================================================================

import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { EntityMentionCandidate, CandidatePair, EntityHypothesis } from '@indago/contracts';
import { classifyGap, type GapClassificationInput } from '@indago/gap-classification';
import { generateCompetingExplanations, type CompetingExplanationInput } from '@indago/competing-explanations';
import {
  generateErSplitExplanations,
  type ErSplitExplanationInput,
} from '@indago/entity-split-analysis';
import { generateCandidateEvidenceRequests } from '@indago/evidence-request-generation';
import {
  selectBestEvidenceFromCandidates,
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
} from '@indago/next-best-evidence';
import {
  makePhase5AStores,
  seedPhase5ACase,
  buildProductionRegion,
  recomputeViaProduction,
  makeProjectionService,
  type Phase5AStores,
  type Phase5AIdSet,
  type RegionRecomputeBundle,
} from './pr13-fixtures.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  'PR18 candidate evidence utility selection integration (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let stores: Phase5AStores;
    let ids: Phase5AIdSet;
    let bundle: RegionRecomputeBundle;
    let candidates: EntityMentionCandidate[];
    let pair: CandidatePair;
    let hypothesis: EntityHypothesis;

    const caseId = randomUUID();
    const investigationId = randomUUID();
    const gapId = randomUUID();
    const computedAt = { value: '2026-09-18T00:00:00.000Z', precision: 'exact' } as const;

    async function cleanup(db: PrismaClient): Promise<void> {
      const where = { caseId };
      await db.entityHypothesis.deleteMany({ where });
      await db.candidatePair.deleteMany({ where });
      await db.entityMentionCandidate.deleteMany({ where });
      await db.graphHoleAssessment.deleteMany({ where });
      await db.graphHoleDetectorContribution.deleteMany({ where });
      await db.graphHole.deleteMany({ where });
      await db.graphHoleRegionAnalysis.deleteMany({ where });
    }

    beforeAll(async () => {
      if (!TEST_DATABASE_URL) return;
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
      stores = makePhase5AStores(prisma);
      await cleanup(prisma);
      ids = await seedPhase5ACase(stores, { caseId, investigationId });
    }, 120_000);

    afterAll(async () => {
      if (!TEST_DATABASE_URL || prisma === undefined) return;
      await cleanup(prisma);
      await prisma.$disconnect();
    });

    async function seedMention(observationId: string, canonicalMatchValue: string): Promise<EntityMentionCandidate> {
      const candidate: EntityMentionCandidate = {
        id: randomUUID(),
        observationId,
        text: canonicalMatchValue,
        start: 0,
        end: canonicalMatchValue.length,
        entityType: 'PERSON',
        extractionMethod: 'PATTERN_MATCH',
        canonicalMatchValue,
        provenance: {
          sourceId: ids.sourceId,
          artifactId: ids.artifactId,
          extractor: 'indago:pr18:fixture',
        },
        createdAt: computedAt,
        updatedAt: computedAt,
      };
      await stores.prisma.entityMentionCandidate.createMany({
        data: [
          {
            id: candidate.id,
            observationId: candidate.observationId,
            text: candidate.text,
            start: candidate.start,
            end: candidate.end,
            entityType: candidate.entityType,
            extractionMethod: candidate.extractionMethod,
            canonicalMatchValue: candidate.canonicalMatchValue,
            caseId,
            investigationId,
            provenance: candidate.provenance,
            createdAt: candidate.createdAt,
            updatedAt: candidate.updatedAt,
          },
        ],
        skipDuplicates: true,
      });
      return candidate;
    }

    it('T0: production recompute yields one qualified MISSING_EDGE candidate', async () => {
      const projection = makeProjectionService(stores);
      await buildProductionRegion({
        graphProjectionService: projection,
        observations: stores.observations,
        caseId,
        investigationId,
        graphVersionId: ids.v2Id,
        seedObservationIds: [ids.obsA1, ids.obsB1],
      });
      bundle = await recomputeViaProduction({
        graphProjectionService: projection,
        observations: stores.observations,
        entityHypotheses: stores.entityHypotheses,
        relationHypotheses: stores.relationHypotheses,
        caseId,
        investigationId,
        graphVersionId: ids.v2Id,
        region: await buildProductionRegion({
          graphProjectionService: projection,
          observations: stores.observations,
          caseId,
          investigationId,
          graphVersionId: ids.v2Id,
          seedObservationIds: [ids.obsA1, ids.obsB1],
        }),
        computedAt: new Date(),
      });
      expect(bundle.output.qualification.qualifiedCandidates).toHaveLength(1);
    }, 60_000);

    it('T1: REAL M-A07 mentions + M-A08 A~B pair + M-A09 RESOLVED_MATCH hypothesis', async () => {
      const left = await seedMention(ids.obsA1, 'Shared Canonical Value');
      const right = await seedMention(ids.obsB1, 'Shared Canonical Value');
      candidates = [left, right];
      const { drafts } = (await import('@indago/ingestion')).blockCandidates(
        { candidates: [left, right], caseId, investigationId },
        {},
      );
      const { finalizeCandidatePair } = await import('@indago/ingestion');
      pair = await finalizeCandidatePair({ draft: drafts[0]!, nowIso: new Date().toISOString() });
      await stores.prisma.candidatePair.createMany({
        data: [
          {
            id: pair.id,
            caseId: pair.caseId,
            leftCandidateId: pair.leftCandidateId,
            rightCandidateId: pair.rightCandidateId,
            blockingPasses: pair.blockingPasses,
            createdAt: pair.createdAt,
          },
        ],
        skipDuplicates: true,
      });
      const { deterministicEntityHypothesisId, RESOLUTION_SCORE_MODEL_VERSION } = await import('@indago/entity-resolution');
      hypothesis = {
        id: await deterministicEntityHypothesisId({
          candidatePairId: pair.id,
          scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
        }),
        caseId,
        investigationId,
        candidatePairId: pair.id,
        supportingCandidateIds: [left.id, right.id],
        comparisonStatus: 'RESOLVED_MATCH',
        score: 0.72,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
        supportingObservationIds: [ids.obsA1, ids.obsB1],
        contradictingObservationIds: [],
        status: 'PROPOSED',
        provenance: {
          sourceId: ids.sourceId,
          artifactId: ids.artifactId,
          extractor: 'indago:resolution:engine',
          extractionMethod: RESOLUTION_SCORE_MODEL_VERSION,
        },
        createdAt: computedAt,
        updatedAt: computedAt,
      };
      await stores.prisma.entityHypothesis.createMany({
        data: [
          {
            id: hypothesis.id,
            caseId: hypothesis.caseId,
            investigationId: hypothesis.investigationId,
            candidatePairId: hypothesis.candidatePairId!,
            supportingCandidateIds: hypothesis.supportingCandidateIds,
            comparisonStatus: hypothesis.comparisonStatus,
            score: hypothesis.score,
            scoreModelVersion: hypothesis.scoreModelVersion,
            supportingObservationIds: hypothesis.supportingObservationIds,
            contradictingObservationIds: hypothesis.contradictingObservationIds,
            status: hypothesis.status,
            provenance: hypothesis.provenance,
            createdAt: hypothesis.createdAt,
            updatedAt: hypothesis.updatedAt,
          },
        ],
        skipDuplicates: true,
      });
    }, 60_000);

    function buildPr18Input() {
      const regionResult = bundle.output.qualification.qualifiedCandidates[0]!;
      const gapInput: GapClassificationInput = {
        caseId: bundle.context.scope.caseId,
        graphVersionId: bundle.context.scope.graphVersionId,
        qualifiedCandidate: regionResult,
        region: bundle.context.region,
        nodes: [...bundle.context.nodes],
        edges: [...bundle.context.edges],
        observations: [...bundle.context.observations],
        hypothesisContext: bundle.context.hypothesisContext,
        classificationPolicyVersion: 'v1',
        computedAt,
      };
      const classification = classifyGap(gapInput);
      const competing = generateCompetingExplanations({
        context: gapInput,
        gapClassification: classification,
        competingExplanationPolicyVersion: 'v1',
        computedAt,
      } satisfies CompetingExplanationInput);
      const erSplitInput: ErSplitExplanationInput = {
        context: gapInput,
        gapClassification: classification,
        competingExplanationSet: competing,
        candidateUniverse: [...candidates],
        candidatePairs: [pair],
        entityHypotheses: [hypothesis],
        erSplitPolicyVersion: 'v1',
        computedAt,
      };
      const erSplit = generateErSplitExplanations(erSplitInput);

      const pr17 = generateCandidateEvidenceRequests({
        gapId,
        context: gapInput,
        gapClassification: classification,
        competingExplanationSet: competing,
        erSplit: { input: erSplitInput, set: erSplit },
        policyVersion: 'v1',
        computedAt,
      });

      const representedExplanationIds = [
        ...competing.explanations.map((e) => e.explanationId),
        ...erSplit.explanations.map((e) => e.explanationId),
      ];
      const representedExplanations = [
        ...competing.explanations.map((e) => ({
          supportingHypothesisIds: e.supportingHypothesisIds,
          contradictingHypothesisIds: e.contradictingHypothesisIds,
          temporalScope: e.temporalScope,
        })),
      ];

      return {
        input: {
          investigationId,
          gapId,
          candidateRequests: pr17.candidateRequests,
          context: {
            gapTemporalScope: regionResult.rawCandidate.temporalScope ?? null,
            gapExpectationDerivedIds: regionResult.rawCandidate.supportingHypothesisIds,
            representedExplanations,
            representedExplanationIds,
            observations: gapInput.observations,
          },
          policyVersion: 'v1' as const,
          computedAt,
        },
        gapInput,
      };
    }

    it('T2: PR18 ranks/selects the real PR17 candidates over the production chain', () => {
      const { input } = buildPr18Input();
      const result = selectBestEvidenceFromCandidates(input);
      expect(result.gapId).toBe(gapId);
      expect(result.utilityPolicyVersion).toBe('v1');
      expect(result.rankedRequests.length).toBeGreaterThan(0);
      for (const r of result.rankedRequests) {
        expect(r.utility.eig).toBe(r.utility.expectedInformationGain);
        expect(r.utility.score).toBeGreaterThanOrEqual(0);
        expect(r.utility.score).toBeLessThanOrEqual(1);
      }
    });

    it('T3: identical production bundle => byte-identical PR18 selection (deterministic + idempotent)', () => {
      const { input } = buildPr18Input();
      const a = JSON.stringify(selectBestEvidenceFromCandidates(input).rankedRequests);
      const b = JSON.stringify(selectBestEvidenceFromCandidates(input).rankedRequests);
      expect(a).toBe(b);
    });

    it('T4: typed case/gap isolation over production shapes', () => {
      const { input } = buildPr18Input();
      let code: string | undefined;
      try {
        selectBestEvidenceFromCandidates({ ...input, gapId: randomUUID() });
      } catch (err) {
        if (err instanceof NextBestEvidenceError) code = err.code;
      }
      // Every candidate addresses the original gap, so a mismatched evaluation gap fails closed.
      expect(code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.INCONSISTENT_GAP_ID);
    });
  },
);