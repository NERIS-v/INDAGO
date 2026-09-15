// ============================================================================
// Next-Best-Evidence Runtime — Selection Gate (Phase 5A-PR10)
//
// PR10 CONSUMES the upstream deterministic gates; it never re-implements them.
// A gap proceeds to selection ONLY when the full conjunction holds:
//   PR5  candidate.qualified            === true
//   PR8  validation.valid               === true
//   PR9  decision.evaluation.passed     === true
//   PR9  decision.nextStatus            === 'ACTIVE'
//
// Plus closed-world shape checks (ids are canonical UUIDs, bounded context is
// non-empty). Every failure is a deterministic typed NextBestEvidenceError
// with a machine-readable reason and the offending gap id.
// ============================================================================

import type { NextBestEvidenceGapInput } from './types.js';
import {
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
  GATE_FAILURE_REASON,
} from './errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function gateError(gapId: string, reason: string): NextBestEvidenceError {
  return new NextBestEvidenceError(
    NEXT_BEST_EVIDENCE_ERROR_CODE.GATE_NOT_SATISFIED,
    `Selection gate not satisfied for gap ${gapId}: ${reason}`,
    { gapId, reason },
  );
}

/**
 * Assert the full deterministic selection gate for one gap plus its
 * investigation id. Throws a typed NextBestEvidenceError on the first
 * unsatisfied conjunct (checked in a fixed, documented order).
 */
export function assertSelectionGate(
  gapInput: NextBestEvidenceGapInput,
  investigationId: string,
): void {
  if (!UUID_PATTERN.test(investigationId)) {
    throw gateError(gapInput.gapId, GATE_FAILURE_REASON.INVESTIGATION_ID_NOT_UUID);
  }
  if (!UUID_PATTERN.test(gapInput.gapId)) {
    throw gateError(gapInput.gapId, GATE_FAILURE_REASON.GAP_ID_NOT_UUID);
  }
  if (gapInput.candidate.qualified !== true) {
    throw gateError(gapInput.gapId, GATE_FAILURE_REASON.CANDIDATE_NOT_QUALIFIED);
  }
  if (gapInput.validation.valid !== true) {
    throw gateError(gapInput.gapId, GATE_FAILURE_REASON.VALIDATION_INVALID);
  }
  if (gapInput.decision.evaluation.passed !== true) {
    throw gateError(gapInput.gapId, GATE_FAILURE_REASON.DECISION_NOT_PASSED);
  }
  if (gapInput.decision.nextStatus !== 'ACTIVE') {
    throw gateError(gapInput.gapId, GATE_FAILURE_REASON.DECISION_NOT_ACTIVE);
  }
  if (gapInput.hypothesisContext.length === 0) {
    throw gateError(gapInput.gapId, GATE_FAILURE_REASON.EMPTY_HYPOTHESIS_CONTEXT);
  }
  if (gapInput.observations.length === 0) {
    throw gateError(gapInput.gapId, GATE_FAILURE_REASON.EMPTY_OBSERVATIONS);
  }
}