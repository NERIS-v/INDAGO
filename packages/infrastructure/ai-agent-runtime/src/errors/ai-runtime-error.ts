// ============================================================================
// AI runtime error taxonomy (@indago/ai-agent-runtime)
//
// A frozen, typed failure taxonomy for LLM EXECUTION. The runtime never
// interprets the meaning of model output — these codes describe transport,
// reliability, budget, configuration and validation failures only.
//
// Codes (frozen):
//   CONFIGURATION_ERROR          — invalid/missing runtime configuration
//   PROVIDER_NOT_FOUND           — requested provider kind has no implementation
//   PROVIDER_UNAVAILABLE         — provider unreachable / server error
//   AUTHENTICATION_FAILED        — provider rejected our credentials
//   RATE_LIMITED                 — provider returned an explicit rate-limit signal
//   REQUEST_TIMEOUT              — provider exceeded the effective timeout
//   INPUT_TOO_LARGE              — request context exceeded a runtime budget
//   OUTPUT_LIMIT_EXCEEDED        — requested/observed output exceeded a runtime budget
//   INVALID_PROVIDER_RESPONSE    — provider replied with an unusable payload
//   STRUCTURED_OUTPUT_INVALID    — response text did not contain parsable JSON
//   SCHEMA_VALIDATION_FAILED     — schema conversion/violation (zod→JSON Schema
//                                  conversion failed, unconstrained/overlarge/
//                                  overlarge schema, or parsed JSON failed the
//                                  caller-supplied zod schema)
//   UNSUPPORTED_CAPABILITY       — requested capability not offered by the
//                                  provider/runtime, OR a schema construct the
//                                  shared provider subset cannot enforce
//                                  natively (no silent fallback)
//   RETRY_EXHAUSTED              — a transient failure was retried to the bound
//   ABORTED                      — the caller cancelled the operation
//
// Security invariants (frozen):
//   - Error messages NEVER contain API keys, Authorization headers or URLs
//     that embed credentials. Provider raw payload text is never echoed into
//     a message (a hostile provider could echo a secret back at us).
//   - Provider-specific raw error objects never escape the provider boundary:
//     they are carried as `cause` (or dropped), never thrown directly.
// ============================================================================

export type AiRuntimeErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'REQUEST_TIMEOUT'
  | 'INPUT_TOO_LARGE'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'STRUCTURED_OUTPUT_INVALID'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'UNSUPPORTED_CAPABILITY'
  | 'RETRY_EXHAUSTED'
  | 'ABORTED';

export class AiRuntimeError extends Error {
  /**
   * Optional Retry-After hint (ms) surfaced by the provider from a rate-limit
   * response. Honored by the retry loop within configured bounds.
   */
  readonly retryAfterMs?: number;

  constructor(
    readonly code: AiRuntimeErrorCode,
    message: string,
    options: ErrorOptions & { cause?: unknown; retryAfterMs?: number } = {},
  ) {
    super(message, options);
    this.name = 'AiRuntimeError';
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
  }
}