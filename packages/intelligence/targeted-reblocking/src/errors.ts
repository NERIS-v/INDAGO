// ============================================================================
// Targeted Reblocking — typed, deterministic errors (Phase 5A-PR11)
// ============================================================================

export type TargetedReblockErrorCode =
  | 'AUTHORITY_MISMATCH'
  | 'INVALID_REGION_REFERENCE'
  | 'REGION_NOT_PERSISTED'
  | 'OPERATION_BOUND_REACHED';

/** Typed, deterministic failure. Rejects the operation rather than degrading. */
export class TargetedReblockError extends Error {
  constructor(
    readonly code: TargetedReblockErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TargetedReblockError';
  }
}