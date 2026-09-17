// ============================================================================
// PR18 — deduplication by the PR10 canonical identity (policy §17)
//
// Dedup uses candidate.canonicalRequestKey (the PR10 frozen identity — single
// source of truth). Equivalent requests produced through different PR17
// explanation paths collapse, with provenance merged; similar but distinct
// requests are never merged.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { selectBestEvidenceFromCandidates } from '../../src/index.js';
import { mkCandidate, mkInput, H1, H2 } from './controlled.js';

describe('PR18 deduplication', () => {
  it('collapses exact duplicates (same canonicalRequestKey) into one', () => {
    const a = mkCandidate('same-key', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1'] });
    const dup = mkCandidate('same-key', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1'], description: 'other path' });
    const result = selectBestEvidenceFromCandidates(mkInput([a, dup]));
    const keys = result.rankedRequests.map((r) => r.canonicalRequestKey);
    expect(keys.filter((k) => k === 'same-key').length).toBe(1);
    expect(result.accounting.deduplicatedCandidates).toBe(1);
  });

  it('merges provenance of collapsed sources', () => {
    const a = mkCandidate('same-key', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1'] });
    const dup = mkCandidate('same-key', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1'], description: 'alt' });
    const result = selectBestEvidenceFromCandidates(mkInput([a, dup]));
    const merged = result.rankedRequests.find((r) => r.canonicalRequestKey === 'same-key')!;
    expect(merged.sourceExplanationIds.sort()).toEqual(['exp-1']);
  });

  it('keeps similar-but-distinct requests (different canonicalRequestKey)', () => {
    const a = mkCandidate('key-a', { hypothesisIds: [H1], discriminatesAmongIds: ['exp-1'], description: 'similar wording' });
    const b = mkCandidate('key-b', { hypothesisIds: [H1], discriminatesAmongIds: ['exp-1'], description: 'nearly identical wording' });
    const result = selectBestEvidenceFromCandidates(mkInput([a, b]));
    expect(result.rankedRequests.length).toBe(2);
  });
});