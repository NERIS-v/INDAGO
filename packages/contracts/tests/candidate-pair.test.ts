import { describe, expect, it } from 'vitest';
import {
  BlockingPassSchema,
  CandidatePairSchema,
  type BlockingPass,
  type CandidatePair,
} from '../src/index.js';

// ============================================================================
// M-A08 CandidatePair Contract Tests
//
// Verifies: only the three implemented blocking passes exist (no invented
// scores/similarity), CandidatePair strictness, unordered/deterministic
// semantics, same-case isolation, per-pair pass preservation, no-self-pair
// invariant, and the operational (non-resolution) boundary.
// ============================================================================

function makePair(overrides: Partial<CandidatePair> = {}): CandidatePair {
  return {
    id: '8b6d5c4a-1111-4111-8111-111111111111',
    caseId: '11111111-1111-4111-8111-111111111111',
    leftCandidateId: '22222222-2222-4222-8222-222222222222',
    rightCandidateId: '33333333-3333-4333-8333-333333333333',
    blockingPasses: ['EXACT_STRONG_IDENTIFIER'],
    createdAt: { value: '2026-08-31T00:00:00.000Z', precision: 'exact' },
    ...overrides,
  };
}

describe('M-A08: BlockingPassSchema', () => {
  it('contains exactly the three implemented passes', () => {
    const values = BlockingPassSchema.options;
    expect(values).toEqual([
      'EXACT_STRONG_IDENTIFIER',
      'EXACT_CANONICAL_VALUE',
      'NAME_INITIAL_BLOCK',
    ]);
  });

  it('rejects invented resolution constructs', () => {
    for (const bad of ['FUZZY_SIMILARITY', 'VECTOR_SIMILARITY', 'RESOLUTION_SCORE']) {
      expect(BlockingPassSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('M-A08: CandidatePairSchema', () => {
  it('accepts a valid pair with a single pass', () => {
    expect(CandidatePairSchema.safeParse(makePair()).success).toBe(true);
  });

  it('accepts multiple passes (union discovery)', () => {
    const pair = makePair({
      blockingPasses: [
        'EXACT_STRONG_IDENTIFIER',
        'EXACT_CANONICAL_VALUE',
        'NAME_INITIAL_BLOCK',
      ],
    });
    expect(CandidatePairSchema.safeParse(pair).success).toBe(true);
  });

  it('rejects a self-pair (left === right)', () => {
    const pair = makePair({
      leftCandidateId: '22222222-2222-4222-8222-222222222222',
      rightCandidateId: '22222222-2222-4222-8222-222222222222',
    });
    const result = CandidatePairSchema.safeParse(pair);
    expect(result.success).toBe(false);
  });

  it('rejects an empty blockingPasses list', () => {
    const result = CandidatePairSchema.safeParse(makePair({ blockingPasses: [] }));
    expect(result.success).toBe(false);
  });

  it('rejects more than 100 blocking passes', () => {
    const passes = Array.from({ length: 101 }, () => 'EXACT_CANONICAL_VALUE' as BlockingPass);
    const result = CandidatePairSchema.safeParse(makePair({ blockingPasses: passes }));
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    const pair = { ...makePair(), resolutionScore: 0.9 };
    expect(CandidatePairSchema.safeParse(pair).success).toBe(false);
  });

  it('rejects a resolution score / EntityId / hypothesisId field (M-A09 boundary)', () => {
    for (const extra of [
      { resolutionScore: 0.9 },
      { entityId: '44444444-4444-4444-8444-444444444444' },
      { hypothesisId: '55555555-5555-4555-8555-555555555555' },
      { confidence: 0.9 },
    ]) {
      expect(CandidatePairSchema.safeParse({ ...makePair(), ...extra }).success).toBe(false);
    }
  });

  it('rejects a missing caseId (case-scoped by contract)', () => {
    const { caseId: _caseId, ...rest } = makePair();
    expect(CandidatePairSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts unordered left/right as valid (ordering is canonicalized upstream)', () => {
    const reversed = makePair({
      leftCandidateId: '33333333-3333-4333-8333-333333333333',
      rightCandidateId: '22222222-2222-4222-8222-222222222222',
    });
    expect(CandidatePairSchema.safeParse(reversed).success).toBe(true);
  });

  it('preserves all discovered passes verbatim', () => {
    const passes: BlockingPass[] = ['NAME_INITIAL_BLOCK', 'EXACT_CANONICAL_VALUE'];
    const pair = makePair({ blockingPasses: passes });
    const parsed = CandidatePairSchema.parse(pair);
    expect(parsed.blockingPasses).toEqual(passes);
  });
});
