import { describe, it, expect } from 'vitest';
import {
  RawGraphHoleCandidateSchema,
  StructuralBasisSchema,
  DetectorBoundKindSchema,
  GraphHoleDetectorMetadataSchema,
  GraphHoleTypeSchema,
} from '../src/index.js';

// ============================================================================
// Graph-Hole Detection Contracts (Phase 5A-PR4)
//
// Verifies the raw candidate output record: identity-derived candidateId,
// strict fields, the frozen structural-basis enum, and detector metadata
// (bounds accounting live here, distinct from region budget semantics).
// ============================================================================

const CASE_ID = '550e8400-e29b-41d4-a716-446655440000';
const GRAPH_VERSION_ID = '550e8400-e29b-41d4-a716-446655440002';
const REGION_ID = '550e8400-e29b-41d4-a716-44665544000a';
const NODE_A = '550e8400-e29b-41d4-a716-446655440003';
const NODE_B = '550e8400-e29b-41d4-a716-446655440004';
const EDGE_A = '550e8400-e29b-41d4-a716-446655440005';
const OBS_A = '550e8400-e29b-41d4-a716-446655440007';
const OBS_B = '550e8400-e29b-41d4-a716-446655440008';
const SOURCE_A = '550e8400-e29b-41d4-a716-44665544000c';

const validCandidate = {
  candidateId: 'a'.repeat(64),
  caseId: CASE_ID,
  graphVersionId: GRAPH_VERSION_ID,
  regionId: REGION_ID,
  detectionPolicyVersion: 'v1',
  detectorType: 'MISSING_EDGE',
  nodeIds: [NODE_A, NODE_B],
  observedEdgeIds: [EDGE_A],
  expectedRelationshipType: 'communication',
  supportingHypothesisIds: ['atomic:RELATION_HYPOTHESIS:550e8400-e29b-41d4-a716-44665544000b'],
  supportingObservationIds: [OBS_A],
  contradictingObservationIds: [OBS_B],
  structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT',
  detectorMetadata: {
    detectorType: 'MISSING_EDGE',
    pairEvaluations: 12,
    boundReached: false,
  },
  provenance: {
    sourceId: SOURCE_A,
    extractor: 'graph-hole-detection.v1',
    derivedFrom: [OBS_A],
  },
} as const;

describe('RawGraphHoleCandidateSchema', () => {
  it('accepts a valid raw candidate', () => {
    expect(RawGraphHoleCandidateSchema.safeParse(validCandidate).success).toBe(true);
  });

  it('rejects a candidate missing the deterministic candidateId', () => {
    const { candidateId: _dropped, ...noId } = validCandidate;
    expect(RawGraphHoleCandidateSchema.safeParse(noId).success).toBe(false);
  });

  it('rejects an unknown detectionPolicyVersion', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({ ...validCandidate, detectionPolicyVersion: 'v2' })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown detector type', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({ ...validCandidate, detectorType: 'PROBABLE_LINK' })
        .success,
    ).toBe(false);
  });

  it('accepts all six structural detector types', () => {
    const types = Object.values(GraphHoleTypeSchema.enum);
    expect(types).toEqual([
      'MISSING_EDGE',
      'MISSING_PATH',
      'ISOLATED_NODE',
      'BROKEN_CHAIN',
      'TEMPORAL_GAP',
      'COMMUNITY_BOUNDARY',
    ]);
    for (const type of types) {
      expect(
        RawGraphHoleCandidateSchema.safeParse({ ...validCandidate, detectorType: type }).success,
      ).toBe(true);
    }
  });

  it('accepts a null expectedRelationshipType (detector cannot state one)', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({
        ...validCandidate,
        expectedRelationshipType: null,
      }).success,
    ).toBe(true);
  });

  it('rejects an invented non-enum expected relationship type', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({
        ...validCandidate,
        expectedRelationshipType: 'loves',
      }).success,
    ).toBe(false);
  });

  it('rejects an empty canonical node set', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({ ...validCandidate, nodeIds: [] }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid node id', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({ ...validCandidate, nodeIds: [NODE_A, 'not-a-uuid'] })
        .success,
    ).toBe(false);
  });

  it('accepts empty probe arrays (no invented references)', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({
        ...validCandidate,
        observedEdgeIds: [],
        supportingHypothesisIds: [],
        supportingObservationIds: [],
        contradictingObservationIds: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a non-uuid supporting observation id', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({
        ...validCandidate,
        supportingObservationIds: ['just-an-id'],
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown structural basis', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({ ...validCandidate, structuralBasis: 'VIBES' }).success,
    ).toBe(false);
  });

  it('rejects unknown extra fields (strict mode)', () => {
    expect(RawGraphHoleCandidateSchema.safeParse({ ...validCandidate, isCriminal: true }).success)
      .toBe(false);
    expect(
      RawGraphHoleCandidateSchema.safeParse({ ...validCandidate, significance: 0.9 }).success,
    ).toBe(false);
  });

  it('rejects a provenance-less candidate', () => {
    const { provenance: _dropped, ...noProvenance } = validCandidate;
    expect(RawGraphHoleCandidateSchema.safeParse(noProvenance).success).toBe(false);
  });

  it('accepts an optional temporalScope', () => {
    expect(
      RawGraphHoleCandidateSchema.safeParse({
        ...validCandidate,
        temporalScope: {
          validFrom: { value: '2021-01-01T00:00:00.000Z', precision: 'exact' },
          precision: 'exact',
          semantics: 'inferred',
        },
      }).success,
    ).toBe(true);
  });
});

describe('StructuralBasisSchema', () => {
  it('freezes the closed set of expectation bases', () => {
    expect(Object.values(StructuralBasisSchema.enum)).toEqual([
      'SHARED_HYPOTHESIS_CONTEXT',
      'OBSERVED_NEIGHBOR_CONTEXT',
      'HYPOTHESIS_REFERENCED_NODE',
      'SEED_REFERENCED_NODE',
      'CHAIN_EXPECTED_CONTINUATION',
      'TEMPORAL_DISCONTINUITY',
      'CROSS_COMMUNITY_HYPOTHESIS_CONTEXT',
      'EXPECTED_PATH_BROKEN',
    ]);
  });
});

describe('GraphHoleDetectorMetadataSchema', () => {
  const valid = {
    detectorType: 'MISSING_EDGE',
    pairEvaluations: 0,
    boundReached: false,
  } as const;

  it('accepts a clean run', () => {
    expect(GraphHoleDetectorMetadataSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a bound-reached run with a named bound kind', () => {
    expect(
      GraphHoleDetectorMetadataSchema.safeParse({
        ...valid,
        boundReached: true,
        boundKind: 'PAIR_EVALUATIONS',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-integer pair evaluation count', () => {
    expect(GraphHoleDetectorMetadataSchema.safeParse({ ...valid, pairEvaluations: 1.5 }).success)
      .toBe(false);
  });

  it('rejects a negative pair evaluation count', () => {
    expect(GraphHoleDetectorMetadataSchema.safeParse({ ...valid, pairEvaluations: -1 }).success)
      .toBe(false);
  });

  it('rejects an unknown bound kind', () => {
    expect(
      GraphHoleDetectorMetadataSchema.safeParse({
        ...valid,
        boundReached: true,
        boundKind: 'NONE',
      }).success,
    ).toBe(false);
  });
});

describe('DetectorBoundKindSchema', () => {
  it('names only detector-local bounds', () => {
    expect(Object.values(DetectorBoundKindSchema.enum)).toEqual([
      'PAIR_EVALUATIONS',
      'TRAVERSAL_QUERIES',
      'CANDIDATES',
      'COMMUNITIES_ABSENT',
    ]);
  });
});