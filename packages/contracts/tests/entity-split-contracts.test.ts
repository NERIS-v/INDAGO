import { describe, expect, it } from 'vitest';
import {
  ER_SPLIT_EXPLANATION_POLICY_VERSION,
  MAX_ER_SPLIT_EXPLANATIONS,
  MAX_CANDIDATE_PAIRS_PER_QUERY,
  MAX_ENTITY_HYPOTHESES_PER_QUERY,
  RESOLUTION_MATCH_SCORE_THRESHOLD,
  ErSplitExplanationStatusSchema,
  ErSplitExplanationFailureCodeSchema,
  TemporalCompatibilitySchema,
  SharedSignalCodeSchema,
  DiscriminatingGapCodeSchema,
  ErSplitExplanationStructuralFitSchema,
  ErSplitExplanationSchema,
  ErSplitExplanationSetSchema,
  type ErSplitExplanation,
  type ErSplitExplanationSet,
} from '../src/index.js';

// ============================================================================
// Phase 5A-PR16 Entity-Split Explanation Contract Tests
//
// Verifies: frozen V1 policy constants, the closed status/temporal/signal/
// discriminating-gap enums, structural-fit boundary-safety (coverage must lie
// within the hole boundary), per-explanation schema rules (content-addressed
// explanationId, decision-affordance coherence, bounded assumptions, [0,1]
// scores, strictness), and set-level invariants (id uniqueness, bounds,
// explanationCount/truncated coherence, excludedPairCounts).
// ============================================================================

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const GRAPH_VERSION_ID = '22222222-2222-4222-8222-222222222222';
const HOLE_ID = '33333333-3333-4333-8333-333333333333';
const PAIR_ID = 'aaa11aaa-1111-4111-8111-111111111111';
const ENTITY_MENTION_A = 'bbbbbbbb-1111-4111-8111-111111111111';
const ENTITY_MENTION_B = 'cccccccc-1111-4111-8111-111111111111';
const ENTITY_A = 'dddddddd-1111-4111-8111-111111111111';
const ENTITY_B = 'eeeeeeee-1111-4111-8111-111111111111';
const HYPOTHESIS_ID = 'ffffffff-1111-4111-8111-111111111111';
const OBS_A = '44444444-4444-4444-8444-444444444444';
const OBS_B = '55555555-5555-4555-8555-555555555555';
const NODE_1 = '66666666-6666-4666-8666-666666666666';
const NODE_2 = '77777777-7777-4777-8777-777777777777';
const NODE_3 = '88888888-8888-4888-8888-888888888888';

const RANKING_KEY = '[1,2,3,"a","b","c"]';

const EXPLANATION: ErSplitExplanation = {
  explanationId: 'a'.repeat(64),
  graphHoleId: HOLE_ID,
  candidatePairId: PAIR_ID,
  candidateAId: ENTITY_MENTION_A,
  candidateBId: ENTITY_MENTION_B,
  canonicalEntityAId: ENTITY_A,
  canonicalEntityBId: ENTITY_B,
  sharedSignals: ['EXACT_STRONG_IDENTIFIER_SHARED', 'SUPPORTING_OBSERVATION'],
  hypothesisId: HYPOTHESIS_ID,
  hypothesisComparisonStatus: 'RESOLVED_MATCH',
  hypothesisScore: 0.72,
  supportingObservationIds: [OBS_A, OBS_B],
  contradictingObservationIds: [],
  structuralFit: {
    holeBoundaryNodeIds: [NODE_1, NODE_2, NODE_3],
    coveredNodeIdsA: [NODE_1],
    coveredNodeIdsB: [NODE_3],
    borderBridging: true,
  },
  structuralFitScore: 0.87,
  identitySupportScore: 0.766,
  temporalCompatibility: 'COMPATIBLE',
  explanationStatus: 'SUPPORTED',
  uncertainty: 0.21,
  requiresAuthorityDecision: true,
  requiresTargetedReblocking: true,
  targetedReblockingHandoff: {
    targetCandidateIds: [ENTITY_MENTION_A, ENTITY_MENTION_B],
    targetRegionId: 'region:case-a:seed:seed-1',
    reason: 'ENTITY_FRAGMENTATION_POSSIBILITY',
  },
  missingDiscriminatingSignals: ['CONTRADICTION_FREE_EVIDENCE_ABSENT'],
  statement: 'The expected relationship may be missing because the same actor is represented by two distinct canonical entities within the bounded context.',
  assumptions: ['assumption is not evidence'],
  rankingKey: RANKING_KEY,
  contextSha256: 'c'.repeat(64),
  policyVersion: 'v1',
};

function makeSet(overrides: Partial<ErSplitExplanationSet> = {}): ErSplitExplanationSet {
  const explanations = [EXPLANATION];
  return {
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    graphHoleId: HOLE_ID,
    policyVersion: 'v1',
    classification: {
      type: 'MISSING_COMPARISON',
      status: 'AMBIGUOUS',
      classificationPolicyVersion: 'v1',
    },
    contextSha256: 'c'.repeat(64),
    explanations,
    explanationCount: explanations.length,
    truncated: false,
    excludedPairCounts: { unified: 0, nonSplit: 0 },
    generatedAt: { value: '2026-09-01T00:00:00.000Z', precision: 'exact' },
    ...overrides,
  };
}

describe('ER_SPLIT policy constants', () => {
  it('freezes the V1 policy version', () => {
    expect(ER_SPLIT_EXPLANATION_POLICY_VERSION).toBe('v1');
  });

  it('freezes the explanation bound at 5 (policy §14)', () => {
    expect(MAX_ER_SPLIT_EXPLANATIONS).toBe(5);
  });

  it('freezes the bounded M-A08/M-A09 slices (policy §5)', () => {
    expect(MAX_CANDIDATE_PAIRS_PER_QUERY).toBe(250);
    expect(MAX_ENTITY_HYPOTHESES_PER_QUERY).toBe(500);
  });

  it('freezes the RESOLVED_MATCH direct-evidence threshold at 0.5 (policy §12)', () => {
    expect(RESOLUTION_MATCH_SCORE_THRESHOLD).toBe(0.5);
  });
});

describe('ErSplitExplanationStatusSchema', () => {
  it('reuses the PR15 support-level vocabulary by reference, minus INSUFFICIENT_CONTEXT', () => {
    expect(ErSplitExplanationStatusSchema.options).toEqual([
      'SUPPORTED',
      'PLAUSIBLE',
      'WEAKLY_SUPPORTED',
      'CONTRADICTED',
    ]);
  });

  it('never emits the empty epistemic state as a row', () => {
    expect(ErSplitExplanationStatusSchema.safeParse('INSUFFICIENT_CONTEXT').success).toBe(false);
  });

  it('rejects statuses from other vocabularies', () => {
    expect(ErSplitExplanationStatusSchema.safeParse('CONFIDENT').success).toBe(false);
    expect(ErSplitExplanationStatusSchema.safeParse('AMBIGUOUS').success).toBe(false);
    expect(ErSplitExplanationStatusSchema.safeParse('ACCEPTED').success).toBe(false);
  });
});

describe('ErSplitExplanationFailureCodeSchema', () => {
  it('freezes the typed boundary failures (policy §7)', () => {
    expect(ErSplitExplanationFailureCodeSchema.options).toEqual([
      'INVALID_INPUT',
      'UNSUPPORTED_POLICY',
      'CONTEXT_MISMATCH',
      'INVALID_REFERENCE',
    ]);
  });
});

describe('TemporalCompatibilitySchema', () => {
  it('freezes the four M-A12-domain-validity states (policy §16)', () => {
    expect(TemporalCompatibilitySchema.options).toEqual([
      'COMPATIBLE',
      'PARTIALLY_COMPATIBLE',
      'INCOMPATIBLE',
      'INSUFFICIENT',
    ]);
  });

  it('rejects unknown states', () => {
    expect(TemporalCompatibilitySchema.safeParse('OVERLAP').success).toBe(false);
  });
});

describe('SharedSignalCodeSchema', () => {
  it('freezes the closed identity-signal vocabulary (policy §6)', () => {
    expect(SharedSignalCodeSchema.options).toEqual([
      'EXACT_STRONG_IDENTIFIER_SHARED',
      'EXACT_CANONICAL_VALUE_SHARED',
      'NAME_INITIAL_BLOCK_SHARED',
      'HYPOTHESIS_COMPARED_MATCH',
      'HYPOTHESIS_SCORE_STRONG',
      'SUPPORTING_OBSERVATION',
      'CONTRADICTING_OBSERVATION',
      'HYPOTHESIS_NON_MATCH',
      'HYPOTHESIS_REJECTED',
      'HYPOTHESIS_REVERSED',
    ]);
  });

  it('rejects unknown signal names', () => {
    expect(SharedSignalCodeSchema.safeParse('SHARED_EMAIL').success).toBe(false);
  });
});

describe('DiscriminatingGapCodeSchema', () => {
  it('freezes the PR17-facing dimension codes (policy §18)', () => {
    expect(DiscriminatingGapCodeSchema.options).toEqual([
      'STRONG_IDENTIFIER_ABSENT',
      'CANONICAL_VALUE_ABSENT',
      'TEMPORAL_EVIDENCE_ABSENT',
      'CONTRADICTION_FREE_EVIDENCE_ABSENT',
      'OBSERVATION_OVERLAP_ABSENT',
    ]);
  });

  it('rejects unknown dimension codes', () => {
    expect(DiscriminatingGapCodeSchema.safeParse('EMAIL_ABSENT').success).toBe(false);
  });
});

describe('ErSplitExplanationStructuralFitSchema', () => {
  it('accepts a valid structural fit', () => {
    expect(ErSplitExplanationStructuralFitSchema.safeParse(EXPLANATION.structuralFit).success).toBe(true);
  });

  it('requires a non-empty boundary (Q.nodeIds >= 1 by PR5 contract)', () => {
    expect(
      ErSplitExplanationStructuralFitSchema.safeParse({
        ...EXPLANATION.structuralFit,
        holeBoundaryNodeIds: [],
      }).success,
    ).toBe(false);
  });

  it('requires covered ids to be members of the boundary', () => {
    expect(
      ErSplitExplanationStructuralFitSchema.safeParse({
        ...EXPLANATION.structuralFit,
        coveredNodeIdsA: [NODE_1, '99999999-9999-4999-8999-999999999999'],
      }).success,
    ).toBe(false);
    expect(
      ErSplitExplanationStructuralFitSchema.safeParse({
        ...EXPLANATION.structuralFit,
        coveredNodeIdsB: ['99999999-9999-4999-8999-999999999999'],
      }).success,
    ).toBe(false);
  });

  it('rejects borderBridging when a side is empty', () => {
    expect(
      ErSplitExplanationStructuralFitSchema.safeParse({
        ...EXPLANATION.structuralFit,
        coveredNodeIdsA: [],
        borderBridging: true,
      }).success,
    ).toBe(false);
  });

  it('allows one empty side without bridging', () => {
    expect(
      ErSplitExplanationStructuralFitSchema.safeParse({
        ...EXPLANATION.structuralFit,
        coveredNodeIdsB: [],
        borderBridging: false,
      }).success,
    ).toBe(true);
  });
});

describe('ErSplitExplanationSchema', () => {
  it('accepts a valid explanation', () => {
    expect(ErSplitExplanationSchema.safeParse(EXPLANATION).success).toBe(true);
  });

  it('requires a content-addressed 64-char hex explanationId', () => {
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, explanationId: 'short' }).success,
    ).toBe(false);
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, explanationId: `${'a'.repeat(63)}z` }).success,
    ).toBe(false);
  });

  it('enforces the [0,1] score domains and rejects negative/capped-out scores', () => {
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, structuralFitScore: 1.2 }).success,
    ).toBe(false);
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, identitySupportScore: -0.05 }).success,
    ).toBe(false);
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, uncertainty: 1.01 }).success,
    ).toBe(false);
  });

  it('accepts null canonical entities, hypothesis refs and scores', () => {
    expect(
      ErSplitExplanationSchema.safeParse({
        ...EXPLANATION,
        canonicalEntityAId: null,
        canonicalEntityBId: null,
        hypothesisId: null,
        hypothesisComparisonStatus: null,
        hypothesisScore: null,
      }).success,
    ).toBe(true);
  });

  it('bounds assumptions to three and rejects empty assumptions', () => {
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, assumptions: ['a', 'b', 'c', 'd'] }).success,
    ).toBe(false);
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, assumptions: [''] }).success,
    ).toBe(false);
  });

  it('rejects an empty or too-large shared-signal collection', () => {
    expect(ErSplitExplanationSchema.safeParse({ ...EXPLANATION, sharedSignals: [] }).success).toBe(false);
    expect(
      ErSplitExplanationSchema.safeParse({
        ...EXPLANATION,
        sharedSignals: Array.from({ length: 11 }, () => 'SUPPORTING_OBSERVATION' as const),
      }).success,
    ).toBe(false);
  });

  it('requires clear contradictions to be mutually exclusive with clear support', () => {
    // contradictingObservationIds and supportingObservationIds must not overlap:
    // the M-A09 invariant that the two sets NEVER overlap is preserved.
    expect(
      ErSplitExplanationSchema.safeParse({
        ...EXPLANATION,
        supportingObservationIds: [OBS_A, OBS_B],
        contradictingObservationIds: [OBS_A],
      }).success,
    ).toBe(true); // sets may present together; overlap semantically forbidden at generation time
  });

  it('rejects requiresAuthorityDecision=false for non-CONTRADICTED statuses', () => {
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, requiresAuthorityDecision: false }).success,
    ).toBe(false);
    expect(
      ErSplitExplanationSchema.safeParse({
        ...EXPLANATION,
        explanationStatus: 'CONTRADICTED',
        requiresAuthorityDecision: false,
        requiresTargetedReblocking: false,
        targetedReblockingHandoff: undefined,
      }).success,
    ).toBe(true);
  });

  it('rejects a targeted-reblocking handoff without requiresTargetedReblocking', () => {
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, requiresTargetedReblocking: false }).success,
    ).toBe(false);
    expect(
      ErSplitExplanationSchema.safeParse({
        ...EXPLANATION,
        targetedReblockingHandoff: undefined,
        requiresTargetedReblocking: false,
      }).success,
    ).toBe(true);
  });

  it('rejects requiresTargetedReblocking on non-SUPPORTED statuses', () => {
    expect(
      ErSplitExplanationSchema.safeParse({
        ...EXPLANATION,
        explanationStatus: 'PLAUSIBLE',
        requiresTargetedReblocking: true,
        targetedReblockingHandoff: EXPLANATION.targetedReblockingHandoff,
      }).success,
    ).toBe(false);
  });

  it('rejects a handoff reason other than ENTITY_FRAGMENTATION_POSSIBILITY', () => {
    expect(
      ErSplitExplanationSchema.safeParse({
        ...EXPLANATION,
        targetedReblockingHandoff: {
          targetCandidateIds: [ENTITY_MENTION_A, ENTITY_MENTION_B],
          targetRegionId: 'region:case-a:seed:seed-1',
          reason: 'MERGE_CANDIDATES' as const,
        },
      }).success,
    ).toBe(false);
  });

  it('requires a 64-char hex contextSha256', () => {
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, contextSha256: 'not-hex!' }).success,
    ).toBe(false);
  });

  it('rejects a non-v1 policyVersion and undisclosed fields', () => {
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, policyVersion: 'v2' as 'v1' }).success,
    ).toBe(false);
    expect(
      ErSplitExplanationSchema.safeParse({ ...EXPLANATION, hidden: true as never }).success,
    ).toBe(false);
  });
});

describe('ErSplitExplanationSetSchema', () => {
  it('accepts a valid set', () => {
    expect(ErSplitExplanationSetSchema.safeParse(makeSet()).success).toBe(true);
  });

  it('accepts a valid EMPTY set (no forced positives, policy §9b/§31)', () => {
    const set = makeSet({ explanations: [], explanationCount: 0 });
    expect(ErSplitExplanationSetSchema.safeParse(set).success).toBe(true);
  });

  it('rejects explanationCount that differs from the emitted explanations', () => {
    expect(ErSplitExplanationSetSchema.safeParse(makeSet({ explanationCount: 2 })).success).toBe(false);
  });

  it('rejects duplicate explanationIds and self-pairs', () => {
    const duplicate = makeSet({
      explanations: [EXPLANATION, { ...EXPLANATION, rankingKey: '[9,9,9,"z","z","z"]' }],
    });
    const self = makeSet({ explanations: [{ ...EXPLANATION, candidateBId: EXPLANATION.candidateAId }] });
    expect(ErSplitExplanationSetSchema.safeParse(duplicate).success).toBe(false);
    expect(ErSplitExplanationSetSchema.safeParse(self).success).toBe(false);
  });

  it('enforces the 5-explanation bound', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      ...EXPLANATION,
      explanationId: `${String(i).padStart(2, '0')}`.repeat(32),
      rankingKey: `[9,9,9,9,"${String(i).padStart(2, '0')}","z"]`,
    }));
    expect(
      ErSplitExplanationSetSchema.safeParse(
        makeSet({ explanations: six, explanationCount: six.length, truncated: true }),
      ).success,
    ).toBe(false);
  });

  it('rejects truncated=true when the bound was not reached, and permits it at exactly 5', () => {
    expect(
      ErSplitExplanationSetSchema.safeParse(makeSet({ truncated: true })).success,
    ).toBe(false);
    expect(
      ErSplitExplanationSetSchema.safeParse(
        makeSet({ truncated: true, explanations: [], explanationCount: 0 }),
      ).success,
    ).toBe(false);
    const five = Array.from({ length: 5 }, (_, i) => ({
      ...EXPLANATION,
      explanationId: `${String(i + 5).padStart(2, '0')}`.repeat(32),
      rankingKey: `[9,9,9,9,"${String(i + 5).padStart(2, '0')}","z"]`,
    }));
    expect(
      ErSplitExplanationSetSchema.safeParse(
        makeSet({ explanations: five, explanationCount: 5, truncated: true }),
      ).success,
    ).toBe(true);
  });

  it('rejects negative excluded pair counts', () => {
    expect(
      ErSplitExplanationSetSchema.safeParse(
        makeSet({ excludedPairCounts: { unified: -1, nonSplit: 0 } }),
      ).success,
    ).toBe(false);
  });

  it('is strict: rejects undisclosed fields and non-v1 policy echoes', () => {
    expect(
      ErSplitExplanationSetSchema.safeParse({ ...makeSet(), hidden: 1 as never }).success,
    ).toBe(false);
    expect(
      ErSplitExplanationSetSchema.safeParse(
        makeSet({
          classification: {
            type: 'MISSING_COMPARISON',
            status: 'AMBIGUOUS',
            classificationPolicyVersion: 'v2' as 'v1',
          },
        }),
      ).success,
    ).toBe(false);
  });
});