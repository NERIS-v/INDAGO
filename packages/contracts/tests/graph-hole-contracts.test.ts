import { describe, it, expect } from 'vitest';
import {
  GraphHoleSchema,
  GraphHoleTypeSchema,
  GraphHoleCandidateIdSchema,
  RegionIdentityV1Schema,
  canonicalizeRegionIdentity,
  GraphHoleCandidateIdentityV1Schema,
  canonicalizeGraphHoleCandidateIdentity,
  StructuralScoreProfileSchema,
  GraphHoleCandidateAnalysisSchema,
  canonicalizeDeterministic,
  GraphHoleDetectedEventSchema,
  GraphEventSchema,
  GapClassificationResultSchema,
  GapClassificationTypeSchema,
} from '../src/index.js';

// ============================================================================
// Graph-Hole Contracts (Phase 5A-PR0)
//
// Verifies the GraphHole identity fields, region/candidate identity contracts,
// deterministic canonicalization, the GraphHoleDetected event payload, and the
// tightened gap-classification result.
// ============================================================================

const CASE_ID = '550e8400-e29b-41d4-a716-446655440000';
const INVESTIGATION_ID = '550e8400-e29b-41d4-a716-446655440001';
const GRAPH_VERSION_ID = '550e8400-e29b-41d4-a716-446655440002';
const NODE_A = '550e8400-e29b-41d4-a716-446655440003';
const NODE_B = '550e8400-e29b-41d4-a716-446655440004';
const EDGE_A = '550e8400-e29b-41d4-a716-446655440005';
const EDGE_B = '550e8400-e29b-41d4-a716-446655440006';
const OBS_A = '550e8400-e29b-41d4-a716-446655440007';
const OBS_B = '550e8400-e29b-41d4-a716-446655440008';
const GAP_ID = '550e8400-e29b-41d4-a716-446655440009';
const EVENT_ID = '550e8400-e29b-41d4-a716-44665544000a';
const CORRELATION_ID = '550e8400-e29b-41d4-a716-44665544000b';
const OPERATION_ID = '550e8400-e29b-41d4-a716-44665544000c';
const ENTITY_ID = '550e8400-e29b-41d4-a716-44665544000d';
const HYPOTHESIS_ID = '550e8400-e29b-41d4-a716-44665544000e';

const OBSERVED_AT = { value: '2024-07-01T00:00:00.000Z', precision: 'exact' } as const;

const validHole = {
  id: 'cand-123',
  investigationId: INVESTIGATION_ID,
  caseId: CASE_ID,
  graphVersionId: GRAPH_VERSION_ID,
  type: 'MISSING_EDGE',
  investigationGapId: GAP_ID,
  nodeIds: [NODE_A, NODE_B],
  expectedEdgeType: 'communication',
  significance: 0.8,
  description: 'No edge documents the response to the request.',
  suggestedEvidenceTypes: ['federal response letter'],
  detectionPolicyVersion: 'v1',
  detectedAt: OBSERVED_AT,
} as const;

describe('GraphHole candidate identity contract', () => {
  it('accepts a hole with explicit identity fields', () => {
    expect(GraphHoleSchema.safeParse(validHole).success).toBe(true);
  });

  it('parses a hole without detectionPolicyVersion (compat data)', () => {
    const { detectionPolicyVersion: _dropped, ...withoutVersion } = validHole;
    const result = GraphHoleSchema.safeParse(withoutVersion);
    expect(result.success).toBe(true);
  });

  it('rejects a hole missing the candidate id', () => {
    const { id: _dropped, ...noId } = validHole;
    expect(GraphHoleSchema.safeParse(noId).success).toBe(false);
  });

  it('rejects a hole missing caseId', () => {
    const { caseId: _dropped, ...noCase } = validHole;
    expect(GraphHoleSchema.safeParse(noCase).success).toBe(false);
  });

  it('rejects an invalid detectionPolicyVersion', () => {
    expect(
      GraphHoleSchema.safeParse({ ...validHole, detectionPolicyVersion: 'v2' }).success,
    ).toBe(false);
  });

  it('rejects an invalid hole type', () => {
    expect(GraphHoleSchema.safeParse({ ...validHole, type: 'PROBABLE_CRIMINAL_LINK' }).success)
      .toBe(false);
  });

  it('rejects an out-of-range structural significance', () => {
    expect(GraphHoleSchema.safeParse({ ...validHole, significance: 1.5 }).success).toBe(false);
    expect(GraphHoleSchema.safeParse({ ...validHole, significance: -0.1 }).success).toBe(false);
  });

  it('rejects an invalid graphVersionId', () => {
    expect(GraphHoleSchema.safeParse({ ...validHole, graphVersionId: 'not-a-uuid' }).success)
      .toBe(false);
  });

  it('rejects an invalid node list', () => {
    expect(GraphHoleSchema.safeParse({ ...validHole, nodeIds: [NODE_A, 'not-a-uuid'] }).success)
      .toBe(false);
  });

  it('rejects unknown extra fields (strict mode)', () => {
    expect(GraphHoleSchema.safeParse({ ...validHole, isCriminal: true }).success).toBe(false);
  });

  it('accepts all six structural hole types', () => {
    const types = Object.values(GraphHoleTypeSchema.enum);
    expect(types).toEqual([
      'MISSING_EDGE',
      'MISSING_PATH',
      'ISOLATED_NODE',
      'BROKEN_CHAIN',
      'TEMPORAL_GAP',
      'COMMUNITY_BOUNDARY',
    ]);
  });
});

describe('GraphHoleCandidateIdSchema', () => {
  it('accepts a deterministic digest-shaped id', () => {
    const hexDigest = 'a'.repeat(64);
    expect(GraphHoleCandidateIdSchema.safeParse(hexDigest).success).toBe(true);
  });

  it('rejects an empty id', () => {
    expect(GraphHoleCandidateIdSchema.safeParse('').success).toBe(false);
  });
});

describe('RegionIdentityV1', () => {
  const regionIdentity = {
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    temporalContext: {
      validFrom: { value: '1976-01-01', precision: 'day' },
      validTo: { value: '1982-12-31', precision: 'day' },
      precision: 'day',
      semantics: 'inferred',
    },
    seedObservationIds: [OBS_A, OBS_B],
    nodeIds: [NODE_A, NODE_B],
    edgeIds: [EDGE_A, EDGE_B],
    regionPolicyVersion: 'v1',
    semanticRetrievalPolicyVersion: 'v1',
  } as const;

  it('accepts a valid region identity with version literals', () => {
    expect(RegionIdentityV1Schema.safeParse(regionIdentity).success).toBe(true);
  });

  it('rejects a region identity missing caseId', () => {
    const { caseId: _dropped, ...noCase } = regionIdentity;
    expect(RegionIdentityV1Schema.safeParse(noCase).success).toBe(false);
  });

  it('rejects a region identity missing edgeIds', () => {
    const { edgeIds: _dropped, ...noEdges } = regionIdentity;
    expect(RegionIdentityV1Schema.safeParse(noEdges).success).toBe(false);
  });

  it('locks the region policy version literal', () => {
    expect(
      RegionIdentityV1Schema.safeParse({ ...regionIdentity, regionPolicyVersion: 'v2' }).success,
    ).toBe(false);
  });

  it('returns the same canonical string regardless of list ordering', () => {
    const ordered = canonicalizeRegionIdentity(regionIdentity);
    const shuffled = canonicalizeRegionIdentity({
      ...regionIdentity,
      nodeIds: [NODE_B, NODE_A],
      edgeIds: [EDGE_B, EDGE_A],
      seedObservationIds: [OBS_B, OBS_A],
    });
    expect(ordered).toBe(shuffled);
  });

  it('returns a different canonical string for a different graph version', () => {
    const a = canonicalizeRegionIdentity(regionIdentity);
    const b = canonicalizeRegionIdentity({
      ...regionIdentity,
      graphVersionId: '550e8400-e29b-41d4-a716-4466554400ff',
    });
    expect(a).not.toBe(b);
  });
});

describe('GraphHoleCandidateIdentityV1', () => {
  const candidateIdentity = {
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    holeType: 'MISSING_EDGE',
    canonicalNodeIds: [NODE_A, NODE_B],
    expectedRelationshipType: 'communication',
    detectionPolicyVersion: 'v1',
  } as const;

  it('accepts a valid candidate identity', () => {
    expect(GraphHoleCandidateIdentityV1Schema.safeParse(candidateIdentity).success).toBe(true);
  });

  it('rejects a candidate identity with an empty canonical node set', () => {
    expect(
      GraphHoleCandidateIdentityV1Schema.safeParse({
        ...candidateIdentity,
        canonicalNodeIds: [],
      }).success,
    ).toBe(false);
  });

  it('locks the detection policy version literal', () => {
    expect(
      GraphHoleCandidateIdentityV1Schema.safeParse({
        ...candidateIdentity,
        detectionPolicyVersion: 'v2',
      }).success,
    ).toBe(false);
  });

  it('collapses identical logical gaps to the same canonical identity', () => {
    const ordered = canonicalizeGraphHoleCandidateIdentity(candidateIdentity);
    const shuffled = canonicalizeGraphHoleCandidateIdentity({
      ...candidateIdentity,
      canonicalNodeIds: [NODE_B, NODE_A],
    });
    expect(ordered).toBe(shuffled);
  });

  it('distinguishes gaps of different holeType', () => {
    const edge = canonicalizeGraphHoleCandidateIdentity(candidateIdentity);
    const temporalGap = canonicalizeGraphHoleCandidateIdentity({
      ...candidateIdentity,
      holeType: 'TEMPORAL_GAP',
    });
    expect(edge).not.toBe(temporalGap);
  });
});

describe('canonicalizeDeterministic', () => {
  it('is stable across object key insertion order', () => {
    const a = canonicalizeDeterministic({ b: 1, a: ['b', 'a'], c: { y: 0, x: 1 } });
    const b = canonicalizeDeterministic({ c: { x: 1, y: 0 }, a: ['a', 'b'], b: 1 });
    expect(a).toBe(b);
  });

  it('does not reorder non-string arrays (only identity arrays are sorted)', () => {
    expect(canonicalizeDeterministic([2, 1])).toBe('[2,1]');
  });

  it('is stable across string-array element order', () => {
    expect(canonicalizeDeterministic(['b', 'a', 'c'])).toBe(
      canonicalizeDeterministic(['c', 'a', 'b']),
    );
  });
});

describe('GraphHoleCandidateAnalysisSchema', () => {
  const analysis = {
    candidateId: 'cand-123',
    regionCanonicalIdentity: canonicalizeRegionIdentity({
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      seedObservationIds: [OBS_A],
      nodeIds: [NODE_A, NODE_B],
      edgeIds: [EDGE_A, EDGE_B],
      regionPolicyVersion: 'v1',
      semanticRetrievalPolicyVersion: 'v1',
    }),
    regionStatus: 'SATURATED',
    independentSupportUnits: 2,
    resolvedSupportUnitKeys: ['sourceContext:ctx-1', 'artifact:art-1'],
    supportUnitResolutions: [
      { key: 'sourceContext:ctx-1', basis: 'sourceContextId' },
      { key: 'artifact:art-1', basis: 'artifactId' },
    ],
    structuralComponents: {
      patternStrength: 0.9,
      connectivitySupport: 0.7,
    },
    structuralScore: 0.83,
    evidenceSupportScore: 0.75,
    expectedInformationValue: 0.6,
    significance: 0.78,
    detectionPolicyVersion: 'v1',
  } as const;

  it('accepts a valid candidate analysis', () => {
    expect(GraphHoleCandidateAnalysisSchema.safeParse(analysis).success).toBe(true);
  });

  it('accepts resolved support units without resolutions and vice versa', () => {
    expect(
      GraphHoleCandidateAnalysisSchema.safeParse({
        ...analysis,
        supportUnitResolutions: undefined,
      }).success,
    ).toBe(true);
    expect(
      GraphHoleCandidateAnalysisSchema.safeParse({
        ...analysis,
        resolvedSupportUnitKeys: undefined,
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed support-unit resolution record', () => {
    expect(
      GraphHoleCandidateAnalysisSchema.safeParse({
        ...analysis,
        supportUnitResolutions: [{ key: 'sourceContext:x', basis: 'unknown' }],
      }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range structural score', () => {
    expect(GraphHoleCandidateAnalysisSchema.safeParse({ ...analysis, structuralScore: 1.25 }).success)
      .toBe(false);
  });

  it('accepts a structural profile with absent components (not applicable)', () => {
    expect(
      StructuralScoreProfileSchema.safeParse({ patternStrength: 0.9 }).success,
    ).toBe(true);
  });

  it('accepts an explicit zero-evidence component distinct from absent', () => {
    expect(
      StructuralScoreProfileSchema.safeParse({ patternStrength: 0, connectivitySupport: 0.5 })
        .success,
    ).toBe(true);
  });
});

describe('GraphHoleDetected event payload', () => {
  const event = {
    eventId: EVENT_ID,
    version: 1,
    timestamp: OBSERVED_AT,
    investigationId: INVESTIGATION_ID,
    correlationId: CORRELATION_ID,
    operationId: OPERATION_ID,
    actor: 'graph-hole-detection',
    eventType: 'GRAPH_HOLE_DETECTED',
    payload: {
      holeId: 'cand-123',
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      holeType: 'MISSING_EDGE',
      investigationGapId: GAP_ID,
      nodeIds: [NODE_A, NODE_B],
      expectedEdgeType: 'communication',
      significance: 0.8,
      description: 'No edge documents the response to the request.',
    },
  } as const;

  it('accepts an event with candidate identity in the payload', () => {
    expect(GraphHoleDetectedEventSchema.safeParse(event).success).toBe(true);
  });

  it('resolves through the discriminated graph event union', () => {
    const parsed = GraphEventSchema.safeParse(event);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.eventType).toBe('GRAPH_HOLE_DETECTED');
    }
  });

  it('rejects a payload missing the hole id', () => {
    const { holeId: _dropped, ...noHoleId } = event.payload;
    expect(GraphHoleDetectedEventSchema.safeParse({ ...event, payload: noHoleId }).success)
      .toBe(false);
  });

  it('rejects an invalid holeType in the payload', () => {
    expect(
      GraphHoleDetectedEventSchema.safeParse({
        ...event,
        payload: { ...event.payload, holeType: 'CULPABILITY' },
      }).success,
    ).toBe(false);
  });
});

describe('GapClassificationResult tightening', () => {
  const result = {
    gapId: GAP_ID,
    type: 'MISSING_INVESTIGATION',
    priority: 'HIGH',
    impact: 0.6,
    expectedInformationValue: 0.7,
    relatedEntityIds: [ENTITY_ID],
    relatedHypothesisIds: [HYPOTHESIS_ID],
    suggestedActions: ['request federal response letter'],
    computedAt: OBSERVED_AT,
  } as const;

  it('accepts a valid Phase 5 classification result', () => {
    expect(GapClassificationResultSchema.safeParse(result).success).toBe(true);
  });

  it('rejects an untyped / bare-string classification', () => {
    expect(GapClassificationResultSchema.safeParse({ ...result, type: 'just-some-gap' }).success)
      .toBe(false);
  });

  it('recognizes all five Phase 5 classification categories', () => {
    const types = Object.values(GapClassificationTypeSchema.enum);
    expect(types).toEqual([
      'MISSING_INVESTIGATION',
      'MISSING_DATA',
      'MISSING_COMPARISON',
      'INFRASTRUCTURE_GAP',
      'CONCEALMENT_CONSISTENT',
    ]);
  });

  it('rejects a non-enum priority', () => {
    expect(GapClassificationResultSchema.safeParse({ ...result, priority: 'URGENT' }).success)
      .toBe(false);
  });
});