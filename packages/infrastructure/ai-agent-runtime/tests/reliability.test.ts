import { describe, expect, it } from 'vitest';

import { AiRuntimeError } from '../src/errors/ai-runtime-error.js';
import {
  TRANSIENT_AI_RUNTIME_ERROR_CODES,
  isTransientError,
} from '../src/reliability/classification.js';
import { withBoundedRetry } from '../src/reliability/retry.js';
import type { RetryPolicy } from '../src/reliability/retry.js';
import { thrownCode } from './support.js';

const POLICY: RetryPolicy = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1_000 };

function transient(code: 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED' | 'REQUEST_TIMEOUT' = 'PROVIDER_UNAVAILABLE', retryAfterMs?: number): AiRuntimeError {
  return new AiRuntimeError(code, 'transient', { retryAfterMs });
}

describe('classification', () => {
  it('marks only transport-ish failures as transient', () => {
    expect(TRANSIENT_AI_RUNTIME_ERROR_CODES).toEqual(
      new Set(['PROVIDER_UNAVAILABLE', 'RATE_LIMITED', 'REQUEST_TIMEOUT']),
    );
    expect(isTransientError(transient('PROVIDER_UNAVAILABLE'))).toBe(true);
    expect(isTransientError(transient('RATE_LIMITED'))).toBe(true);
    expect(isTransientError(transient('REQUEST_TIMEOUT'))).toBe(true);
    expect(isTransientError(new AiRuntimeError('AUTHENTICATION_FAILED', 'nope'))).toBe(false);
    expect(isTransientError(new AiRuntimeError('INVALID_PROVIDER_RESPONSE', 'nope'))).toBe(false);
    expect(isTransientError(new AiRuntimeError('SCHEMA_VALIDATION_FAILED', 'nope'))).toBe(false);
    expect(isTransientError(new TypeError('boom'))).toBe(false);
  });
});

describe('withBoundedRetry', () => {
  it('retries transient failures with exponential backoff until success', async () => {
    const delays: number[] = [];
    let calls = 0;
    const value = await withBoundedRetry(
      () => {
        calls += 1;
        if (calls < 3) throw transient();
        return Promise.resolve('ok');
      },
      { policy: POLICY, onRetry: (_error, _attempt, delayMs) => delays.push(delayMs) },
    );
    expect(value).toBe('ok');
    expect(calls).toBe(3);
    expect(delays).toEqual([100, 200]);
  });

  it('does not retry non-transient failures', async () => {
    const onRetry = vi.fn();
    await expect(
      withBoundedRetry(
        () => Promise.reject(new AiRuntimeError('AUTHENTICATION_FAILED', 'denied')),
        { policy: POLICY, onRetry },
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('throws RETRY_EXHAUSTED after the bound, carrying the last provider error', async () => {
    let exhausted: unknown;
    try {
      await withBoundedRetry(() => Promise.reject(transient('RATE_LIMITED')), { policy: POLICY });
    } catch (caught) {
      exhausted = caught;
    }
    expect(exhausted).toBeInstanceOf(AiRuntimeError);
    expect((exhausted as AiRuntimeError).code).toBe('RETRY_EXHAUSTED');
    expect((exhausted as AiRuntimeError).cause).toBeInstanceOf(AiRuntimeError);
    expect(((exhausted as AiRuntimeError).cause as AiRuntimeError).code).toBe('RATE_LIMITED');
  });

  it('honors a provider Retry-After hint within the delay ceiling', async () => {
    const delays: number[] = [];

    let calls = 0;
    await withBoundedRetry(
      () => {
        calls += 1;
        if (calls === 1) throw transient('RATE_LIMITED', 50);
        return Promise.resolve('ok');
      },
      { policy: POLICY, onRetry: (_error, _attempt, delayMs) => delays.push(delayMs) },
    );
    expect(delays).toEqual([50]);

    delays.length = 0;
    calls = 0;
    await withBoundedRetry(
      () => {
        calls += 1;
        if (calls === 1) throw transient('RATE_LIMITED', 5_000_000);
        return Promise.resolve('ok');
      },
      { policy: POLICY, onRetry: (_error, _attempt, delayMs) => delays.push(delayMs) },
    );
    expect(delays[0]).toBe(POLICY.maxDelayMs);
  });

  it('aborts backoff when the caller signal fires', async () => {
    const controller = new AbortController();
    const small = { ...POLICY, maxRetries: 5 };
    const promise = withBoundedRetry(
      () => Promise.reject(transient()),
      { policy: small, signal: controller.signal },
    ).then(
      () => 'resolved',
      (error) => `rejected:${error instanceof AiRuntimeError ? error.code : ''}`,
    );
    setTimeout(() => controller.abort(), 15);
    await expect(promise).resolves.toBe('rejected:ABORTED');
  });

  it('wraps raw non-runtime errors and does not retry them', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const code = await withBoundedRetry(
      () => {
        calls += 1;
        return Promise.reject(new TypeError('unexpected provider bug'));
      },
      { policy: POLICY, onRetry },
    ).then(
      () => 'resolved',
      (error) => (error instanceof AiRuntimeError ? error.code : 'RAW'),
    );
    expect(code).toBe('INVALID_PROVIDER_RESPONSE');
    expect(calls).toBe(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});