import { describe, expect, it } from 'vitest';
import {
  COMPETING_EXPLANATION_POLICY_VERSION,
  MAX_COMPETING_EXPLANATIONS,
  CompetingExplanationTypeSchema,
  CompetingExplanationBasisSchema,
  CompetingExplanationSupportLevelSchema,
  CompetingExplanationFailureCodeSchema,
  CompetingExplanationIdentityV1Schema,
  CompetingExplanationSchema,
  CompetingExplanationSetSchema,
  CompetingExplanationHoleSchema,
  type CompetingExplanation,
  type CompetingExplanationSet,
  type CompetingExplanationIdentityV1,
} from '../src/index.js';

// ============================================================================
// Phase 5A-PR15 Competing Explanation Contract Tests
//
// Verifies: frozen V1 policy constants, the closed taxonomy/basis/support-
// level/failure enums, strict content-addressable identity tuples, per-
// explanation schema rules (bounded assumptions, temporal scope, epistemic
// ceiling-free wording), and set-level invariants (id uniqueness, type
// binding, INSUFFICIENT_CONTEXT => empty set, bounds, claim/explanationCount
// consistency).
// ============================================================================

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const GRAPH_VERSION_ID = '22222222-2222-4222-8222-222222222222';
const HOLE_ID = '33333333-3333-4333-8333-333333333333';

const OBS_A = '44444444-4444-4444-8444-444444444444';
const OBS_B = '55555555-5555-4555-8555-555555555555';
const NODE_A = '66666666-6666-4666-8666-666666666666';
const HYP_A = 'atomic:RELATION_HYPOTHESIS:77777777-7777-4777-8777-777777777777';

const RANKING_KEY = '[1,2,3,4,"abc"]';

const EXPLANATION: CompetingExplanation = {
  explanationId: 'a'.repeat(64),
  type: 'MISSING_DATA_EXPLANATION',
  basis: 'REQUIRED_INFORMATION_ABSENT',
  statement: 'The expected relationship cannot yet be resolved because the necessary evidence is absent from the bounded context.',
  graphHoleId: HOLE_ID,
  gapClassificationType: 'MISSING_DATA',
  supportingObservationIds: [],
  contradictingObservationIds: [],
  supportingHypothesisIds: [HYP_A],
  contradictingHypothesisIds: [],
  structuralSignalIds: [NODE_A],
  temporalScope: {
    validFrom: { value: '2026-01-01T00:00:00.000Z', precision: 'exact' },
    validTo: { value: '2026-06-30T00:00:00.000Z', precision: 'exact' },
    precision: 'day',
    semantics: 'observed',
  },
  supportLevel: 'SUPPORTED',
  uncertainty: 0.35,
  assumptions: ['assumption is not evidence'],
  rankingKey: RANKING_KEY,
  policyVersion: 'v1',
};

function makeIdentity(overrides: Partial<CompetingExplanationIdentityV1> = {}): CompetingExplanationIdentityV1 {
  return {
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    graphHoleId: HOLE_ID,
    classificationType: 'MISSING_DATA',
    explanationType: 'MISSING_DATA_EXPLANATION',
    basis: 'REQUIRED_INFORMATION_ABSENT',
    expectedRelationshipType: 'communication',
    supportingObservationIds: [],
    supportingHypothesisIds: [HYP_A],
    contradictingObservationIds: [],
    contradictingHypothesisIds: [],
    structuralSignalIds: [NODE_A],
    policyVersion: 'v1',
    ...overrides,
  };
}

function makeSet(overrides: Partial<CompetingExplanationSet> = {}): CompetingExplanationSet {
  const explanations = [EXPLANATION];
  return {
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    graphHoleId: HOLE_ID,
    classification: {
      type: 'MISSING_DATA',
      status: 'CONFIDENT',
      contextSha256: 'b'.repeat(64),
      classificationPolicyVersion: 'v1',
    },
    explanations,
    explanationCount: explanations.length,
    truncated: false,
    contextSha256: 'c'.repeat(64),
    policyVersion: 'v1',
    computedAt: { value: '2026-09-01T00:00:00.000Z', precision: 'exact' },
    ...overrides,
  };
}

describe('COMPETING_EXPLANATION policy constants', () => {
  it('freezes the V1 policy version', () => {
    expect(COMPETING_EXPLANATION_POLICY_VERSION).toBe('v1');
  });

  it('freezes the legacy-bound explanation bound at 5 (policy §14)', () => {
    expect(MAX_COMPETING_EXPLANATIONS).toBe(5);
  });
});

describe('CompetingExplanationTypeSchema', () => {
  it('freezes nine families (five primaries + four structural alternatives)', () => {
    expect(CompetingExplanationTypeSchema.options).toEqual([
      'MISSING_INVESTIGATION_EXPLANATION',
      'MISSING_DATA_EXPLANATION',
      'MISSING_COMPARISON_EXPLANATION',
      'INFRASTRUCTURE_EXPLANATION',
      'CONCEALMENT_CONSISTENT_EXPLANATION',
      'ENTITY_FRAGMENTATION_EXPLANATION',
      'RELATION_REPRESENTATION_EXPLANATION',
      'TEMPORAL_EXPLANATION',
      'INNOCENT_ALTERNATIVE_EXPLANATION',
    ]);
  });

  it('rejects unknown family names', () => {
    expect(CompetingExplanationTypeSchema.safeParse('MISSING_EVIDENCE_EXPLANATION').success).toBe(false);
    expect(CompetingExplanationTypeSchema.safeParse('CONCEALMENT_EXPLANATION').success).toBe(false);
  });
});

describe('CompetingExplanationBasisSchema', () => {
  it('freezes the closed basis-code vocabulary (policy §12)', () => {
    expect(CompetingExplanationBasisSchema.options).toEqual([
      'QUESTION_IDENTIFIED_NOT_EVALUATED',
      'INVESTIGATION_NOT_CONCLUDED',
      'REQUIRED_INFORMATION_ABSENT',
      'COMPARISON_BASELINE_ABSENT',
      'REGION_REPRESENTATION_LIMITED',
      'SOURCE_CATEGORY_UNAVAILABLE',
      'RELATIONSHIP_TYPE_UNREPRESENTED',
      'TEMPORAL_SCOPE_MISMATCH',
      'ENTITY_IDENTITY_UNRESOLVED',
      'LEGITIMATE_STRUCTURAL_ALTERNATIVE',
      'PATTERN_COMPATIBLE_ABSENCE',
    ]);
  });
});

describe('CompetingExplanationSupportLevelSchema', () => {
  it('freezes the epistemic support levels (distinct from PR14 status vocab)', () => {
    expect(CompetingExplanationSupportLevelSchema.options).toEqual([
      'SUPPORTED',
      'PLAUSIBLE',
      'WEAKLY_SUPPORTED',
      'CONTRADICTED',
      'INSUFFICIENT_CONTEXT',
    ]);
  });

  it('keeps support levels semantically distinct from GapClassificationStatus names', () => {
    // SUPPORTED is shared by name but documented as explanation grounding,
    // never as classifier confidence (explicitly documented on the schema).
    const levels = new Set(CompetingExplanationSupportLevelSchema.options);
    expect(levels.has('CONFIDENT')).toBe(false);
    expect(levels.has('AMBIGUOUS')).toBe(false);
  });
});

describe('CompetingExplanationFailureCodeSchema', () => {
  it('freezes the typed boundary failures (policy §7)', () => {
    expect(CompetingExplanationFailureCodeSchema.options).toEqual([
      'INVALID_INPUT',
      'UNSUPPORTED_POLICY',
      'CONTEXT_MISMATCH',
      'INVALID_REFERENCE',
    ]);
  });
});

describe('CompetingExplanationIdentityV1Schema', () => {
  it('accepts a valid identity tuple', () => {
    expect(CompetingExplanationIdentityV1Schema.safeParse(makeIdentity()).success).toBe(true);
  });

  it('rejects a non-literal policy version', () => {
    expect(
      CompetingExplanationIdentityV1Schema.safeParse(makeIdentity({ policyVersion: 'v2' as 'v1' })).success,
    ).toBe(false);
  });

  it('rejects non-UUID caseId / graphVersionId, empty candidate ids and empty derived ids', () => {
    expect(
      CompetingExplanationIdentityV1Schema.safeParse(makeIdentity({ caseId: 'x' })).success,
    ).toBe(false);
    expect(
      CompetingExplanationIdentityV1Schema.safeParse(makeIdentity({ graphVersionId: 'x' })).success,
    ).toBe(false);
    expect(
      CompetingExplanationIdentityV1Schema.safeParse(makeIdentity({ graphHoleId: '' })).success,
    ).toBe(false);
    expect(
      CompetingExplanationIdentityV1Schema.safeParse(makeIdentity({ graphHoleId: 'x' })).success,
    ).toBe(true);
    expect(
      CompetingExplanationIdentityV1Schema.safeParse(
        makeIdentity({ supportingHypothesisIds: [HYP_A, ''] }),
      ).success,
    ).toBe(false);
  });

  it('rejects non-UUID observation/node references', () => {
    expect(
      CompetingExplanationIdentityV1Schema.safeParse(
        makeIdentity({ supportingObservationIds: ['not-a-uuid'] }),
      ).success,
    ).toBe(false);
    expect(
      CompetingExplanationIdentityV1Schema.safeParse(makeIdentity({ structuralSignalIds: ['nope'] })).success,
    ).toBe(false);
  });

  it('is strict: rejects undisclosed fields', () => {
    expect(
      CompetingExplanationIdentityV1Schema.safeParse({ ...makeIdentity(), verdict: 'x' as never }).success,
    ).toBe(false);
  });
});

describe('CompetingExplanationSchema', () => {
  it('accepts a valid explanation', () => {
    expect(CompetingExplanationSchema.safeParse(EXPLANATION).success).toBe(true);
  });

  it('requires a content-addressed 64-char hex explanationId (never a temporal/random id)', () => {
    expect(
      CompetingExplanationSchema.safeParse({ ...EXPLANATION, explanationId: 'short' }).success,
    ).toBe(false);
    expect(
      CompetingExplanationSchema.safeParse({ ...EXPLANATION, explanationId: `${'a'.repeat(63)}z` }).success,
    ).toBe(false);
    expect(
      CompetingExplanationSchema.safeParse({ ...EXPLANATION, explanationId: `${'g'.repeat(64)}` }).success,
    ).toBe(false);
  });

  it('bounds assumptions to three and rejects empty/overlong ones', () => {
    const many = CompetingExplanationSchema.safeParse({
      ...EXPLANATION,
      assumptions: ['a', 'b', 'c', 'd'],
    });
    expect(many.success).toBe(false);
    expect(
      CompetingExplanationSchema.safeParse({ ...EXPLANATION, assumptions: [''] }).success,
    ).toBe(false);
    expect(
      CompetingExplanationSchema.safeParse({
        ...EXPLANATION,
        assumptions: ['x'.repeat(501)],
      }).success,
    ).toBe(false);
  });

  it('enforces the [0,1] analytical confidence domain for uncertainty', () => {
    expect(CompetingExplanationSchema.safeParse({ ...EXPLANATION, uncertainty: 1.2 }).success).toBe(false);
    expect(CompetingExplanationSchema.safeParse({ ...EXPLANATION, uncertainty: -0.1 }).success).toBe(false);
  });

  it('accepts a null temporalScope and null gapClassificationType', () => {
    expect(
      CompetingExplanationSchema.safeParse({
        ...EXPLANATION,
        temporalScope: null,
        gapClassificationType: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a non-'v1' policyVersion and unknown support levels", () => {
    expect(
      CompetingExplanationSchema.safeParse({ ...EXPLANATION, policyVersion: 'v2' as 'v1' }).success,
    ).toBe(false);
    expect(
      CompetingExplanationSchema.safeParse({ ...EXPLANATION, supportLevel: 'CONFIDENT' as never }).success,
    ).toBe(false);
  });

  it('is strict: rejects undisclosed fields', () => {
    expect(
      CompetingExplanationSchema.safeParse({ ...EXPLANATION, hidden: true as never }).success,
    ).toBe(false);
  });
});

describe('CompetingExplanationSetSchema', () => {
  it('accepts a valid set', () => {
    expect(CompetingExplanationSetSchema.safeParse(makeSet()).success).toBe(true);
  });

  it('accepts an empty set under an INSUFFICIENT_CONTEXT classification', () => {
    const set = makeSet({
      classification: {
        type: null,
        status: 'INSUFFICIENT_CONTEXT',
        contextSha256: 'b'.repeat(64),
        classificationPolicyVersion: 'v1',
      },
      explanations: [],
      explanationCount: 0,
    });
    expect(CompetingExplanationSetSchema.safeParse(set).success).toBe(true);
  });

  it('rejects a non-empty set under an INSUFFICIENT_CONTEXT classification', () => {
    const set = makeSet({
      classification: {
        type: null,
        status: 'INSUFFICIENT_CONTEXT',
        contextSha256: 'b'.repeat(64),
        classificationPolicyVersion: 'v1',
      },
    });
    expect(CompetingExplanationSetSchema.safeParse(set).success).toBe(false);
  });

  it('rejects explanations that cite a different classification type', () => {
    expect(
      CompetingExplanationSetSchema.safeParse(
        makeSet({ explanations: [{ ...EXPLANATION, gapClassificationType: 'MISSING_DATA' }] }),
      ).success,
    ).toBe(true);
    expect(
      CompetingExplanationSetSchema.safeParse(
        makeSet({ explanations: [{ ...EXPLANATION, gapClassificationType: 'MISSING_COMPARISON' }] }),
      ).success,
    ).toBe(false);
  });

  it('rejects duplicate explanationIds', () => {
    expect(
      CompetingExplanationSetSchema.safeParse(
        makeSet({ explanations: [EXPLANATION, { ...EXPLANATION, rankingKey: '[9,9,9,9,"zzz"]' }] }),
      ).success,
    ).toBe(false);
  });

  it('enforces the 5-explanation bound', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      ...EXPLANATION,
      explanationId: `${String(i).padStart(2, '0')}`.repeat(32),
      rankingKey: `[9,9,9,9,"${String(i).padStart(2, '0')}"]`,
    }));
    expect(
      CompetingExplanationSetSchema.safeParse(
        makeSet({ explanations: six, explanationCount: six.length, truncated: true }),
      ).success,
    ).toBe(false);
  });

  it('requires explanationCount to equal the emitted explanations', () => {
    expect(
      CompetingExplanationSetSchema.safeParse(makeSet({ explanationCount: 2 })).success,
    ).toBe(false);
  });

  it('rejects truncated=true when the bound was not reached', () => {
    expect(CompetingExplanationSetSchema.safeParse(makeSet({ truncated: true })).success).toBe(false);
    expect(
      CompetingExplanationSetSchema.safeParse(makeSet({ truncated: true, explanations: [], explanationCount: 0 })).success,
    ).toBe(false);
    const five = Array.from({ length: 5 }, (_, i) => ({
      ...EXPLANATION,
      explanationId: `${String(i + 5).padStart(2, '0')}`.repeat(32),
      rankingKey: `[9,9,9,9,"${String(i + 5).padStart(2, '0')}"]`,
    }));
    expect(
      CompetingExplanationSetSchema.safeParse(
        makeSet({ explanations: five, explanationCount: 5, truncated: true }),
      ).success,
    ).toBe(true);
  });

  it('is strict: rejects undisclosed fields and non-v1 classification echo', () => {
    expect(
      CompetingExplanationSetSchema.safeParse({ ...makeSet(), hidden: 1 as never }).success,
    ).toBe(false);
    expect(
      CompetingExplanationSetSchema.safeParse(
        makeSet({
          classification: {
            type: 'MISSING_DATA',
            status: 'CONFIDENT',
            contextSha256: 'b'.repeat(64),
            classificationPolicyVersion: 'v2' as 'v1',
          },
        }),
      ).success,
    ).toBe(false);
  });
});

describe('CompetingExplanationHoleSchema', () => {
  it('projects the deterministic hole reference surface', () => {
    const hole = {
      graphHoleId: HOLE_ID,
      holeType: 'MISSING_EDGE',
      expectedRelationshipType: 'communication',
    };
    expect(CompetingExplanationHoleSchema.safeParse(hole).success).toBe(true);
    expect(
      CompetingExplanationHoleSchema.safeParse({ ...hole, graphHoleId: '' }).success,
    ).toBe(false);
    expect(CompetingExplanationHoleSchema.safeParse({ ...hole, extra: 1 as never }).success).toBe(false);
  });
});