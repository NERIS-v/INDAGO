import { describe, expect, it } from 'vitest';

import { resolveRequest } from '../src/budgets/validate.js';
import type { ResolutionContext } from '../src/budgets/validate.js';
import { DEFAULT_AI_BUDGETS } from '../src/budgets/limits.js';
import { testConfig, thrownCode } from './support.js';

const BUDGETS = { ...DEFAULT_AI_BUDGETS, maxInputChars: 1_000, maxRequestMessages: 4 };

function ctx(overrides?: Partial<ReturnType<typeof testConfig>>): ResolutionContext {
  const config = testConfig({ budgets: BUDGETS, ...overrides });
  return {
    provider: config.provider,
    defaultModel: config.ollama.defaultModel ?? config.defaultModel,
    budgets: config.budgets,
  };
}

describe('resolveRequest', () => {
  it('fills defaults: model via config, text format, bounded output + timeout', () => {
    const resolved = resolveRequest(
      { messages: [{ role: 'user', content: 'hi' }] },
      ctx({ defaultModel: 'dm' }),
    );
    expect(resolved.model).toBe('dm');
    expect(resolved.responseFormat).toBe('text');
    expect(resolved.maxOutputTokens).toBe(BUDGETS.maxOutputTokens);
    expect(resolved.timeoutMs).toBe(BUDGETS.timeoutMs);
    expect(resolved.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('uses the request model over the default', () => {
    const resolved = resolveRequest({ model: 'explicit' }, ctx({ defaultModel: 'dm' }));
    expect(resolved.model).toBe('explicit');
  });

  it('rejects a request with no model when none is configured', () => {
    expect(thrownCode(() => resolveRequest({}, ctx()))).toBe('CONFIGURATION_ERROR');
  });

  it('rejects a provider mismatch — no implicit switching', () => {
    expect(thrownCode(() => resolveRequest({ model: 'm', provider: 'gemini' }, ctx()))).toBe(
      'CONFIGURATION_ERROR',
    );
  });

  it('rejects oversized context with INPUT_TOO_LARGE (system + messages)', () => {
    const run = () =>
      resolveRequest(
        {
          model: 'm',
          systemPrompt: 'x'.repeat(900),
          messages: [{ role: 'user', content: 'x'.repeat(200) }],
        },
        ctx(),
      );
    expect(thrownCode(run)).toBe('INPUT_TOO_LARGE');
  });

  it('rejects too many messages with INPUT_TOO_LARGE', () => {
    const messages = Array.from({ length: 5 }, (_, index) => ({
      role: 'user' as const,
      content: `m${index}`,
    }));
    expect(thrownCode(() => resolveRequest({ model: 'm', messages }, ctx()))).toBe('INPUT_TOO_LARGE');
  });

  it('rejects output requests above the configured bound with OUTPUT_LIMIT_EXCEEDED', () => {
    expect(
      thrownCode(() => resolveRequest({ model: 'm', maxOutputTokens: BUDGETS.maxOutputTokens + 1 }, ctx())),
    ).toBe('OUTPUT_LIMIT_EXCEEDED');
  });

  it('rejects invalid maxOutputTokens and temperature', () => {
    for (const maxOutputTokens of [0, -1, 1.5, Number.NaN]) {
      expect(thrownCode(() => resolveRequest({ model: 'm', maxOutputTokens }, ctx()))).toBe(
        'CONFIGURATION_ERROR',
      );
    }
    for (const temperature of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(thrownCode(() => resolveRequest({ model: 'm', temperature }, ctx()))).toBe(
        'CONFIGURATION_ERROR',
      );
    }
  });

  it('caps a caller timeout at the budget ceiling and rejects degenerate ones', () => {
    expect(resolveRequest({ model: 'm', timeoutMs: BUDGETS.timeoutMs * 10 }, ctx()).timeoutMs).toBe(
      BUDGETS.timeoutMs,
    );
    expect(resolveRequest({ model: 'm', timeoutMs: 123 }, ctx()).timeoutMs).toBe(123);
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(thrownCode(() => resolveRequest({ model: 'm', timeoutMs }, ctx()))).toBe(
        'CONFIGURATION_ERROR',
      );
    }
  });

  it('rejects a pre-aborted signal with ABORTED', () => {
    const controller = new AbortController();
    controller.abort();
    expect(thrownCode(() => resolveRequest({ model: 'm', signal: controller.signal }, ctx()))).toBe(
      'ABORTED',
    );
  });
});