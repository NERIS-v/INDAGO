import { describe, expect, it, afterEach } from 'vitest';
import { z } from 'zod';

import { AiRuntimeError } from '../src/errors/ai-runtime-error.js';
import { createLLMProvider } from '../src/providers/factory.js';
import { createAiRuntime } from '../src/core/runtime.js';
import { parseStructured } from '../src/structured-output/validate.js';
import { TEST_GEMINI_KEY, flattenError, jsonResponse, testConfig, thrownCode } from './support.js';

const SECRET = TEST_GEMINI_KEY;

function captureFetch(): import('vitest').Mock {
  const mock = vi.fn();
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('secret safety', () => {
  it("refuses to build a gemini provider without an API key (CONFIGURATION_ERROR)", () => {
    const config = testConfig({ provider: 'gemini', gemini: { ...testConfig().gemini, apiKey: '' } });
    expect(thrownCode(() => createLLMProvider(config))).toBe('CONFIGURATION_ERROR');
  });

  it('refuses to construct a gemini runtime without an API key', () => {
    const config = testConfig({ provider: 'gemini', gemini: { ...testConfig().gemini, apiKey: '' } });
    expect(thrownCode(() => createAiRuntime(config))).toBe('CONFIGURATION_ERROR');
  });

  it('never includes the API key in a transport error, even when the provider echoes it back', async () => {
    const fetchMock = captureFetch();
    fetchMock.mockResolvedValue(
      new Response(`{"error":{"message":"invalid key ${SECRET}"}}`, { status: 500 }),
    );

    const runtime = createAiRuntime(testConfig({ provider: 'gemini' }));
    try {
      await runtime.generate({ model: 'm', systemPrompt: `prefix ${SECRET}` });
    } catch (caught) {
      expect(String(caught)).not.toContain(SECRET);
      expect((caught as Error).stack ?? '').not.toContain(SECRET);
      expect(JSON.stringify(caught)).not.toContain(SECRET);
      expect(flattenError(caught)).not.toContain(SECRET);
    }
    expect(fetchMock).toHaveBeenCalled();
  });

  it('never includes the API key in a successful serialized result or metadata', async () => {
    const fetchMock = captureFetch();
    fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const userStep = (body.input ?? []).find((step: { type?: string }) => step.type === 'user_input');
      const text = userStep?.content?.[0]?.text ?? '';
      return jsonResponse({
        id: 'int_1',
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
        usage: { total_input_tokens: 3, total_output_tokens: 5, total_tokens: 8 },
      });
    });

    const config = testConfig({ provider: 'gemini' });
    const runtime = createAiRuntime(config);
    const result = await runtime.generate({
      model: 'm',
      systemPrompt: `sensitive ${SECRET}`,
      messages: [{ role: 'user', content: 'analysis' }],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET);
    expect(JSON.stringify(result.metadata)).not.toContain(SECRET);
  });

  it('never leaks the API key into observability events (success or failure)', async () => {
    const events: unknown[] = [];
    const fetchMock = captureFetch();
    fetchMock.mockResolvedValue(new Response('unexpected', { status: 500 }));
    const config = testConfig({ provider: 'gemini', budgets: { ...testConfig().budgets, maxRetries: 0 } });
    const runtime = createAiRuntime(config, { onEvent: (event) => events.push(event) });

    try {
      await runtime.generate({ model: 'm', systemPrompt: `secret ${SECRET}` });
    } catch {
      // expected
    }
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });

  it('auth errors carry no key material even when the underlying HTTP response mentions it', async () => {
    const fetchMock = captureFetch();
    fetchMock.mockImplementation(async () => {
      const response = new Response(`{"error":"API key ${SECRET} invalid"}`, {
        status: 401,
      });
      return response;
    });
    const config = testConfig({ provider: 'gemini' });
    const runtime = createAiRuntime(config);
    let caught: unknown;
    try {
      await runtime.generate({ model: 'm' });
    } catch (error) {
      caught = error;
    }
    expect((caught as AiRuntimeError).code).toBe('AUTHENTICATION_FAILED');
    for (const entry of [
      String(caught),
      (caught as Error).stack ?? '',
      JSON.stringify(caught),
      flattenError(caught),
    ]) {
      expect(entry).not.toContain(SECRET);
    }
  });

  it('structured output errors never echo received values that came back from the model', () => {
    const error = (() => {
      try {
        parseStructured(`{"answer":"${SECRET}"}`, z.object({ other: z.string() }));
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(AiRuntimeError);
    expect(flattenError(error)).not.toContain(SECRET);
  });

  it('structured calls never leak echoed secrets through the SCHEMA_VALIDATION_FAILED error', async () => {
    const fetchMock = captureFetch();
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).endsWith('/api/chat')) {
        return jsonResponse({
          message: { role: 'assistant', content: `{"verdict":"open","echo":"${SECRET}"}` },
          done: true,
          done_reason: 'stop',
        });
      }
      throw new Error(`unexpected URL: ${String(input)}`);
    });

    const StrictV1 = z.object({ verdict: z.enum(['open', 'closed']) }).strict();
    const runtime = createAiRuntime(testConfig({ provider: 'ollama' }));
    let caught: unknown;
    try {
      await runtime.generateStructured({ model: 'm' }, StrictV1);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AiRuntimeError);
    expect((caught as AiRuntimeError).code).toBe('SCHEMA_VALIDATION_FAILED');
    for (const entry of [String(caught), JSON.stringify(caught), flattenError(caught)]) {
      expect(entry).not.toContain(SECRET);
    }
  });
});