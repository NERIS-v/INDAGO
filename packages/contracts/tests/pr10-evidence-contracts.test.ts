import { describe, it, expect } from 'vitest';
import {
  EvidenceTypeSchema,
  EvidenceTypeVocabularySchema,
  EVIDENCE_TYPE_VOCABULARY_V1,
  EVIDENCE_TYPE_VOCABULARY_VERSION,
  EvidenceUtilitySchema,
  EvidenceRequestSchema,
  EVIDENCE_UTILITY_POLICY_V1,
  EVIDENCE_UTILITY_POLICY_VERSION,
  EvidenceUtilityPolicyV1Schema,
  EVIDENCE_UTILITY_WEIGHTS,
  EVIDENCE_UTILITY_COMPONENTS,
  NEXT_BEST_EVIDENCE_POLICY_V1,
  NEXT_BEST_EVIDENCE_POLICY_VERSION,
  NextBestEvidenceSelectionBoundsSchema,
  MAX_EVIDENCE_REQUESTS_PER_GAP,
  MAX_GAPS_PER_SELECTION_RUN,
  MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP,
  canonicalizeNextBestEvidenceRequest,
  NextBestEvidenceCandidateSchema,
  NextBestEvidenceSelectionResultSchema,
  GRAPH_HOLE_SCORING_POLICY_VERSION,
  GraphHoleSchema,
} from '../src/index.js';

// ============================================================================
// PR10 Evidence contracts — Contract Freeze (Contract + Policy ONLY)
//
// Covers: F1 vocabulary · F2 utility policy + composition · EIG naming ·
// F3 discrimination target (contracts-level) · F4 bounds · F5 selection result
// ============================================================================

const GAP_ID = '550e8400-e29b-41d4-a716-446655440009';
const INVESTIGATION_ID = '550e8400-e29b-41d4-a716-446655440001';
const H1 = '550e8400-e29b-41d4-a716-44665544000e';
const H2 = '550e8400-e29b-41d4-a716-44665544000f';
const H3 = '550e8400-e29b-41d4-a716-446655440010';

const OBSERVED_AT = { value: '2024-07-01T00:00:00.000Z', precision: 'exact' } as const;

function validUtility() {
  return {
    expectedInformationGain: 0.7,
    eig: 0.7,
    relevance: 0.85,
    feasibility: 0.6,
    cost: 0.3,
    score: 0.72,
  } as const;
}

function validCandidate() {
  return {
    canonicalRequestKey: canonicalizeNextBestEvidenceRequest({
      gapId: GAP_ID,
      evidenceType: 'RECORD',
      discriminatesAmongIds: [H1, H2],
      hypothesisIds: [H1, H2],
    }),
    gapId: GAP_ID,
    hypothesisIds: [H1, H2],
    evidenceType: 'RECORD',
    discriminatesAmongIds: [H1, H2],
    utility: validUtility(),
    rationale: 'Direct records would confirm or rule out the expected contact.',
  } as const;
}

// ============================================================================
// F1 — Evidence-Type Vocabulary
// ============================================================================

describe('F1 evidence-type vocabulary', () => {
  it('freezes the canonical 8-value vocabulary reference (no second competing enum)', () => {
    expect(EVIDENCE_TYPE_VOCABULARY_VERSION).toBe('v1');
    expect(EVIDENCE_TYPE_VOCABULARY_V1.version).toBe('v1');
    expect(EVIDENCE_TYPE_VOCABULARY_V1.evidenceTypes).toEqual(Object.values(EvidenceTypeSchema.enum));
    expect(EVIDENCE_TYPE_VOCABULARY_V1.evidenceTypes).toHaveLength(8);
  });

  it('policy record parses against its schema', () => {
    expect(EvidenceTypeVocabularySchema.safeParse(EVIDENCE_TYPE_VOCABULARY_V1).success).toBe(true);
  });

  it('canonical enum accepts canonical values and rejects unknowns', () => {
    for (const t of Object.values(EvidenceTypeSchema.enum)) {
      expect(EvidenceTypeSchema.safeParse(t).success).toBe(true);
    }
    expect(EvidenceTypeSchema.safeParse('federal response letter').success).toBe(false);
    expect(EvidenceTypeSchema.safeParse('INVALID_TYPE').success).toBe(false);
  });

  it('EvidenceRequestSchema.evidenceType uses the canonical vocabulary', () => {
    expect(EvidenceRequestSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440020',
      gapId: GAP_ID,
      hypothesisIds: [H1],
      evidenceType: 'RECORD' as const,
      description: 'Request the employment records.',
      utility: validUtility(),
      rationale: 'Would discriminate between competing explanations.',
      status: 'DRAFT',
      resultingEvidenceIds: [],
      createdBy: 'claude-2.1',
      createdAt: OBSERVED_AT,
      updatedAt: OBSERVED_AT,
    }).success).toBe(true);
    // free-form descriptive subtype is NOT an evidence type
    expect(EvidenceRequestSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440021',
      gapId: GAP_ID,
      hypothesisIds: [H1],
      evidenceType: 'federal response letter',
      description: 'Request',
      utility: validUtility(),
      rationale: 'r',
      status: 'DRAFT',
      resultingEvidenceIds: [],
      createdBy: 'claude-2.1',
      createdAt: OBSERVED_AT,
      updatedAt: OBSERVED_AT,
    }).success).toBe(false);
  });

  it('GraphHoleSchema.suggestedEvidenceTypes uses the canonical vocabulary', () => {
    const hole = {
      id: 'cand-123',
      investigationId: INVESTIGATION_ID,
      caseId: '550e8400-e29b-41d4-a716-446655440000',
      graphVersionId: '550e8400-e29b-41d4-a716-446655440002',
      type: 'MISSING_EDGE',
      nodeIds: ['550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440004'],
      expectedEdgeType: 'communication',
      significance: 0.8,
      description: 'No edge documents the response to the request.',
      suggestedEvidenceTypes: ['RECORD'],
      detectionPolicyVersion: 'v1',
      detectedAt: OBSERVED_AT,
    } as const;
    expect(GraphHoleSchema.safeParse(hole).success).toBe(true);
    expect(GraphHoleSchema.safeParse({ ...hole, suggestedEvidenceTypes: ['federal response letter'] }).success)
      .toBe(false);
  });
});

// ============================================================================
// F2 — Utility fields & composition policy
// ============================================================================

describe('F2 utility fields', () => {
  it('rejects normalized components below 0', () => {
    for (const field of ['expectedInformationGain', 'eig', 'relevance', 'feasibility', 'cost', 'score'] as const) {
      expect(EvidenceUtilitySchema.safeParse({ ...validUtility(), [field]: -0.1 }).success).toBe(false);
    }
  });

  it('rejects normalized components above 1', () => {
    for (const field of ['expectedInformationGain', 'eig', 'relevance', 'feasibility', 'cost', 'score'] as const) {
      expect(EvidenceUtilitySchema.safeParse({ ...validUtility(), [field]: 1.1 }).success).toBe(false);
    }
  });

  it('accepts a valid utility record', () => {
    expect(EvidenceUtilitySchema.safeParse(validUtility()).success).toBe(true);
  });

  it('rejects a divergent eig alias (expectedInformationGain !== eig)', () => {
    expect(
      EvidenceUtilitySchema.safeParse({ ...validUtility(), eig: 0.8 }).success,
    ).toBe(false);
  });
});

describe('F2 utility policy (EVIDENCE_UTILITY_POLICY_V1)', () => {
  it('has a policy version', () => {
    expect(EVIDENCE_UTILITY_POLICY_VERSION).toBe('v1');
    expect(EVIDENCE_UTILITY_POLICY_V1.version).toBe('v1');
  });

  it('weights sum to exactly 1.0', () => {
    const sum = Object.values(EVIDENCE_UTILITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-12);
    expect(sum).toBe(1);
  });

  it('policy shape is stable (frozen instance parses, rank order complete)', () => {
    const parsed = EvidenceUtilityPolicyV1Schema.safeParse(EVIDENCE_UTILITY_POLICY_V1);
    expect(parsed.success).toBe(true);
    expect(EVIDENCE_UTILITY_POLICY_V1.rankOrder).toHaveLength(5);
    expect(EVIDENCE_UTILITY_POLICY_V1.components).toHaveLength(4);
  });

  it('cost inversion is explicit (effectiveCost = 1 - cost; higher cost lowers utility)', () => {
    expect(EVIDENCE_UTILITY_POLICY_V1.costInversion).toBe('effectiveCost = 1 - cost');
    expect(EVIDENCE_UTILITY_POLICY_V1.semantics.cost).toBe('HIGHER_COST_MORE_BURDEN');
    expect(EVIDENCE_UTILITY_POLICY_V1.weights.effectiveCost).toBeGreaterThan(0);
  });

  it('has explicit feasibility / relevance / EIG semantics', () => {
    expect(EVIDENCE_UTILITY_POLICY_V1.semantics.feasibility).toBe('HIGHER_FEASIBILITY_EASIER_WITHIN_SCOPE');
    expect(EVIDENCE_UTILITY_POLICY_V1.semantics.relevance).toBe('HIGHER_RELEVANCE_STRONGER_DIRECT_LINK');
    expect(EVIDENCE_UTILITY_POLICY_V1.semantics.expectedInformationGain)
      .toBe('HIGHER_EIG_GREATER_DISCRIMINATION_AMONG_BOUNDED_EXPLANATIONS');
  });

  it('has no silent lambda semantics (lambda is not a policy component/weight)', () => {
    expect(EVIDENCE_UTILITY_COMPONENTS).not.toContain('lambda');
    expect(EVIDENCE_UTILITY_WEIGHTS).not.toHaveProperty('lambda');
    expect(EVIDENCE_UTILITY_POLICY_V1.weights).not.toHaveProperty('lambda');
  });
});

// ============================================================================
// Naming — expectedInformationGain canonical; PR5 expectedInformationValue distinct
// ============================================================================

describe('EIG naming', () => {
  it('expectedInformationGain is the canonical request-level field', () => {
    const innerShape = EvidenceUtilitySchema.innerType().shape;
    expect(Object.keys(innerShape)).toContain('expectedInformationGain');
    // expectedInformationGain is required: a utility with only the alias fails
    const { expectedInformationGain: _dropped, ...aliasOnly } = validUtility();
    expect(EvidenceUtilitySchema.safeParse(aliasOnly).success).toBe(false);
  });

  it('EvidenceRequest utility does NOT carry expectedInformationValue', () => {
    const keys = Object.keys(EvidenceUtilitySchema.innerType().shape);
    expect(keys).not.toContain('expectedInformationValue');
    // strict schema rejects the PR5-scoring-only field on a request
    expect(
      EvidenceUtilitySchema.safeParse({ ...validUtility(), expectedInformationValue: 0.9 }).success,
    ).toBe(false);
  });

  it('PR5 expectedInformationValue policy is untouched and distinct', () => {
    // PR5 scoring policy still 'v2', PR10 utility policy 'v1' — separate versions.
    expect(GRAPH_HOLE_SCORING_POLICY_VERSION).toBe('v2');
    expect(EVIDENCE_UTILITY_POLICY_VERSION).toBe('v1');
    expect(GRAPH_HOLE_SCORING_POLICY_VERSION).not.toBe(EVIDENCE_UTILITY_POLICY_VERSION);
  });
});

// ============================================================================
// F3 — Discrimination target (contracts level)
// ============================================================================

describe('F3 discrimination target', () => {
  it('NextBestEvidenceCandidate.discriminatesAmongIds is ID-based (hypothesis UUIDs)', () => {
    const ok = NextBestEvidenceCandidateSchema.safeParse(validCandidate());
    expect(ok.success).toBe(true);
  });

  it('rejects non-ID discrimination targets', () => {
    expect(
      NextBestEvidenceCandidateSchema.safeParse({
        ...validCandidate(),
        discriminatesAmongIds: ['the competing explanation about the ledger entry'],
      }).success,
    ).toBe(false);
  });

  it('canonical request identity is deterministic and order-independent', () => {
    const base = { gapId: GAP_ID, evidenceType: 'RECORD' as const, discriminatesAmongIds: [H1, H2] };
    const keyA = canonicalizeNextBestEvidenceRequest(base);
    const keyB = canonicalizeNextBestEvidenceRequest({
      gapId: GAP_ID,
      evidenceType: 'RECORD',
      discriminatesAmongIds: [H2, H1],
    });
    expect(keyA).toBe(keyB);
    // duplicate references collapse deterministically
    expect(canonicalizeNextBestEvidenceRequest({
      gapId: GAP_ID,
      evidenceType: 'RECORD',
      discriminatesAmongIds: [H1, H2, H1],
    })).toBe(keyA);
    // a different evidence type is a different request
    expect(canonicalizeNextBestEvidenceRequest({
      gapId: GAP_ID,
      evidenceType: 'DOCUMENT',
      discriminatesAmongIds: [H1, H2],
    })).not.toBe(keyA);
  });
});

// ============================================================================
// F4 — Selection bounds
// ============================================================================

describe('F4 selection bounds policy', () => {
  it('freezes the expected maxima', () => {
    expect(MAX_EVIDENCE_REQUESTS_PER_GAP).toBe(5);
    expect(MAX_GAPS_PER_SELECTION_RUN).toBe(10);
    expect(MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP).toBe(25);
  });

  it('has a policy version and parses its schema', () => {
    expect(NEXT_BEST_EVIDENCE_POLICY_VERSION).toBe('v1');
    expect(NEXT_BEST_EVIDENCE_POLICY_V1.version).toBe('v1');
    expect(NextBestEvidenceSelectionBoundsSchema.safeParse(NEXT_BEST_EVIDENCE_POLICY_V1).success).toBe(true);
  });

  it('rejects invalid (non-positive) bounds', () => {
    expect(NextBestEvidenceCandidateSchema).toBeDefined(); // sanity
    const schema = NextBestEvidenceSelectionBoundsSchema;
    expect(schema.safeParse({ ...NEXT_BEST_EVIDENCE_POLICY_V1, maxEvidenceRequestsPerGap: 0 }).success)
      .toBe(false);
    expect(schema.safeParse({ ...NEXT_BEST_EVIDENCE_POLICY_V1, maxGapsPerSelectionRun: -1 }).success)
      .toBe(false);
  });

  it('dedup identity uses canonical inputs, not description text', () => {
    expect(NEXT_BEST_EVIDENCE_POLICY_V1.deduplicationRule).toBe('CANONICAL_EVIDENCE_REQUEST_IDENTITY');
    expect(NEXT_BEST_EVIDENCE_POLICY_V1.dedupIdentityInputs).toEqual(
      ['gapId', 'evidenceType', 'discriminatesAmongIds', 'hypothesisIds'],
    );
  });
});

// ============================================================================
// F5 — Selection result
// ============================================================================

function validSelection() {
  return {
    investigationId: INVESTIGATION_ID,
    selections: [{
      gapId: GAP_ID,
      rankedRequests: [{ rank: 1, candidateRequest: validCandidate() }],
      consideredCount: 3,
      truncated: false,
    }],
    boundsPolicyVersion: 'v1',
    utilityPolicyVersion: 'v1',
    computedAt: OBSERVED_AT,
  } as const;
}

describe('F5 next-best-evidence selection result', () => {
  it('parses a valid ranked selection result', () => {
    expect(NextBestEvidenceSelectionResultSchema.safeParse(validSelection()).success).toBe(true);
  });

  it('carries the policy versions and deterministic ranked structure', () => {
    const parsed = NextBestEvidenceSelectionResultSchema.parse(validSelection());
    expect(parsed.boundsPolicyVersion).toBe('v1');
    expect(parsed.utilityPolicyVersion).toBe('v1');
    expect(parsed.selections[0]!.rankedRequests[0]!.rank).toBe(1);
    expect(parsed.selections[0]!.rankedRequests[0]!.candidateRequest.canonicalRequestKey.length).toBeGreaterThan(0);
  });

  it('does NOT imply acquisition or authorization', () => {
    const entryKeys = Object.keys(NextBestEvidenceSelectionResultSchema.shape.selections.element.shape.rankedRequests.element.shape);
    expect(entryKeys).toEqual(['rank', 'candidateRequest']);
    const candidateKeys = Object.keys(
      NextBestEvidenceSelectionResultSchema.shape.selections.element.shape.rankedRequests.element.shape.candidateRequest.shape,
    );
    expect(candidateKeys).not.toContain('authorization');
    expect(candidateKeys).not.toContain('acquired');
    expect(candidateKeys).not.toContain('status');
  });

  it('enforces the per-gap ranking bound', () => {
    const many = Array.from({ length: MAX_EVIDENCE_REQUESTS_PER_GAP + 1 }, (_, i) => ({
      rank: i + 1,
      candidateRequest: { ...validCandidate(), canonicalRequestKey: `k-${i}` },
    }));
    expect(
      NextBestEvidenceSelectionResultSchema.safeParse({
        ...validSelection(),
        selections: [{ gapId: GAP_ID, rankedRequests: many, consideredCount: many.length, truncated: true }],
      }).success,
    ).toBe(false);
  });

  it('enforces the per-run gap bound', () => {
    const gaps = Array.from({ length: MAX_GAPS_PER_SELECTION_RUN + 1 }, (_, i) => ({
      gapId: GAP_ID,
      rankedRequests: [{ rank: 1, candidateRequest: validCandidate() }],
      consideredCount: 1,
      truncated: false,
    }));
    expect(
      NextBestEvidenceSelectionResultSchema.safeParse({ ...validSelection(), selections: gaps }).success,
    ).toBe(false);
  });

  it('surfaces truncation explicitly', () => {
    const parsed = NextBestEvidenceSelectionResultSchema.parse(validSelection());
    expect(parsed.selections[0]!.truncated).toBe(false);
    expect(parsed.selections[0]!.consideredCount).toBe(3);
  });
});