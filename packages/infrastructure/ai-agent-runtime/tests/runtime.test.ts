import { describe, expect, it, afterEach, vi } from 'vitest';
import { z } from 'zod';

import { createAiRuntime } from '../src/core/runtime.js';
import { AiRuntimeError } from '../src/errors/ai-runtime-error.js';
import { testConfig, jsonResponse } from './support.js';

const SchemaV1 = z.object({ verdict: z.enum(['open', 'closed']) });

function ollamaChat(overrides?: Record<string, unknown>) {
  return jsonResponse({
    model: 'm',
    message: { role: 'assistant', content: 'The analysis result text' },
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 5,
    eval_count: 7,
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAiRuntime', () => {
  it('generates text with rich execution metadata from an empty config', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ollamaChat()));
    const runtime = createAiRuntime();
    const result = await runtime.generate({ model: 'm', promptVersion: 'pv', policyVersion: 'pv2' });

    expect(runtime.config.provider).toBe('ollama');
    expect(result.text).toBe('The analysis result text');
    expect(result.metadata.provider).toBe('ollama');
    expect(result.metadata.model).toBe('m');
    expect(result.metadata.runtimePolicyVersion).toBe('v1');
    expect(result.metadata.finishReason).toBe('stop');
    expect(result.metadata.inputTokens).toBe(5);
    expect(result.metadata.outputTokens).toBe(7);
    expect(result.metadata.totalTokens).toBe(12);
    expect(result.metadata.promptVersion).toBe('pv');
    expect(result.metadata.policyVersion).toBe('pv2');
    expect(result.metadata.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(new Date(result.metadata.startedAt).getTime()).toBeLessThanOrEqual(
      new Date(result.metadata.completedAt).getTime(),
    );
  });

  it('records bounded retries in both events and metadata', async () => {
    const events: unknown[] = [];
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValue(ollamaChat());
    vi.stubGlobal('fetch', mock);

    const runtime = createAiRuntime(
      testConfig({ budgets: { ...testConfig().budgets, maxRetries: 2, retryBaseDelayMs: 1, maxRetryDelayMs: 5 } }),
      { onEvent: (event) => events.push(event) },
    );
    const result = await runtime.generate({ model: 'm' });

    expect(mock).toHaveBeenCalledTimes(3);
    expect(result.metadata.retryCount).toBe(2);
    const retryEvents = events.filter((event) => (event as { kind?: string }).kind === 'retry');
    expect(retryEvents).toHaveLength(2);
    const successEvent = events.find((event) => (event as { kind?: string }).kind === 'success') as {
      kind: string;
      retryCount: number;
    };
    expect(successEvent.retryCount).toBe(2);
  });

  it('surfaces RETRY_EXHAUSTED with the provider failure as cause', async () => {
    const events: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('down', { status: 503 })));
    const runtime = createAiRuntime(
      testConfig({ budgets: { ...testConfig().budgets, maxRetries: 1, retryBaseDelayMs: 1, maxRetryDelayMs: 5 } }),
      { onEvent: (event) => events.push(event) },
    );

    await expect(runtime.generate({ model: 'm' })).rejects.toMatchObject({
      code: 'RETRY_EXHAUSTED',
    });
    const failureEvent = events.find((event) => (event as { kind?: string }).kind === 'failure') as {
      kind: string;
      errorCode: string;
    };
    expect(failureEvent.errorCode).toBe('RETRY_EXHAUSTED');
  });

  it('generateStructured validates against the caller schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ollamaChat({ message: { role: 'assistant', content: '{"verdict":"open"}' } })),
    );
    const runtime = createAiRuntime(testConfig());
    const result = await runtime.generateStructured({ model: 'm', schemaVersion: 's1' }, SchemaV1);
    expect(result.data).toEqual({ verdict: 'open' });
    expect(result.rawText).toBe('{"verdict":"open"}');
    expect(result.metadata.schemaVersion).toBe('s1');
  });

  it('rejects structured output that fails zod validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ollamaChat({ message: { role: 'assistant', content: '{"verdict":"maybe"}' } })),
    );
    const runtime = createAiRuntime(testConfig());
    await expect(runtime.generateStructured({ model: 'm' }, SchemaV1)).rejects.toMatchObject({
      code: 'SCHEMA_VALIDATION_FAILED',
    });
  });

  it('rejects structured output that is not JSON at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ollamaChat({ message: { role: 'assistant', content: 'definitely not json' } })),
    );
    const runtime = createAiRuntime(testConfig());
    await expect(runtime.generateStructured({ model: 'm' }, SchemaV1)).rejects.toMatchObject({
      code: 'STRUCTURED_OUTPUT_INVALID',
    });
  });

  it('rejects oversized context BEFORE any provider call', async () => {
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    const runtime = createAiRuntime(testConfig());
    await expect(
      runtime.generate({
        model: 'm',
        systemPrompt: 'x'.repeat(runtime.config.budgets.maxInputChars + 1),
      }),
    ).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
    expect(mock).not.toHaveBeenCalled();
  });

  it('rejects cross-provider request targetting', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const runtime = createAiRuntime(testConfig({ provider: 'ollama' }));
    await expect(runtime.generate({ model: 'm', provider: 'gemini' })).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
    });
  });

  it('cancels with ABORTED when the caller signal is already aborted', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const controller = new AbortController();
    controller.abort();
    const runtime = createAiRuntime(testConfig());
    await expect(runtime.generate({ model: 'm', signal: controller.signal })).rejects.toMatchObject({
      code: 'ABORTED',
    });
  });

  it('exposes capabilities and a healthCheck passthrough', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: 'llama3.2' }] })),
    );
    const runtime = createAiRuntime(testConfig());
    expect(runtime.capabilities).toEqual({ generate: true, generateStructured: true, healthCheck: true });
    const health = await runtime.healthCheck();
    expect(health).toMatchObject({ provider: 'ollama', healthy: true });
  });

  it('throws provider failures as typed errors only', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 400 })));
    const runtime = createAiRuntime(testConfig());
    try {
      await runtime.generate({ model: 'm' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AiRuntimeError);
      expect((error as AiRuntimeError).code).toBe('INVALID_PROVIDER_RESPONSE');
    }
  });
});