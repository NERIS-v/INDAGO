import { describe, it, expect } from 'vitest';
import { selectCandidatesForRegion } from '../src/region-selector.js';
import { makeCandidate } from './fixtures.js';

// ============================================================================
// PR11 region-selector — the ONLY membership rule:
//   candidate.observationId ∈ regionMemberObservationIds
// No fuzzy heuristics, no "nearby" thresholds, no silent inclusions.
// ============================================================================

describe('selectCandidatesForRegion', () => {
  it('admits only candidates whose observation is a region member', () => {
    const memberA = '00000000-0000-4000-8000-000000000101';
    const memberB = '00000000-0000-4000-8000-000000000102';
    const outsider = '00000000-0000-4000-8000-000000000199';

    const selection = selectCandidatesForRegion({
      memberObservationIds: [memberA, memberB],
      candidates: [
        makeCandidate(1, { observation: 101 }),
        makeCandidate(2, { observation: 101 }),
        makeCandidate(3, { observation: 102 }),
        makeCandidate(4, { observation: 199 }),
      ],
    });

    expect(selection.eligibleCount).toBe(3);
    expect(selection.excludedCount).toBe(1);
    expect(selection.selectedCandidates.map((c) => c.id)).toEqual([
      makeCandidate(1).id,
      makeCandidate(2).id,
      makeCandidate(3).id,
    ]);
  });

  it('returns selection sorted by candidate id asc', () => {
    const memberA = '00000000-0000-4000-8000-000000000101';
    const selection = selectCandidatesForRegion({
      memberObservationIds: [memberA],
      candidates: [
        makeCandidate(10, { observation: 101 }),
        makeCandidate(2, { observation: 101 }),
        makeCandidate(7, { observation: 101 }),
      ],
    });
    expect(selection.selectedCandidates.map((c) => c.id)).toEqual([
      makeCandidate(2).id,
      makeCandidate(7).id,
      makeCandidate(10).id,
    ]);
  });

  it('deduplicates identical candidate ids defensively', () => {
    const memberA = '00000000-0000-4000-8000-000000000101';
    const duplicate = makeCandidate(5, { observation: 101 });
    const selection = selectCandidatesForRegion({
      memberObservationIds: [memberA],
      candidates: [duplicate, { ...duplicate }],
    });
    expect(selection.selectedCandidates).toHaveLength(1);
    expect(selection.eligibleCount).toBe(1);
  });

  it('returns an empty selection when no candidate is a member', () => {
    const selection = selectCandidatesForRegion({
      memberObservationIds: ['00000000-0000-4000-8000-000000000101'],
      candidates: [makeCandidate(1, { observation: 500 })],
    });
    expect(selection.selectedCandidates).toHaveLength(0);
    expect(selection.eligibleCount).toBe(0);
    expect(selection.excludedCount).toBe(1);
  });
});