// ============================================================================
// Graph-Hole Analysis Errors (Phase 5A-PR7)
//
// Feature-level typed failures. The analyst NEVER swallows AI-runtime errors
// (UNSUPPORTED_CAPABILITY, RATE_LIMITED, REQUEST_TIMEOUT, STRUCTURED_OUTPUT_
// INVALID, ...) — they propagate unchanged, so a generation failure stays
// distinguishable from a successful analysis. These feature errors cover only
// prerequisites that PR7 owns BEFORE/AFTER the LLM call.
// ============================================================================

export type GraphHoleAnalysisErrorCode =
  | 'INPUT_AUTHORITY_MISMATCH'
  | 'INPUT_UNQUALIFIED_CANDIDATE'
  | 'INPUT_CONTEXT_INCONSISTENT'
  | 'INPUT_BOUND_INVALID'
  | 'CONTEXT_TOO_LARGE'
  | 'INVALID_ANALYSIS_REFERENCE';

const ERROR_MESSAGE_PREFIX: Record<GraphHoleAnalysisErrorCode, string> = {
  INPUT_AUTHORITY_MISMATCH:
    'The supplied candidate/region belong to a different case, graph version, or region than the analysis headline',
  INPUT_UNQUALIFIED_CANDIDATE:
    'The supplied candidate is not a QUALIFIED (hard-gate-passing) candidate',
  INPUT_CONTEXT_INCONSISTENT:
    'The supplied context package is internally inconsistent with the candidate',
  INPUT_BOUND_INVALID:
    'A caller-supplied analysis bound is invalid or exceeds the frozen policy ceiling',
  CONTEXT_TOO_LARGE:
    'The serialized context package exceeds the configured character bound; refusing to silently truncate',
  INVALID_ANALYSIS_REFERENCE:
    'The model referenced an id that is not present in the supplied bounded context',
};

/**
 * Typed, deterministic feature failure for PR7. Runtime-provider failures are
 * NOT wrapped into this type — the analyst lets AiRuntimeError propagate.
 */
export class GraphHoleAnalysisError extends Error {
  constructor(
    readonly code: GraphHoleAnalysisErrorCode,
    detail?: string,
    options: { readonly cause?: unknown } = {},
  ) {
    const message = detail
      ? `${ERROR_MESSAGE_PREFIX[code]} — ${detail}`
      : ERROR_MESSAGE_PREFIX[code];
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'GraphHoleAnalysisError';
  }
}

/** Narrowing helper mirroring the repository's typed-error usage. */
export function isGraphHoleAnalysisError(error: unknown): error is GraphHoleAnalysisError {
  return error instanceof GraphHoleAnalysisError;
}