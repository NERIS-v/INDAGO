// ============================================================================
// PR16 boundary tests (policy §5/§7)
//
// Typed failures, hard bounds, context binding, PR15-set binding, and
// closed-world reference validation — all thrown as ErSplitExplanationError
// with the frozen failure codes.
// ============================================================================

import { describe, it, expect } from 'vitest';

import {
  generateErSplitExplanations,
  ErSplitExplanationError,
  ErSplitExplanationErrorCodes,
} from '../src/index.js';
import {
  CAND_A,
  CAND_B,
  PAIR_AB,
  ENTITY_A,
  makeErSplitInput,
  makePair,
  makeEntityHypothesis,
  makeCompetingSet,
  makeObservation,
} from './helpers.js';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect('no throw').toBe('throws');
  } catch (err) {
    expect(err).toBeInstanceOf(ErSplitExplanationError);
    expect((err as ErSplitExplanationError).code).toBe(code);
  }
}

describe('policy §7 — structural / policy failures', () => {
  it('null input -> INVALID_INPUT', () => {
    expectCode(() => generateErSplitExplanations(null as never), ErSplitExplanationErrorCodes.INVALID_INPUT);
  });

  it('missing arrays -> INVALID_INPUT', () => {
    const input = { ...makeErSplitInput(), candidatePairs: undefined };
    expectCode(() => generateErSplitExplanations(input as never), ErSplitExplanationErrorCodes.INVALID_INPUT);
  });

  it('unsupported erSplitPolicyVersion -> UNSUPPORTED_POLICY', () => {
    const input = { ...makeErSplitInput(), erSplitPolicyVersion: 'v2' };
    expectCode(() => generateErSplitExplanations(input as never), ErSplitExplanationErrorCodes.UNSUPPORTED_POLICY);
  });

  it('candidate pairs over the bound -> INVALID_INPUT', () => {
    const pairs: Parameters<typeof makePair>[0][] = [];
    for (let i = 0; i < 251; i++) {
      pairs.push(
        makePair({
          id: `550e8400-e29b-41d4-a716-44665545${String(0x100 + i).padStart(4, '0')}`,
          leftCandidateId: CAND_A,
          rightCandidateId: CAND_B,
        }),
      );
    }
    expectCode(
      () => generateErSplitExplanations(makeErSplitInput({ candidatePairs: pairs, entityHypotheses: [] })),
      ErSplitExplanationErrorCodes.INVALID_INPUT,
    );
  });

  it('hypotheses over the bound -> INVALID_INPUT', () => {
    const hypotheses = [makeEntityHypothesis({ id: '550e8400-e29b-41d4-a716-446655440300', candidatePairId: PAIR_AB })];
    for (let i = 0; i < 501; i++) {
      hypotheses.push(
        makeEntityHypothesis({ id: `550e8400-e29b-41d4-a716-44665546${String(0x100 + i).padStart(4, '0')}`, candidatePairId: PAIR_AB }),
      );
    }
    expectCode(
      () => generateErSplitExplanations(makeErSplitInput({ entityHypotheses: hypotheses })),
      ErSplitExplanationErrorCodes.INVALID_INPUT,
    );
  });

  it('duplicate candidate pair id -> INVALID_INPUT', () => {
    const base = makeErSplitInput();
    expectCode(
      () =>
        generateErSplitExplanations(
          makeErSplitInput({
            candidatePairs: [base.candidatePairs[0]!, base.candidatePairs[0]!],
            entityHypotheses: [],
          }),
        ),
      ErSplitExplanationErrorCodes.INVALID_INPUT,
    );
  });
});

describe('policy §7 — classification binding (CONTEXT_MISMATCH)', () => {
  it('edited gapClassification.type triggers CONTEXT_MISMATCH', () => {
    const input = makeErSplitInput();
    const tampered = { ...input, gapClassification: { ...input.gapClassification, type: 'bogus-type' as never } };
    expectCode(() => generateErSplitExplanations(tampered), ErSplitExplanationErrorCodes.CONTEXT_MISMATCH);
  });

  it('edited gapClassification.contextSha256 triggers CONTEXT_MISMATCH', () => {
    const input = makeErSplitInput();
    const tampered = { ...input, gapClassification: { ...input.gapClassification, contextSha256: 'b'.repeat(64) } };
    expectCode(() => generateErSplitExplanations(tampered), ErSplitExplanationErrorCodes.CONTEXT_MISMATCH);
  });

  it('edited gapClassification.reasonCodes triggers CONTEXT_MISMATCH', () => {
    const input = makeErSplitInput();
    const tampered = { ...input, gapClassification: { ...input.gapClassification, reasonCodes: [] } };
    expectCode(() => generateErSplitExplanations(tampered), ErSplitExplanationErrorCodes.CONTEXT_MISMATCH);
  });

  it('cross-case candidate pair triggers CONTEXT_MISMATCH', () => {
    const crossPair = makePair({
      id: PAIR_AB,
      leftCandidateId: CAND_A,
      rightCandidateId: CAND_B,
      caseId: '550e8400-e29b-41d4-a716-446655449999',
    });
    expectCode(
      () => generateErSplitExplanations(makeErSplitInput({ candidatePairs: [crossPair], entityHypotheses: [] })),
      ErSplitExplanationErrorCodes.CONTEXT_MISMATCH,
    );
  });

  it('classificationPolicyVersion != v1 -> UNSUPPORTED_POLICY', () => {
    const input = makeErSplitInput();
    const tampered = { ...input, context: { ...input.context, classificationPolicyVersion: 'v2' as never } };
    expectCode(() => generateErSplitExplanations(tampered), ErSplitExplanationErrorCodes.UNSUPPORTED_POLICY);
  });
});

describe('policy §7 — closed-world reference validation (INVALID_REFERENCE)', () => {
  it('pair referencing a missing universe candidate', () => {
    const badPair = makePair({ id: PAIR_AB, leftCandidateId: '550e8400-e29b-41d4-a716-446655449901', rightCandidateId: CAND_B });
    expectCode(
      () => generateErSplitExplanations(makeErSplitInput({ candidatePairs: [badPair], entityHypotheses: [] })),
      ErSplitExplanationErrorCodes.INVALID_REFERENCE,
    );
  });

  it('hypothesis referencing a missing pair', () => {
    const h = makeEntityHypothesis({ id: '550e8400-e29b-41d4-a716-446655440300', candidatePairId: '550e8400-e29b-41d4-a716-446655449902' });
    expectCode(
      () => generateErSplitExplanations(makeErSplitInput({ entityHypotheses: [h] })),
      ErSplitExplanationErrorCodes.INVALID_REFERENCE,
    );
  });

  it('hypothesis supporting candidate not in the universe', () => {
    const h = makeEntityHypothesis({
      id: '550e8400-e29b-41d4-a716-446655440300',
      candidatePairId: PAIR_AB,
      supportingCandidateIds: ['550e8400-e29b-41d4-a716-446655449903'],
    });
    expectCode(
      () => generateErSplitExplanations(makeErSplitInput({ entityHypotheses: [h] })),
      ErSplitExplanationErrorCodes.INVALID_REFERENCE,
    );
  });
});

describe('policy §7 — PR15 competing-set binding', () => {
  it('a matching set is echoed as competingExplanationSetContextSha256', () => {
    const input = makeErSplitInput();
    const classification = input.gapClassification;
    const set = makeCompetingSet({
      graphHoleId: classification.graphHoleId,
      type: classification.type,
      status: classification.status,
    });
    const result = generateErSplitExplanations(makeErSplitInput({ competingExplanationSet: set }));
    expect(result.competingExplanationSetContextSha256).toBe(set.contextSha256);
    expect(result.explanations).toHaveLength(1);
  });

  it('a set for a different hole -> CONTEXT_MISMATCH', () => {
    const set = makeCompetingSet({ graphHoleId: 'other-hole' });
    expectCode(
      () => generateErSplitExplanations(makeErSplitInput({ competingExplanationSet: set })),
      ErSplitExplanationErrorCodes.CONTEXT_MISMATCH,
    );
  });

  it('a set whose embedded classification disagrees -> CONTEXT_MISMATCH', () => {
    const classification = makeErSplitInput().gapClassification;
    const set = makeCompetingSet({
      graphHoleId: classification.graphHoleId,
      type: classification.type === 'MISSING_DATA' ? 'MISSING_INVESTIGATION' : 'MISSING_DATA',
      status: classification.status,
    });
    expectCode(
      () => generateErSplitExplanations(makeErSplitInput({ competingExplanationSet: set })),
      ErSplitExplanationErrorCodes.CONTEXT_MISMATCH,
    );
  });

  it('a v2 competing set -> UNSUPPORTED_POLICY', () => {
    const set = { ...makeCompetingSet({}), policyVersion: 'v2' };
    expectCode(
      () => generateErSplitExplanations(makeErSplitInput({ competingExplanationSet: set as never })),
      ErSplitExplanationErrorCodes.UNSUPPORTED_POLICY,
    );
  });
});

describe('policy §31 — non-throwing epistemic results', () => {
  it('a fully unified slice yields an empty set, never an error', () => {
    const result = generateErSplitExplanations(
      makeErSplitInput({
        observations: [
          makeObservation('550e8400-e29b-41d4-a716-446655440400', { entityIds: [ENTITY_A] }),
          makeObservation('550e8400-e29b-41d4-a716-446655440401', { entityIds: [ENTITY_A] }),
        ],
      }),
    );
    expect(result.explanations).toHaveLength(0);
    expect(result.excludedPairCounts.unified).toBe(1);
  });
});