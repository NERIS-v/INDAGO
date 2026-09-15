// ============================================================================
// Next-Best-Evidence Runtime — Error Types (Phase 5A-PR10)
//
// Deterministic, typed failure codes for PR10 selection. Thrown on invalid
// input or upstream gate violations. The core pure functions
// (rankEvidenceCandidates/selectForGap) never throw — errors occur only at
// the orchestrator boundary during input validation.
// ============================================================================

export const NEXT_BEST_EVIDENCE_ERROR_CODE = {
  INVALID_INPUT: 'INVALID_INPUT',
  GATE_NOT_SATISFIED: 'GATE_NOT_SATISFIED',
  UNRESOLVED_DISCRIMINATION_TARGET: 'UNRESOLVED_DISCRIMINATION_TARGET',
  UNRESOLVED_OBSERVATION_REFERENCE: 'UNRESOLVED_OBSERVATION_REFERENCE',
  NAN_OR_INFINITE_COMPONENT: 'NAN_OR_INFINITE_COMPONENT',
  OUT_OF_RANGE_COMPONENT: 'OUT_OF_RANGE_COMPONENT',
  DIVERGENT_EIG_ALIAS: 'DIVERGENT_EIG_ALIAS',
  UNKNOWN_EVIDENCE_TYPE: 'UNKNOWN_EVIDENCE_TYPE',
  INCONSISTENT_INVESTIGATION_ID: 'INCONSISTENT_INVESTIGATION_ID',
} as const;
export type NextBestEvidenceErrorCode =
  (typeof NEXT_BEST_EVIDENCE_ERROR_CODE)[keyof typeof NEXT_BEST_EVIDENCE_ERROR_CODE];

export class NextBestEvidenceError extends Error {
  readonly code: NextBestEvidenceErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: NextBestEvidenceErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'NextBestEvidenceError';
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// Gate failure reasons (machine-readable, surfaced in error details)
// ============================================================================

export const GATE_FAILURE_REASON = {
  CANDIDATE_NOT_QUALIFIED: 'CANDIDATE_NOT_QUALIFIED',
  VALIDATION_INVALID: 'VALIDATION_INVALID',
  DECISION_NOT_PASSED: 'DECISION_NOT_PASSED',
  DECISION_NOT_ACTIVE: 'DECISION_NOT_ACTIVE',
  GAP_ID_NOT_UUID: 'GAP_ID_NOT_UUID',
  INVESTIGATION_ID_NOT_UUID: 'INVESTIGATION_ID_NOT_UUID',
  EMPTY_HYPOTHESIS_CONTEXT: 'EMPTY_HYPOTHESIS_CONTEXT',
  EMPTY_OBSERVATIONS: 'EMPTY_OBSERVATIONS',
} as const;
export type GateFailureReason =
  (typeof GATE_FAILURE_REASON)[keyof typeof GATE_FAILURE_REASON];