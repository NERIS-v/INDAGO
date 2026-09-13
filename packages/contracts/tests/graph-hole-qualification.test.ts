import { describe, it, expect } from 'vitest';
import {
  QualificationFailureReasonSchema,
  QUALIFICATION_FAILURE_REASONS,
  EvidenceSupportScoreComponentsSchema,
  ExpectedInformationValueComponentsSchema,
  ScoreComponentsSchema,
  QualifiedGraphHoleCandidateSchema,
  QualificationAccountingSchema,
  GraphHoleQualificationResultSchema,
} from '../src/index.js';

// ============================================================================
// Graph-Hole Qualification Contracts (Phase 5A-PR5)
//
// Verifies the PR5 output representation: the closed failure-reason enum, the
// deterministic score-component trace, the qualified-candidate record (which
// preserves the raw candidate INTACT), and the accounting/result envelopes.
// ============================================================================

const CASE_ID = '550e8400-e29b-41d4-a716-446655440000';
const GRAPH_VERSION_ID = '550e8400-e29b-41d4-a716-446655440002';
const REGION_ID = '550e8400-e29b-41d4-a716-44665544000a';
const NODE_A = '550e8400-e29b-41d4-a716-446655440003';
const NODE_B = '550e8400-e29b-41d4-a716-446655440004';
const SOURCE_A = '550e8400-e29b-41d4-a716-44665544000c';

const validRawCandidate = {
  candidateId: 'a'.repeat(64),
  caseId: CASE_ID,
  graphVersionId: GRAPH_VERSION_ID,
  regionId: REGION_ID,
  detectionPolicyVersion: 'v1',
  detectorType: 'MISSING_EDGE',
  nodeIds: [NODE_A, NODE_B],
  observedEdgeIds: [],
  expectedRelationshipType: 'communication',
  supportingHypothesisIds: ['atomic:RELATION_HYPOTHESIS:hh'],
  supportingObservationIds: ['550e8400-e29b-41d4-a716-44665544000e', '550e8400-e29b-41d4-a716-44665544000f'],
  contradictingObservationIds: [],
  structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT',
  detectorMetadata: {
    detectorType: 'MISSING_EDGE',
    pairEvaluations: 12,
    boundReached: false,
  },
  provenance: {
    sourceId: SOURCE_A,
    extractor: 'graph-hole-detection.v1',
  },
} as const;

const validQualifiedCandidate = {
  rawCandidate: validRawCandidate,
  qualified: true,
  failureReasons: [],
  structuralScore: 0.82,
  evidenceSupportScore: 0.6,
  expectedInformationValue: 0.44,
  significance: 0.73,
  independentSupportUnitIds: ['sourceContext:ctx-1', 'sourceContext:ctx-2'],
  structuralComponents: {
    patternStrength: 1.0,
    connectivitySupport: 0.666667,
    contextualSupport: 0.76,
  },
  scoreComponents: {
    evidenceSupport: { supportBreadth: 0.5, supportConsistency: 1, provenanceCompleteness: 1 },
    expectedInformationValue: { uncertaintyPotential: 0, hypothesisCoverage: 0.666667, evidenceDiversity: 0.5 },
  },
  rankingKey: '0.180000|0.270000|0.400000|0.560000|a'.repeat(64),
  regionStatus: 'SATURATED',
  scoringPolicyVersion: 'v2',
} as const;

describe('QualificationFailureReasonSchema', () => {
  it('is a closed enum with deterministic order', () => {
    expect(QualificationFailureReasonSchema.options).toEqual(QUALIFICATION_FAILURE_REASONS);
    expect(QUALIFICATION_FAILURE_REASONS).toEqual([
      'REGION_TRUNCATED',
      'REGION_NOT_SATURATED',
      'INSUFFICIENT_SUPPORT',
      'LOW_STRUCTURAL_SCORE',
      'LOW_SIGNIFICANCE',
      'TEMPORAL_INCONSISTENCY',
      'ALREADY_RESOLVED',
      'DUPLICATE',
      'MISSING_AUTHORITY',
    ]);
  });

  it('rejects unknown reasons (closed world)', () => {
    expect(QualificationFailureReasonSchema.safeParse('CRIMINAL_INTENT').success).toBe(false);
  });
});

describe('EvidenceSupportScoreComponentsSchema', () => {
  it('accepts components in [0,1]', () => {
    const parsed = EvidenceSupportScoreComponentsSchema.parse({
      supportBreadth: 0.5,
      supportConsistency: 1,
      provenanceCompleteness: 1,
    });
    expect(parsed.supportBreadth).toBe(0.5);
  });

  it('rejects out-of-range components', () => {
    expect(
      EvidenceSupportScoreComponentsSchema.safeParse({
        supportBreadth: 1.5,
        supportConsistency: 0.5,
        provenanceCompleteness: 0.2,
      }).success,
    ).toBe(false);
  });
});

describe('ExpectedInformationValueComponentsSchema', () => {
  it('accepts components in [0,1]', () => {
    const parsed = ExpectedInformationValueComponentsSchema.parse({
      uncertaintyPotential: 1,
      hypothesisCoverage: 0.666667,
      evidenceDiversity: 0.5,
    });
    expect(parsed.uncertaintyPotential).toBe(1);
  });

  it('rejects negative uncertaintyPotential', () => {
    expect(
      ExpectedInformationValueComponentsSchema.safeParse({
        uncertaintyPotential: -0.1,
        hypothesisCoverage: 0.5,
        evidenceDiversity: 0.5,
      }).success,
    ).toBe(false);
  });
});

describe('ScoreComponentsSchema', () => {
  it('is strict and nests both component traces', () => {
    const parsed = ScoreComponentsSchema.parse(validQualifiedCandidate.scoreComponents);
    expect(parsed.evidenceSupport.supportBreadth).toBe(0.5);
    expect(parsed.expectedInformationValue.evidenceDiversity).toBe(0.5);
  });

  it('rejects unknown extra keys', () => {
    const bad = { ...validQualifiedCandidate.scoreComponents, extra: 1 };
    expect(ScoreComponentsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('QualifiedGraphHoleCandidateSchema', () => {
  it('accepts a valid qualified candidate and preserves the raw candidate intact', () => {
    const parsed = QualifiedGraphHoleCandidateSchema.parse(validQualifiedCandidate);
    expect(parsed.rawCandidate).toEqual(validRawCandidate);
    expect(parsed.qualified).toBe(true);
    expect(parsed.significance).toBe(0.73);
  });

  it('rejects a significance outside [0,1]', () => {
    const bad = { ...validQualifiedCandidate, significance: 1.2 };
    expect(QualifiedGraphHoleCandidateSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a rejected candidate with closed failure reasons', () => {
    const rejected = {
      ...validQualifiedCandidate,
      qualified: false,
      failureReasons: ['INSUFFICIENT_SUPPORT', 'LOW_SIGNIFICANCE'],
    };
    const parsed = QualifiedGraphHoleCandidateSchema.parse(rejected);
    expect(parsed.failureReasons).toEqual(['INSUFFICIENT_SUPPORT', 'LOW_SIGNIFICANCE']);
  });

  it('rejects a candidate whose rankingKey is empty', () => {
    const bad = { ...validQualifiedCandidate, rankingKey: '' };
    expect(QualifiedGraphHoleCandidateSchema.safeParse(bad).success).toBe(false);
  });
});

describe('QualificationAccountingSchema', () => {
  it('accepts valid accounting', () => {
    const parsed = QualificationAccountingSchema.parse({
      totalInputCandidates: 3,
      qualifiedCount: 1,
      rejectedCount: 2,
      failureReasonCounts: [{ reason: 'DUPLICATE', count: 2 }],
      truncationRejections: 0,
      deduplicationRejections: 2,
    });
    expect(parsed.qualifiedCount + parsed.rejectedCount).toBe(3);
  });

  it('rejects negative counts', () => {
    const bad = {
      totalInputCandidates: 1,
      qualifiedCount: -1,
      rejectedCount: 2,
      failureReasonCounts: [],
      truncationRejections: 0,
      deduplicationRejections: 0,
    };
    expect(QualificationAccountingSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown failure reasons in accounting', () => {
    const bad = {
      totalInputCandidates: 1,
      qualifiedCount: 1,
      rejectedCount: 0,
      failureReasonCounts: [{ reason: 'CRIMINAL_INTENT', count: 1 }],
      truncationRejections: 0,
      deduplicationRejections: 0,
    };
    expect(QualificationAccountingSchema.safeParse(bad).success).toBe(false);
  });
});

describe('GraphHoleQualificationResultSchema', () => {
  it('accepts a complete result envelope', () => {
    const result = {
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      candidates: [validQualifiedCandidate],
      qualifiedCandidates: [validQualifiedCandidate],
      rejectedCandidates: [],
      accounting: {
        totalInputCandidates: 1,
        qualifiedCount: 1,
        rejectedCount: 0,
        failureReasonCounts: [],
        truncationRejections: 0,
        deduplicationRejections: 0,
      },
      detectionPolicyVersion: 'v1',
      scoringPolicyVersion: 'v2',
    };
    const parsed = GraphHoleQualificationResultSchema.parse(result);
    expect(parsed.candidates).toHaveLength(1);
    expect(parsed.scoringPolicyVersion).toBe('v2');
  });

  it('rejects a result whose scoring policy version deviates from the frozen literal', () => {
    const bad = {
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      candidates: [],
      qualifiedCandidates: [],
      rejectedCandidates: [],
      accounting: {
        totalInputCandidates: 0,
        qualifiedCount: 0,
        rejectedCount: 0,
        failureReasonCounts: [],
        truncationRejections: 0,
        deduplicationRejections: 0,
      },
      detectionPolicyVersion: 'v1',
      scoringPolicyVersion: 'v9-imaginary',
    };
    expect(GraphHoleQualificationResultSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a result that loses candidates (accounting mismatch is not validated, but shape is strict)', () => {
    const bad = {
      caseId: CASE_ID,
      graphVersionId: GRAPH_VERSION_ID,
      candidates: [validQualifiedCandidate, validQualifiedCandidate],
      qualifiedCandidates: [validQualifiedCandidate],
      rejectedCandidates: [],
      accounting: {
        totalInputCandidates: 2,
        qualifiedCount: 2,
        rejectedCount: 0,
        failureReasonCounts: [],
        truncationRejections: 0,
        deduplicationRejections: 0,
      },
      detectionPolicyVersion: 'v2-imaginary',
    };
    // detectionPolicyVersion is literally frozen; a deviating version is rejected.
    expect(GraphHoleQualificationResultSchema.safeParse(bad).success).toBe(false);
  });
});