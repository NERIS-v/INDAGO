// ============================================================================
// Timeout + sleep primitives (@indago/ai-agent-runtime)
//
// Every provider call runs under a hard timeout (AbortSignal.timeout combined
// with an optional caller signal). Backoff sleeps are cancelable so an aborted
// caller never waits out a delay.
// ============================================================================

import { AiRuntimeError } from '../errors/ai-runtime-error.js';

/**
 * AbortSignal that fires when the timeout elapses OR the caller aborts.
 * Caller-abort takes precedence (an already-aborted signal means immediate).
 */
export function createAbortSignalWithTimeout(
  timeoutMs: number,
  callerSignal?: AbortSignal,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeoutSignal;
  if (callerSignal.aborted) return AbortSignal.abort();
  return AbortSignal.any([timeoutSignal, callerSignal]);
}

/** Cancelable sleep used by the backoff loop. Rejects with ABORTED on abort. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new AiRuntimeError('ABORTED', 'LLM request was cancelled before backoff'));
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = (): void => {
      clearTimeout(timer);
      cleanup();
      reject(new AiRuntimeError('ABORTED', 'LLM request was cancelled during backoff'));
    };
    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}