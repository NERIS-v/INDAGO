import { describe, expect, it } from 'vitest';
import { buildRankingKey, byRankingKey } from '../src/ranking.js';
import { scoreRankToken } from '../src/determinism.js';
import type { QualifiedGraphHoleCandidate } from '@indago/contracts';

function makeRecord(overrides: Partial<QualifiedGraphHoleCandidate> = {}): QualifiedGraphHoleCandidate {
  return {
    rawCandidate: {
      candidateId: 'cand-1',
      caseId: 'c1',
      graphVersionId: 'v1',
      regionId: 'r1',
      detectionPolicyVersion: 'v1',
      detectorType: 'MISSING_EDGE',
      nodeIds: [],
      observedEdgeIds: [],
      expectedRelationshipType: null,
      supportingHypothesisIds: [],
      supportingObservationIds: [],
      contradictingObservationIds: [],
      structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT',
      detectorMetadata: { detectorType: 'MISSING_EDGE', pairEvaluations: 1, boundReached: false },
      provenance: { sourceId: 'S1', extractor: 'test' },
      ...(overrides.rawCandidate ?? {}),
    },
    qualified: true,
    failureReasons: [],
    structuralScore: 0,
    evidenceSupportScore: 0,
    expectedInformationValue: 0,
    significance: 0,
    independentSupportUnitIds: [],
    structuralComponents: { patternStrength: 0.8, connectivitySupport: 0.6, contextualSupport: 0.7 },
    scoreComponents: {
      evidenceSupport: { supportBreadth: 0.75, supportConsistency: 1, provenanceCompleteness: 1 },
      expectedInformationValue: { uncertaintyPotential: 1, hypothesisCoverage: 0.666667, evidenceDiversity: 0.75 },
    },
    rankingKey: '',
    regionStatus: 'SATURATED',
    scoringPolicyVersion: 'v2',
    ...overrides,
  };
}

describe('buildRankingKey', () => {
  it('constructs a byte-stable composite key with correct token order', () => {
    const key = buildRankingKey({
      significance: 0.90,
      structuralScore: 0.80,
      evidenceSupportScore: 0.60,
      expectedInformationValue: 0.50,
      candidateId: 'cand-A',
    });

    expect(key).toBe(
      [scoreRankToken(0.90), scoreRankToken(0.80), scoreRankToken(0.60), scoreRankToken(0.50), 'cand-A'].join('|'),
    );
    expect(key).toBe('0.100000|0.200000|0.400000|0.500000|cand-A');
  });

  it('higher scores produce lexicographically smaller keys', () => {
    const high = buildRankingKey({
      significance: 0.95, structuralScore: 0.9, evidenceSupportScore: 0.8, expectedInformationValue: 0.7, candidateId: 'x',
    });
    const low = buildRankingKey({
      significance: 0.50, structuralScore: 0.5, evidenceSupportScore: 0.5, expectedInformationValue: 0.5, candidateId: 'y',
    });
    expect(high < low).toBe(true);
  });
});

describe('byRankingKey comparator', () => {
  it('sorts ascending by rankingKey, then by candidateId', () => {
    const a = makeRecord({ rankingKey: '0.300000|0.400000|0.500000|0.600000|cand-A', rawCandidate: { candidateId: 'cand-A' } as Partial<import('@indago/contracts').RawGraphHoleCandidate> });
    const b = makeRecord({ rankingKey: '0.300000|0.400000|0.500000|0.600000|cand-B', rawCandidate: { candidateId: 'cand-B' } as Partial<import('@indago/contracts').RawGraphHoleCandidate> });
    const c = makeRecord({ rankingKey: '0.100000|0.200000|0.300000|0.400000|cand-C', rawCandidate: { candidateId: 'cand-C' } as Partial<import('@indago/contracts').RawGraphHoleCandidate> });
    const sorted = [b, c, a].sort(byRankingKey);
    expect(sorted.map((r) => r.rawCandidate.candidateId)).toEqual(['cand-C', 'cand-A', 'cand-B']);
  });
});