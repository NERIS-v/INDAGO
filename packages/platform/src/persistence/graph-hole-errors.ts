// ============================================================================
// GraphHole persistence store errors (Phase 5A-PR6)
// ============================================================================

export type GraphHoleStoreErrorCode =
  | 'AUTHORITY_MISMATCH'
  | 'INVALID_IDENTITY'
  | 'UNQUALIFIED_CANDIDATE'
  | 'INVALID_TRANSITION'
  | 'INVALID_SUPERSESSION'
  | 'NOT_FOUND';

/** Typed, deterministic failure for the PR6 persistence boundary. */
export class GraphHoleStoreError extends Error {
  constructor(
    readonly code: GraphHoleStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GraphHoleStoreError';
  }
}