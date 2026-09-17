// ============================================================================
// PR18 — deterministic ranking (policy §16)
//
// Ranking order = frozen EVIDENCE_UTILITY_RANK_ORDER:
//   SCORE_DESC -> EIG_DESC -> RELEVANCE_DESC -> FEASIBILITY_DESC
//   -> CANONICAL_REQUEST_KEY_ASC
// Input order must never affect output order.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { selectBestEvidenceFromCandidates } from '../../src/index.js';
import { mkCandidate, mkInput, H1, H2 } from './controlled.js';

describe('PR18 ranking', () => {
  it('ranks a higher-EIG candidate above a lower-EIG candidate', () => {
    // A targets both hypotheses (EIG higher); B targets one (EIG lower).
    const a = mkCandidate('key-a', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1', 'exp-2'] });
    const b = mkCandidate('key-b', { hypothesisIds: [H1], discriminatesAmongIds: ['exp-1'] });
    const result = selectBestEvidenceFromCandidates(mkInput([b, a]));
    expect(result.rankedRequests[0]!.canonicalRequestKey).toBe('key-a');
    expect(result.rankedRequests[0]!.utility.score).toBeGreaterThan(result.rankedRequests[1]!.utility.score);
  });

  it('breaks an exact tie by canonicalRequestKey ASC', () => {
    // Identical hypothesis targets + evidence type => identical utility => tie
    // on score/EIG/relevance/feasibility => broken by canonicalRequestKey ASC.
    const a = mkCandidate('key-aa', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1'] });
    const b = mkCandidate('key-ab', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-2'] });
    const result = selectBestEvidenceFromCandidates(mkInput([b, a]));
    expect(result.rankedRequests[0]!.canonicalRequestKey).toBe('key-aa');
    expect(result.rankedRequests[1]!.canonicalRequestKey).toBe('key-ab');
  });

  it('is input-order independent (permutation => identical ranked output)', () => {
    const a = mkCandidate('key-a', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1'] });
    const b = mkCandidate('key-b', { hypothesisIds: [H1], discriminatesAmongIds: ['exp-1'] });
    const c = mkCandidate('key-c', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-2'] });
    const order1 = selectBestEvidenceFromCandidates(mkInput([a, b, c])).rankedRequests.map((r) => r.canonicalRequestKey);
    const order2 = selectBestEvidenceFromCandidates(mkInput([c, a, b])).rankedRequests.map((r) => r.canonicalRequestKey);
    const order3 = selectBestEvidenceFromCandidates(mkInput([b, c, a])).rankedRequests.map((r) => r.canonicalRequestKey);
    expect(order2).toEqual(order1);
    expect(order3).toEqual(order1);
  });

  it('emits a total deterministic order (no two equal ranks)', () => {
    const a = mkCandidate('key-a', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1'] });
    const b = mkCandidate('key-b', { hypothesisIds: [H1], discriminatesAmongIds: ['exp-1'] });
    const c = mkCandidate('key-c', { hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-2'] });
    const result = selectBestEvidenceFromCandidates(mkInput([c, b, a]));
    const ranks = result.rankedRequests.map((r) => r.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});