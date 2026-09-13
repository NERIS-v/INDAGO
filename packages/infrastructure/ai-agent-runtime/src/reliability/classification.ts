// ============================================================================
// Transient error classification (Phase 5A-AI-PR7)
//
// ONLY plausibly-transient failures may be retried:
//   PROVIDER_UNAVAILABLE, RATE_LIMITED, REQUEST_TIMEOUT
//
// Everything else is a dead-end and MUST surface immediately:
//   CONFIGURATION_ERROR, PROVIDER_NOT_FOUND, AUTHENTICATION_FAILED,
//   INPUT_TOO_LARGE, OUTPUT_LIMIT_EXCEEDED, INVALID_PROVIDER_RESPONSE,
//   STRUCTURED_OUTPUT_INVALID, SCHEMA_VALIDATION_FAILED,
//   UNSUPPORTED_CAPABILITY, RETRY_EXHAUSTED, ABORTED
// ============================================================================

import { AiRuntimeError } from '../errors/ai-runtime-error.js';
import type { AiRuntimeErrorCode } from '../errors/ai-runtime-error.js';

/** Codes for which a bounded retry is permitted (all others are dead-ends). */
export const TRANSIENT_AI_RUNTIME_ERROR_CODES: ReadonlySet<AiRuntimeErrorCode> = new Set([
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'REQUEST_TIMEOUT',
]);

export function isTransientError(error: unknown): boolean {
  return error instanceof AiRuntimeError && TRANSIENT_AI_RUNTIME_ERROR_CODES.has(error.code);
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof AiRuntimeError && error.code === 'ABORTED') return true;
  const causeName =
    error instanceof Error ? error.name : '';
  return causeName === 'AbortError' || causeName === 'TimeoutError';
}