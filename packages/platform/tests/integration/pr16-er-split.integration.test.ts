// ============================================================================
// PR16-8 — ER-split explanation detection integration (REAL Postgres)
// ============================================================================
//
// Through the EXACT production chain:
//   seed A–B–C → production region build on V2 → production recompute →
//   REAL M-A07 mention candidates + REAL M-A08 candidate pair + REAL M-A09
//   entity hypothesis (persisted) → REAL PR14 classification over the
//   recompute bundle → generateErSplitExplanations over the REAL cross-domain
//   slice with the REAL PR15 competing set.
//
// Frozen V1 narrative for this fixture: a fragment-compatible A~B pair exists
// with distinct canonical entities on opposite sides of the MISSING_EDGE
// boundary and a RESOLVED_MATCH hypothesis — so the detector returns it as a
// PLAUSIBLE ER-split explanation. Because the explanation is not yet
// evidence-SUPPORTED, targeted reblocking is not requested.
// Determinism is asserted by byte-identical regeneration; typed boundary
// failures (cross-case hypothesis, policy version) reject with
// CONTEXT_MISMATCH / UNSUPPORTED_POLICY.
//
// REQUIRES TEST_DATABASE_URL/schema; suite skips cleanly when unset.
// ============================================================================

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import type {
  CandidatePair,
  EntityHypothesis,
  EntityMentionCandidate,
} from "@indago/contracts";

import { ErSplitExplanationSetSchema } from "@indago/contracts";

import {
  blockCandidates,
  buildCandidatePairIdentityKey,
  buildEntityMentionIdentityKey,
  finalizeCandidatePair,
} from "@indago/ingestion";

import {
  buildEntityHypothesisIdentityKey,
  deterministicEntityHypothesisId,
  RESOLUTION_SCORE_MODEL_VERSION,
} from "@indago/entity-resolution";

import {
  classifyGap,
  type GapClassificationInput,
} from "@indago/gap-classification";

import type { GraphHoleRegion } from "@indago/graph-hole-region";

import {
  generateCompetingExplanations,
  type CompetingExplanationInput,
} from "@indago/competing-explanations";

import {
  ErSplitExplanationError,
  ErSplitExplanationErrorCodes,
  generateErSplitExplanations,
  type ErSplitExplanationInput,
} from "@indago/entity-split-analysis";

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
} from "./pr13-fixtures.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const HEX64 = /^[0-9a-f]{64}$/;

describe.skipIf(!TEST_DATABASE_URL)(
  "PR16 ER-split explanation detection integration (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let stores: Phase5AStores;
    let ids: Phase5AIdSet;
    let region: GraphHoleRegion;
    let candidates: EntityMentionCandidate[];
    let pair: CandidatePair;
    let hypothesis: EntityHypothesis;

    const caseId = randomUUID();
    const investigationId = randomUUID();

    const computedAt = {
      value: "2026-09-17T00:00:00.000Z",
      precision: "exact",
    } as const;

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

      prisma = new PrismaClient({
        datasources: {
          db: {
            url: TEST_DATABASE_URL,
          },
        },
      });

      stores = makePhase5AStores(prisma);

      await cleanup(prisma);

      ids = await seedPhase5ACase(stores, {
        caseId,
        investigationId,
      });
    }, 120_000);

    afterAll(async () => {
      if (!TEST_DATABASE_URL || prisma === undefined) return;

      await cleanup(prisma);
      await prisma.$disconnect();
    });

    // ------------------------------------------------------------------------
    // T0 — production region + recompute → ONE qualified MISSING_EDGE
    // ------------------------------------------------------------------------

    let bundle: RegionRecomputeBundle;

    it(
      "T0: production recompute yields one qualified MISSING_EDGE candidate",
      async () => {
        const projection = makeProjectionService(stores);

        region = await buildProductionRegion({
          graphProjectionService: projection,
          observations: stores.observations,
          caseId,
          investigationId,
          graphVersionId: ids.v2Id,
          seedObservationIds: [ids.obsA1, ids.obsB1],
        });

        expect(region.status).toBe("SATURATED");
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

        expect(
          q.qualifiedCandidates[0]!.rawCandidate.expectedRelationshipType,
        ).toBe("association");

        expect(
          sortedUnique(q.qualifiedCandidates[0]!.rawCandidate.nodeIds),
        ).toEqual(
          sortedUnique([ids.entityAId, ids.entityBId]),
        );
      },
      60_000,
    );

    // ------------------------------------------------------------------------
    // T1 — REAL M-A07/M-A08/M-A09 slice persisted through production stores
    // ------------------------------------------------------------------------

    async function seedMention(
      observationId: string,
      canonicalMatchValue: string,
    ): Promise<EntityMentionCandidate> {
      const candidate: EntityMentionCandidate = {
        id: randomUUID(),
        observationId,
        text: canonicalMatchValue,
        start: 0,
        end: canonicalMatchValue.length,
        entityType: "PERSON",
        extractionMethod: "PATTERN_MATCH",
        canonicalMatchValue,
        provenance: {
          sourceId: ids.sourceId,
          artifactId: ids.artifactId,
          extractor: "indago:er-split:fixture",
        },
        createdAt: computedAt,
        updatedAt: computedAt,
      };

      const identityKey = buildEntityMentionIdentityKey({
        observationId: candidate.observationId,
        start: candidate.start,
        end: candidate.end,
        entityType: candidate.entityType,
        canonicalMatchValue: candidate.canonicalMatchValue,
      });

      await stores.prisma.entityMentionCandidate.createMany({
        data: [
          {
            id: candidate.id,
            identityKey,
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

            // Prisma DateTime field.
            createdAt: new Date(candidate.createdAt.value),
          },
        ],
        skipDuplicates: true,
      });

      return candidate;
    }

    it(
      "T1: REAL M-A07 mentions + M-A08 A~B pair + M-A09 RESOLVED_MATCH hypothesis",
      async () => {
        // Two distinct canonical entities on opposite sides of the A–B gap.
        const left = await seedMention(
          ids.obsA1,
          "Shared Canonical Value",
        );

        const right = await seedMention(
          ids.obsB1,
          "Shared Canonical Value",
        );

        candidates = [left, right];

        const { drafts } = blockCandidates(
          {
            candidates: [left, right],
            caseId,
            investigationId,
          },
          {},
        );

        expect(drafts).toHaveLength(1);

        pair = await finalizeCandidatePair({
          draft: drafts[0]!,
          nowIso: new Date().toISOString(),
        });

        expect(pair.blockingPasses.length).toBeGreaterThan(0);

        const pairIdentityKey = buildCandidatePairIdentityKey({
          caseId: pair.caseId,
          leftCandidateId: pair.leftCandidateId,
          rightCandidateId: pair.rightCandidateId,
        });

        await stores.prisma.candidatePair.createMany({
          data: [
            {
              id: pair.id,
              identityKey: pairIdentityKey,
              caseId: pair.caseId,
              investigationId:
                pair.investigationId ?? investigationId,
              leftCandidateId: pair.leftCandidateId,
              rightCandidateId: pair.rightCandidateId,
              blockingPasses: pair.blockingPasses,

              // Prisma DateTime field.
              createdAt: new Date(pair.createdAt.value),
            },
          ],
          skipDuplicates: true,
        });

        const hypothesisIdentityKey =
          buildEntityHypothesisIdentityKey({
            candidatePairId: pair.id,
            scoreModelVersion:
              RESOLUTION_SCORE_MODEL_VERSION,
          });

        hypothesis = {
          id: await deterministicEntityHypothesisId({
            candidatePairId: pair.id,
            scoreModelVersion:
              RESOLUTION_SCORE_MODEL_VERSION,
          }),
          caseId,
          investigationId,
          candidatePairId: pair.id,
          supportingCandidateIds: [left.id, right.id],
          comparisonStatus: "RESOLVED_MATCH",
          score: 0.72,
          scoreModelVersion:
            RESOLUTION_SCORE_MODEL_VERSION,
          supportingObservationIds: [
            ids.obsA1,
            ids.obsB1,
          ],
          contradictingObservationIds: [],
          status: "PROPOSED",
          provenance: {
            sourceId: ids.sourceId,
            artifactId: ids.artifactId,
            extractor: "indago:resolution:engine",
            extractionMethod:
              RESOLUTION_SCORE_MODEL_VERSION,
          },
          createdAt: computedAt,
          updatedAt: computedAt,
        };

        await stores.prisma.entityHypothesis.createMany({
          data: [
            {
              id: hypothesis.id,
              identityKey: hypothesisIdentityKey,
              caseId: hypothesis.caseId,
              investigationId: hypothesis.investigationId,
              candidatePairId: hypothesis.candidatePairId!,
              supportingCandidateIds:
                hypothesis.supportingCandidateIds,
              comparisonStatus:
                hypothesis.comparisonStatus,
              score: hypothesis.score,
              scoreModelVersion:
                hypothesis.scoreModelVersion,
              supportingObservationIds:
                hypothesis.supportingObservationIds,
              contradictingObservationIds:
                hypothesis.contradictingObservationIds,
              status: hypothesis.status,
              provenance: hypothesis.provenance,

              // Prisma DateTime fields.
              createdAt: new Date(hypothesis.createdAt.value),
              updatedAt: new Date(hypothesis.updatedAt.value),
            },
          ],
          skipDuplicates: true,
        });
      },
      60_000,
    );

    // ------------------------------------------------------------------------
    // T2 — ER-split input assembled EXCLUSIVELY from production shapes
    // ------------------------------------------------------------------------

    function buildErSplitInput(): ErSplitExplanationInput {
      const regionResult =
        bundle.output.qualification.qualifiedCandidates[0]!;

      const gapInput: GapClassificationInput = {
        caseId: bundle.context.scope.caseId,
        graphVersionId:
          bundle.context.scope.graphVersionId,
        qualifiedCandidate: regionResult,
        region: bundle.context.region,
        nodes: [...bundle.context.nodes],
        edges: [...bundle.context.edges],
        observations: [...bundle.context.observations],
        hypothesisContext:
          bundle.context.hypothesisContext,
        classificationPolicyVersion: "v1",
        computedAt,
      };

      const classification = classifyGap(gapInput);

      const competing = generateCompetingExplanations({
        context: gapInput,
        gapClassification: classification,
        competingExplanationPolicyVersion: "v1",
        computedAt,
      } satisfies CompetingExplanationInput);

      return {
        context: gapInput,
        gapClassification: classification,
        competingExplanationSet: competing,
        candidateUniverse: [...candidates],
        candidatePairs: [pair],
        entityHypotheses: [hypothesis],
        erSplitPolicyVersion: "v1",
        computedAt,
      };
    }

    it(
      "T2: the REAL production slice yields a bound, PLAUSIBLE ER-split explanation",
      () => {
        const input = buildErSplitInput();

        expect(input.gapClassification.type).toBe(
          "MISSING_INVESTIGATION",
        );

        expect(input.gapClassification.status).toBe(
          "CONFIDENT",
        );

        const result = generateErSplitExplanations(input);

        // PR15 set binds and its digest is echoed verbatim.
        expect(
          result.competingExplanationSetContextSha256,
        ).toBe(
          input.competingExplanationSet!.contextSha256,
        );

        // ER-split owns its own deterministic context digest.
        // It is not required to equal the PR14 gap-classification digest.
        expect(result.contextSha256).toMatch(HEX64);

        // Non-empty: the A~B pair is the fragment-compatible explanation.
        expect(result.explanationCount).toBe(
          result.explanations.length,
        );

        expect(
          result.explanations.length,
        ).toBeGreaterThanOrEqual(1);

        const primary = result.explanations[0]!;

        expect(primary.candidatePairId).toBe(
          pair.id,
        );

        expect(primary.explanationStatus).toBe(
          "PLAUSIBLE",
        );

        expect(primary.explanationId).toMatch(
          HEX64,
        );

        expect(
          primary.rankingKey.length,
        ).toBeGreaterThan(0);

        // A plausible split explanation still needs M-A09 authority
        // for the eventual REJECT / MERGE / SPLIT decision.
        expect(
          primary.requiresAuthorityDecision,
        ).toBe(true);

        // Targeted reblocking is reserved for an evidence-supported
        // ER-split explanation. This production slice is only PLAUSIBLE.
        expect(
          primary.requiresTargetedReblocking,
        ).toBe(false);

        expect(
          primary.targetedReblockingHandoff,
        ).toBeUndefined();

        // Closed world: every returned reference resolves inside the bundle.
        const obsIds = new Set(
          bundle.context.observations.map(
            (o) => o.id,
          ),
        );

        const candidateIds = new Set(
          candidates.map((c) => c.id),
        );

        const nodeIds = new Set(
          bundle.context.nodes.map((n) => n.id),
        );

        for (const e of result.explanations) {
          expect(
            [
              ...e.supportingObservationIds,
              ...e.contradictingObservationIds,
            ].every((id) => obsIds.has(id)),
          ).toBe(true);

          expect(
            candidateIds.has(e.candidateAId),
          ).toBe(true);

          expect(
            candidateIds.has(e.candidateBId),
          ).toBe(true);

          expect(
            e.structuralFit.holeBoundaryNodeIds.every(
              (id) => nodeIds.has(id),
            ),
          ).toBe(true);
        }

        // The result binds to the frozen contract.
        expect(
          ErSplitExplanationSetSchema.safeParse(
            result,
          ).success,
        ).toBe(true);
      },
      60_000,
    );

    // ------------------------------------------------------------------------
    // T3 — deterministic generation
    // ------------------------------------------------------------------------

    it(
      "T3: identical production bundle ⇒ byte-identical ER-split sets",
      () => {
        const a =
          generateErSplitExplanations(
            buildErSplitInput(),
          );

        const b =
          generateErSplitExplanations(
            buildErSplitInput(),
          );

        expect(b).toEqual(a);

        expect(b.contextSha256).toBe(
          a.contextSha256,
        );

        expect(
          b.explanations[0]!.explanationId,
        ).toBe(
          a.explanations[0]!.explanationId,
        );
      },
    );

    // ------------------------------------------------------------------------
    // T4 — typed boundary failures
    // ------------------------------------------------------------------------

    it(
      "T4: typed boundary failures over production shapes",
      () => {
        const input = buildErSplitInput();

        // Cross-case hypothesis -> CONTEXT_MISMATCH.
        let code: string | undefined;

        try {
          generateErSplitExplanations({
            ...input,
            entityHypotheses: [
              {
                ...hypothesis,
                caseId: randomUUID(),
              },
            ],
          });
        } catch (err) {
          if (err instanceof ErSplitExplanationError) {
            code = err.code;
          }
        }

        expect(code).toBe(
          ErSplitExplanationErrorCodes.CONTEXT_MISMATCH,
        );

        // Unsupported policy version.
        code = undefined;

        try {
          generateErSplitExplanations({
            ...input,
            erSplitPolicyVersion:
              "v2" as "v1",
          });
        } catch (err) {
          if (err instanceof ErSplitExplanationError) {
            code = err.code;
          }
        }

        expect(code).toBe(
          ErSplitExplanationErrorCodes.UNSUPPORTED_POLICY,
        );

        // Null input.
        code = undefined;

        try {
          generateErSplitExplanations(
            null as unknown as ErSplitExplanationInput,
          );
        } catch (err) {
          if (err instanceof ErSplitExplanationError) {
            code = err.code;
          }
        }

        expect(code).toBe(
          ErSplitExplanationErrorCodes.INVALID_INPUT,
        );
      },
    );
  },
);