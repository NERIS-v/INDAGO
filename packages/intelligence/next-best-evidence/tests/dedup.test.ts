// ============================================================================
// Deduplication + deterministic ranking tests (frozen identity, §15/§26)
// ============================================================================

import { describe, expect, it } from 'vitest';
import { canonicalizeNextBestEvidenceRequest } from '@indago/contracts';
import {
  canonicalIdentityKey,
  deduplicateAndRank,
} from '../src/dedup.js';
import type { ComputedEvidenceUtility } from '../src/components.js';
import type { ScoredCandidate } from '../src/dedup.js';
import { H1, H2, GAP_ID } from './fixtures.js';

function candidate(partial: Partial<ScoredCandidate> & { utility: ComputedEvidenceUtility }): ScoredCandidate {
  return {
    recommendationIndex: 0,
    evidenceType: 'DOCUMENT',
    rationale: 'r',
    targetUuids: [H1],
    ...partial,
  };
}

describe('canonical evidence-request identity', () => {
  it('is order-independent over the discrimination target', () => {
    expect(canonicalIdentityKey(GAP_ID, 'DOCUMENT', [H1, H2]))
      .toBe(canonicalIdentityKey(GAP_ID, 'DOCUMENT', [H2, H1]));
  });

  it('differs across gaps, types and targets', () => {
    const base = canonicalIdentityKey(GAP_ID, 'DOCUMENT', [H1]);
    expect(canonicalIdentityKey('other-gap', 'DOCUMENT', [H1])).not.toBe(base);
    expect(canonicalIdentityKey(GAP_ID, 'RECORD', [H1])).not.toBe(base);
    expect(canonicalIdentityKey(GAP_ID, 'DOCUMENT', [H2])).not.toBe(base);
  });

  it('matches the frozen canonicalizeNextBestEvidenceRequest contract', () => {
    expect(canonicalIdentityKey(GAP_ID, 'DOCUMENT', [H1, H2]))
      .toBe(canonicalizeNextBestEvidenceRequest({ gapId: GAP_ID, evidenceType: 'DOCUMENT', discriminatesAmongIds: [H2, H1], hypothesisIds: [H2, H1] }));
  });
});

describe('deduplicateAndRank', () => {
  it('collapses equivalent candidates and keeps the deterministic winner', () => {
    const low = candidate({ utility: { expectedInformationGain: 0.2, eig: 0.2, relevance: 0.5, feasibility: 0.6, cost: 0.4, score: 0.5 } });
    const high = candidate({ rationale: 'winner rationale', utility: { expectedInformationGain: 0.9, eig: 0.9, relevance: 0.5, feasibility: 0.6, cost: 0.4, score: 0.9 } });

    const result = deduplicateAndRank(GAP_ID, [low, high]);

    expect(result.ranked).toHaveLength(1);
    expect(result.deduplicatedCount).toBe(1);
    expect(result.ranked[0]?.rationale).toBe('winner rationale');
    expect(result.ranked[0]?.utility.score).toBe(0.9);
  });

  it('ranks by score desc, then EIG desc, then relevance desc, then feasibility desc, then key asc', () => {
    const mk = (over: Partial<ComputedEvidenceUtility>, target: readonly string[]): ScoredCandidate =>
      candidate({ targetUuids: [...target], utility: { expectedInformationGain: 0, eig: 0, relevance: 0, feasibility: 0, cost: 0, score: 0, ...over } });

    const sameScore = [
      mk({ relevance: 0.5, feasibility: 0.1 }, [H1]),
      mk({ relevance: 0.9, feasibility: 0.1 }, [H2]),
    ];
    const byRelevance = deduplicateAndRank(GAP_ID, sameScore);
    expect(byRelevance.ranked[0]?.hypothesisIds).toEqual([H2]);

    const sameScoreEig = [
      mk({ eig: 0.2, expectedInformationGain: 0.2, relevance: 0.5 }, [H1]),
      mk({ eig: 0.8, expectedInformationGain: 0.8, relevance: 0.5 }, [H2]),
    ];
    const byEig = deduplicateAndRank(GAP_ID, sameScoreEig);
    expect(byEig.ranked[0]?.utility.eig).toBe(0.8);
  });

  it('output is invariant to input order', () => {
    const a = candidate({ targetUuids: [H1, H2], utility: { expectedInformationGain: 0.7, eig: 0.7, relevance: 0.7, feasibility: 0.7, cost: 0.3, score: 0.7 } });
    const b = candidate({ targetUuids: [H2], utility: { expectedInformationGain: 0.6, eig: 0.6, relevance: 0.6, feasibility: 0.6, cost: 0.3, score: 0.6 } });

    expect(deduplicateAndRank(GAP_ID, [a, b])).toEqual(deduplicateAndRank(GAP_ID, [b, a]));
  });
});