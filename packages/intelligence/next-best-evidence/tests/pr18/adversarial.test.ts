// ============================================================================
// PR18 — typed failures + numerical adversarial + epistemic safety (policy §13/34/35)
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  selectBestEvidenceFromCandidates,
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
  computeEvidenceUtility,
} from '../../src/index.js';
import { mkCandidate, mkInput, CTX, H1, H2 } from './controlled.js';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect('no throw').toBe('throws');
  } catch (err) {
    expect(err).toBeInstanceOf(NextBestEvidenceError);
    expect((err as NextBestEvidenceError).code).toBe(code);
  }
}

describe('PR18 typed failures', () => {
  it('rejects a non-v1 policyVersion with UNSUPPORTED_POLICY', () => {
    const input = mkInput([mkCandidate('a', { hypothesisIds: [H1] })]);
    expectCode(() => selectBestEvidenceFromCandidates({ ...input, policyVersion: 'v2' as never }), NEXT_BEST_EVIDENCE_ERROR_CODE.UNSUPPORTED_POLICY);
  });

  it('rejects a missing computedAt with INVALID_INPUT', () => {
    const input = mkInput([mkCandidate('a', { hypothesisIds: [H1] })]);
    expectCode(() => selectBestEvidenceFromCandidates({ ...input, computedAt: undefined as never }), NEXT_BEST_EVIDENCE_ERROR_CODE.INVALID_INPUT);
  });

  it('rejects a malformed candidate with INVALID_CANDIDATE', () => {
    const input = mkInput([{ ...mkCandidate('a', { hypothesisIds: [H1] }), canonicalRequestKey: '' }]);
    expectCode(() => selectBestEvidenceFromCandidates(input), NEXT_BEST_EVIDENCE_ERROR_CODE.INVALID_CANDIDATE);
  });

  it('rejects a discrimination target not in the closed-world with CONTEXT_MISMATCH', () => {
    const a = mkCandidate('a', { hypothesisIds: [H1], discriminatesAmongIds: ['exp-1'] });
    const input = mkInput([a], { context: { ...CTX, representedExplanationIds: ['other-exp'] } });
    expectCode(() => selectBestEvidenceFromCandidates(input), NEXT_BEST_EVIDENCE_ERROR_CODE.CONTEXT_MISMATCH);
  });

  it('rejects a candidate whose gapId differs from the evaluation gapId with INCONSISTENT_GAP_ID', () => {
    const a = { ...mkCandidate('a', { hypothesisIds: [H1] }), gapId: 'some-other-gap' };
    expectCode(() => selectBestEvidenceFromCandidates(mkInput([a])), NEXT_BEST_EVIDENCE_ERROR_CODE.INCONSISTENT_GAP_ID);
  });
});

describe('PR18 numerical adversarial (frozen formula validation)', () => {
  it('rejects NaN components', () => {
    expectCode(
      () => computeEvidenceUtility({ expectedInformationGain: NaN, relevance: 0.5, feasibility: 0.5, cost: 0.5 }),
      NEXT_BEST_EVIDENCE_ERROR_CODE.NAN_OR_INFINITE_COMPONENT,
    );
  });
  it('rejects +Infinity components', () => {
    expectCode(
      () => computeEvidenceUtility({ expectedInformationGain: 0.5, relevance: Infinity, feasibility: 0.5, cost: 0.5 }),
      NEXT_BEST_EVIDENCE_ERROR_CODE.NAN_OR_INFINITE_COMPONENT,
    );
  });
  it('rejects -Infinity components', () => {
    expectCode(
      () => computeEvidenceUtility({ expectedInformationGain: 0.5, relevance: 0.5, feasibility: 0.5, cost: -Infinity }),
      NEXT_BEST_EVIDENCE_ERROR_CODE.NAN_OR_INFINITE_COMPONENT,
    );
  });
  it('rejects values > 1', () => {
    expectCode(
      () => computeEvidenceUtility({ expectedInformationGain: 0.5, relevance: 0.5, feasibility: 0.5, cost: 1.5 }),
      NEXT_BEST_EVIDENCE_ERROR_CODE.OUT_OF_RANGE_COMPONENT,
    );
  });
  it('rejects negative values', () => {
    expectCode(
      () => computeEvidenceUtility({ expectedInformationGain: 0.5, relevance: -0.1, feasibility: 0.5, cost: 0.5 }),
      NEXT_BEST_EVIDENCE_ERROR_CODE.OUT_OF_RANGE_COMPONENT,
    );
  });
  it('accepts exactly 0 and exactly 1', () => {
    expect(computeEvidenceUtility({ expectedInformationGain: 0, relevance: 1, feasibility: 0, cost: 1 }).score).toBeGreaterThanOrEqual(0);
  });
});

describe('PR18 epistemic safety', () => {
  it('a high utility score does not imply authorization or acquisition', () => {
    const a = mkCandidate('key-a', { evidenceType: 'RECORD', hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1'] });
    const result = selectBestEvidenceFromCandidates(mkInput([a]));
    const top = result.rankedRequests[0]!;
    expect(top.utility.score).toBeGreaterThan(0);
    // Selection carries no authorization / approval / acquisition semantics.
    expect('authorized' in top).toBe(false);
    expect('approved' in top).toBe(false);
    expect('acquired' in top).toBe(false);
    expect(top.rationale).not.toMatch(/\b(guilt|guilty|criminal|conceal(ed|ing|ment))\b/i);
  });
});