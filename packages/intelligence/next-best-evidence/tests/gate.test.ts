// ============================================================================
// Selection-gate tests (PR10 §23: consume PR5/PR8/PR9, never re-implement)
// ============================================================================

import { describe, expect, it } from 'vitest';
import { assertSelectionGate } from '../src/gate.js';
import {
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
  GATE_FAILURE_REASON,
} from '../src/errors.js';
import {
  gapInput,
  INVESTIGATION_ID,
  GAP_ID,
  rawCandidateFixture,
  validatedFixture,
  decisionFixture,
} from './fixtures.js';

function failReason(input: Parameters<typeof assertSelectionGate>[0], investigationId = INVESTIGATION_ID): string {
  try {
    assertSelectionGate(input, investigationId);
  } catch (error) {
    if (error instanceof NextBestEvidenceError) {
      return (error.details as { reason: string }).reason;
    }
  }
  throw new Error('expected a gate failure');
}

describe('assertSelectionGate', () => {
  it('passes for a fully qualified input', () => {
    expect(() => assertSelectionGate(gapInput(), INVESTIGATION_ID)).not.toThrow();
  });

  it('rejects during what each conjunct gate is not satisfied (deterministic reasons)', () => {
    // PR5 candidate not qualified
    expect(failReason(gapInput({ candidate: { ...rawCandidateFixture(), qualified: false } })))
      .toBe(GATE_FAILURE_REASON.CANDIDATE_NOT_QUALIFIED);
    // PR8 validation invalid
    expect(failReason(gapInput({ validation: validatedFixture(false) })))
      .toBe(GATE_FAILURE_REASON.VALIDATION_INVALID);
    // PR9 judge decision not passed
    expect(failReason(gapInput({ decision: decisionFixture({ passed: false }) })))
      .toBe(GATE_FAILURE_REASON.DECISION_NOT_PASSED);
    // PR9 decision not ACTIVE
    expect(failReason(gapInput({ decision: decisionFixture({ nextStatus: 'REJECTED' }) })))
      .toBe(GATE_FAILURE_REASON.DECISION_NOT_ACTIVE);
    // Empty bounded context
    expect(failReason(gapInput({ hypothesisContext: [] })))
      .toBe(GATE_FAILURE_REASON.EMPTY_HYPOTHESIS_CONTEXT);
    // Empty observations
    expect(failReason(gapInput({ observations: [] })))
      .toBe(GATE_FAILURE_REASON.EMPTY_OBSERVATIONS);
  });

  it('rejects non-UUID ids', () => {
    expect(failReason(gapInput({ gapId: 'not-a-uuid' })))
      .toBe(GATE_FAILURE_REASON.GAP_ID_NOT_UUID);
    expect(failReason(gapInput(), 'not-a-uuid'))
      .toBe(GATE_FAILURE_REASON.INVESTIGATION_ID_NOT_UUID);
  });

  it('throws a typed NextBestEvidenceError', () => {
    try {
      assertSelectionGate(gapInput({ hypothesisContext: [] }), INVESTIGATION_ID);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NextBestEvidenceError);
      expect((error as NextBestEvidenceError).code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.GATE_NOT_SATISFIED);
      expect((error as NextBestEvidenceError).message).toContain(GAP_ID);
    }
  });
});