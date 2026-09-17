// ============================================================================
// PR16 integration with PR15 (policy §9b/§5 PR15-set binding)
//
// A REAL PR15 competing-explanation set (built by generateCompetingExplanations
// over the same closed-world context) is supplied to the ER-split generator:
//   - the set binds (same graphHoleId + classification projection + v1) and its
//     digest is echoed as competingExplanationSetContextSha256,
//   - a real set retargeted at another hole is rejected with CONTEXT_MISMATCH,
//   - the ER-split result is itself contract-valid.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { generateCompetingExplanations } from '@indago/competing-explanations';
import type { CompetingExplanationInput } from '@indago/competing-explanations';

import {
  generateErSplitExplanations,
  ErSplitExplanationError,
  ErSplitExplanationErrorCodes,
} from '../src/index.js';
import { makeErSplitInput, OBSERVED_AT } from './helpers.js';

function makeRealCompetingSet(): ReturnType<typeof generateCompetingExplanations> {
  const erSplit = makeErSplitInput();
  const pr15: CompetingExplanationInput = {
    context: erSplit.context,
    gapClassification: erSplit.gapClassification,
    competingExplanationPolicyVersion: 'v1',
    computedAt: OBSERVED_AT,
  };
  return generateCompetingExplanations(pr15);
}

describe('policy §5/§9b — real PR15 set binding', () => {
  it('a REAL generateCompetingExplanations set binds and is echoed', () => {
    const set = makeRealCompetingSet();
    const result = generateErSplitExplanations(makeErSplitInput({ competingExplanationSet: set }));
    expect(result.competingExplanationSetContextSha256).toBe(set.contextSha256);
    expect(result.explanationCount).toBe(result.explanations.length);
    expect(result.explanations.length).toBeGreaterThan(0);
    for (const e of result.explanations) {
      expect(e.explanationStatus.length).toBeGreaterThan(0);
      expect(e.rankingKey.length).toBeGreaterThan(0);
    }
  });

  it('a REAL set retargeted at another hole is rejected with CONTEXT_MISMATCH', () => {
    const set = { ...makeRealCompetingSet(), graphHoleId: 'some-other-hole' };
    try {
      generateErSplitExplanations(makeErSplitInput({ competingExplanationSet: set }));
      expect('no throw').toBe('throws');
    } catch (err) {
      expect(err).toBeInstanceOf(ErSplitExplanationError);
      expect((err as ErSplitExplanationError).code).toBe(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH);
    }
  });

  it('a REAL set with a different classificationPolicyVersion is rejected with UNSUPPORTED_POLICY', () => {
    const set = makeRealCompetingSet();
    const tampered = {
      ...set,
      classification: { ...set.classification, classificationPolicyVersion: 'v2' },
    };
    try {
      generateErSplitExplanations(makeErSplitInput({ competingExplanationSet: tampered }));
      expect('no throw').toBe('throws');
    } catch (err) {
      expect(err).toBeInstanceOf(ErSplitExplanationError);
      expect((err as ErSplitExplanationError).code).toBe(ErSplitExplanationErrorCodes.UNSUPPORTED_POLICY);
    }
  });
});