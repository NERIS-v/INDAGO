// ============================================================================
// Typed failure surface (Phase 5A-PR17, policy §10)
//
// All PR17 failures are typed. INSUFFICIENT_CONTEXT is a VALID RESULT (an
// empty candidate set), never a thrown error — mirroring PR15/PR16.
// ============================================================================

export const EvidenceRequestGenerationErrorCodes = {
  /** Malformed input (e.g. missing context / bad ids). */
  INVALID_INPUT: 'INVALID_INPUT',
  /** Unsupported policy version (never silently downgraded). */
  UNSUPPORTED_POLICY: 'UNSUPPORTED_POLICY',
  /** PR14/PR15/PR16 re-run equality failed (policy §5). */
  CONTEXT_MISMATCH: 'CONTEXT_MISMATCH',
  /** The candidate universe exceeds a §3 cap (never silent truncation). */
  GENERATION_BOUND_EXCEEDED: 'GENERATION_BOUND_EXCEEDED',
} as const;
export type EvidenceRequestGenerationErrorCode =
  (typeof EvidenceRequestGenerationErrorCodes)[keyof typeof EvidenceRequestGenerationErrorCodes];

export class EvidenceRequestGenerationError extends Error {
  readonly code: EvidenceRequestGenerationErrorCode;
  constructor(code: EvidenceRequestGenerationErrorCode, message: string) {
    super(message);
    this.name = 'EvidenceRequestGenerationError';
    this.code = code;
  }
}