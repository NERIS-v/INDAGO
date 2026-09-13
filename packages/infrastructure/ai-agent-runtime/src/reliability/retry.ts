// ============================================================================
// Bounded retry with exponential backoff (@indago/ai-agent-runtime)
//
// Retries ONLY transient failures (PROVIDER_UNAVAILABLE / RATE_LIMITED /
// REQUEST_TIMEOUT). Never retried: invalid requests, invalid auth, schema/
// structured-output failures, unsupported capability, configuration errors.
//
//   - Backoff is exponential: baseDelayMs * 2^(attempt-1), capped at
//     maxDelayMs.
//   - A provider-supplied Retry-After hint is honored (capped at maxDelayMs).
//   - Retries are bounded by maxRetries; exhaustion throws RETRY_EXHAUSTED
//     with the last provider error as `cause` (a provider failure stays a
//     provider failure).
//   - No infinite loops, no recursive retries, no hidden behavior.
//
// Any error thrown by `run` that is NOT already an AiRuntimeError is wrapped
// into INVALID_PROVIDER_RESPONSE so provider-specific raw errors never escape
// the reliability boundary uncontrolled.
// ============================================================================

import { AiRuntimeError } from '../errors/ai-runtime-error.js';
import { isTransientError } from './classification.js';
import { sleep } from './timeout.js';

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export interface BoundedRetryOptions {
  readonly policy: RetryPolicy;
  readonly signal?: AbortSignal;
  readonly onRetry?: (lastError: AiRuntimeError, attempt: number, delayMs: number) => void;
}

export async function withBoundedRetry<T>(
  run: () => Promise<T>,
  options: BoundedRetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = options.policy;
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      const classified =
        error instanceof AiRuntimeError
          ? error
          : new AiRuntimeError(
              'INVALID_PROVIDER_RESPONSE',
              'Provider failed with an error outside the runtime taxonomy',
              { cause: error },
            );

      if (!isTransientError(classified)) throw classified;

      attempt += 1;
      if (attempt > maxRetries) {
        throw new AiRuntimeError(
          'RETRY_EXHAUSTED',
          `Transient provider failure persisted after ${maxRetries} retr${maxRetries === 1 ? 'y' : 'ies'}`,
          { cause: classified },
        );
      }

      let delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      if (classified.retryAfterMs !== undefined) {
        delayMs = Math.min(classified.retryAfterMs, maxDelayMs);
      }

      options.onRetry?.(classified, attempt, delayMs);
      await sleep(delayMs, options.signal);
    }
  }
}