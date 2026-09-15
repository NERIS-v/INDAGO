// ============================================================================
// Graph-Hole Judge Errors (Phase 5A-PR9)
//
// Feature-level typed failures for the judge executor. The judge NEVER
// swallows AI-runtime errors (UNSUPPORTED_CAPABILITY, RATE_LIMITED, REQUEST_
// TIMEOUT, STRUCTURED_OUTPUT_INVALID, ...) — they propagate unchanged, so a
// generation failure stays distinguishable from a successful judgement.
// These feature errors cover only prerequisites the FEATURE owns BEFORE the
// LLM call (authority enforcement over the closed-world input).
// ============================================================================

export type GraphHoleJudgeErrorCode =
  | 'INPUT_AUTHORITY_MISMATCH'
  | 'INPUT_UNQUALIFIED_CANDIDATE';

const ERROR_MESSAGE_PREFIX: Record<GraphHoleJudgeErrorCode, string> = {
  INPUT_AUTHORITY_MISMATCH:
    'The supplied candidate, analysis, and context summary do not share a common case, graph version, region, and candidate id',
  INPUT_UNQUALIFIED_CANDIDATE:
    'The supplied candidate is not a QUALIFIED (hard-gate-passing) candidate',
};

/**
 * Typed, deterministic input-domain failure for PR9. Runtime-provider failures
 * are NOT wrapped into this type — the judge lets AiRuntimeError propagate.
 */
export class GraphHoleJudgeError extends Error {
  constructor(
    readonly code: GraphHoleJudgeErrorCode,
    detail?: string,
    options: { readonly cause?: unknown } = {},
  ) {
    const message = detail
      ? `${ERROR_MESSAGE_PREFIX[code]} — ${detail}`
      : ERROR_MESSAGE_PREFIX[code];
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'GraphHoleJudgeError';
  }
}

/** Narrowing helper mirroring the repository's typed-error usage. */
export function isGraphHoleJudgeError(error: unknown): error is GraphHoleJudgeError {
  return error instanceof GraphHoleJudgeError;
}