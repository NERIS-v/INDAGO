import { describe, expect, it, afterEach, vi } from 'vitest';

import { GeminiProvider } from '../src/providers/gemini.js';
import type { ResolvedLLMRequest } from '../src/core/types.js';
import { testConfig, jsonResponse } from './support.js';

const SECRET = 'AIzaTestKeyForGemini';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash';
const CONFIG = { baseUrl: BASE, apiKey: SECRET, timeoutMs: 10_000 };

function request(overrides?: Partial<ResolvedLLMRequest>): ResolvedLLMRequest {
  return {
    provider: 'gemini',
    model: MODEL,
    messages: [{ role: 'user', content: 'Analyze this.' }],
    responseFormat: 'text',
    maxOutputTokens: 1024,
    timeoutMs: 5_000,
    ...overrides,
    budgets: testConfig().budgets,
  };
}

function interactionResponse(overrides?: Record<string, unknown>) {
  return jsonResponse({
    id: 'int_123',
    model: 'gemini-2.5-flash-001',
    object: 'interaction',
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Analysis result' }] }],
    usage: { total_input_tokens: 40, total_output_tokens: 12, total_tokens: 52 },
    ...overrides,
  });
}

function captureBody(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [url, init] = mock.mock.calls[0] as readonly [string, RequestInit];
  return { url, ...(JSON.parse(String(init?.body)) as Record<string, unknown>) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeminiProvider', () => {
  it('calls the Interactions endpoint with the API key in the header and normalizes the response', async () => {
    const mock = vi.fn().mockResolvedValue(interactionResponse());
    vi.stubGlobal('fetch', mock);
    const provider = new GeminiProvider(CONFIG);
    const result = await provider.generate(request());
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as readonly [string, RequestInit];
    expect(url).toBe(`${BASE}/interactions`);
    expect(init.headers).toMatchObject({
      'x-goog-api-key': SECRET,
    });
    expect(result.text).toBe('Analysis result');
    expect(result.finishReason).toBe('stop');
    expect(result.modelVersion).toBe('gemini-2.5-flash-001');
    expect(result.requestId).toBe('int_123');
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 12, totalTokens: 52 });
  });

  it('sends the provider-native JSON Schema verbatim in response_format for a structured call', async () => {
    const schema = {
      type: 'object',
      properties: { verdict: { type: 'string', enum: ['open', 'closed'] } },
      required: ['verdict'],
    };
    const mock = vi.fn().mockResolvedValue(
      interactionResponse({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"verdict":"open"}' }] }] }),
    );
    vi.stubGlobal('fetch', mock);
    await new GeminiProvider(CONFIG).generate(request({ jsonSchema: schema }));

    const body = captureBody(mock);
    expect(body.response_format).toEqual({
      type: 'text',
      mime_type: 'application/json',
      schema,
    });
  });

  it('sends a schema-less JSON mode hint when responseFormat json has no schema', async () => {
    const mock = vi.fn().mockResolvedValue(interactionResponse());
    vi.stubGlobal('fetch', mock);
    await new GeminiProvider(CONFIG).generate(request({ responseFormat: 'json' }));

    const body = captureBody(mock);
    expect(body.response_format).toEqual({ type: 'text', mime_type: 'application/json' });
  });

  it('omits response_format for plain text generation', async () => {
    const mock = vi.fn().mockResolvedValue(interactionResponse());
    vi.stubGlobal('fetch', mock);
    await new GeminiProvider(CONFIG).generate(request());

    const body = captureBody(mock);
    expect(body.response_format).toBeUndefined();
  });

  it('builds stateless multi-turn steps and a system_instruction string', async () => {
    const mock = vi.fn().mockResolvedValue(interactionResponse());
    vi.stubGlobal('fetch', mock);
    await new GeminiProvider(CONFIG).generate(
      request({
        systemPrompt: 'system rules',
        messages: [
          { role: 'system', content: 'another rule' },
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'again' },
        ],
      }),
    );

    const body = captureBody(mock);
    expect(body.input).toEqual([
      { type: 'user_input', content: [{ type: 'text', text: 'hi' }] },
      { type: 'model_output', content: [{ type: 'text', text: 'hello' }] },
      { type: 'user_input', content: [{ type: 'text', text: 'again' }] },
    ]);
    expect(body.system_instruction).toBe('system rules\nanother rule');
  });

  it('sends generation_config with snake_case keys and omits it when empty', async () => {
    const mock = vi.fn().mockResolvedValue(interactionResponse());
    vi.stubGlobal('fetch', mock);
    await new GeminiProvider(CONFIG).generate(request({ temperature: 0.42, maxOutputTokens: 512 }));

    const body = captureBody(mock);
    expect(body.generation_config).toEqual({ temperature: 0.42, max_output_tokens: 512 });

    const bareFetch = vi.fn().mockResolvedValue(interactionResponse());
    vi.stubGlobal('fetch', bareFetch);
    await new GeminiProvider(CONFIG).generate(request({ temperature: undefined, maxOutputTokens: 0 }));
    const bare = captureBody(bareFetch);
    expect(bare.generation_config).toBeUndefined();
  });

  it('extracts text only from model_output steps and rejects responses with no readable text', async () => {
    const mock = vi.fn().mockResolvedValue(
      interactionResponse({
        steps: [
          { type: 'function_call', name: 'f', arguments: '{}' },
          { type: 'model_output', content: [{ type: 'text', text: 'part one ' }, { type: 'text', text: 'part two' }] },
        ],
      }),
    );
    vi.stubGlobal('fetch', mock);
    const result = await new GeminiProvider(CONFIG).generate(request());
    expect(result.text).toBe('part one part two');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(interactionResponse({ steps: [{ type: 'function_call', name: 'f' }] })),
    );
    await expect(new GeminiProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE',
    });
  });

  it('normalizes a 429 rate-limit into RATE_LIMITED with a Retry-After hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('rate limited', { status: 429, headers: { 'retry-after': '2' } }),
      ),
    );
    const provider = new GeminiProvider(CONFIG);
    await expect(provider.generate(request())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterMs: 2_000,
    });
  });

  it('normalizes HTTP 401/403 into AUTHENTICATION_FAILED (non-transient)', async () => {
    for (const status of [401, 403]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('auth error', { status })),
      );
      await expect(new GeminiProvider(CONFIG).generate(request())).rejects.toMatchObject({
        code: 'AUTHENTICATION_FAILED',
      });
    }
  });

  it('normalizes HTTP 404 into INVALID_PROVIDER_RESPONSE (non-transient)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not found', { status: 404 })),
    );
    await expect(new GeminiProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE',
    });
  });

  it('normalizes HTTP 400 and other 4xx into INVALID_PROVIDER_RESPONSE', async () => {
    for (const status of [400, 418, 451]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('bad request', { status })),
      );
      await expect(new GeminiProvider(CONFIG).generate(request())).rejects.toMatchObject({
        code: 'INVALID_PROVIDER_RESPONSE',
      });
    }
  });

  it('normalizes HTTP 5xx and 408 into provider-unavailable/request-timeout (transient)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gateway down', { status: 503 })));
    await expect(new GeminiProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('timeout', { status: 408 })));
    await expect(new GeminiProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
  });

  it('refuses to degrade a structured call without native schema support (defense-in-depth)', async () => {
    const provider = new GeminiProvider(CONFIG);
    const degraded = request({ jsonSchema: { type: 'object' } });
    (
      provider as { capabilities: { structured: { nativeJsonSchema: boolean } } }
    ).capabilities.structured.nativeJsonSchema = false;
    await expect(provider.generate(degraded)).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
    });
  });

  it('normalizes fetch network errors into AiRuntimeError codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('connection refused'), { name: 'TypeError' })),
    );
    await expect(new GeminiProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
    );
    await expect(new GeminiProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });

    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    await expect(
      new GeminiProvider(CONFIG).generate(request({ signal: controller.signal })),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('healthCheck reports model availability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ models: [{ name: `models/${MODEL}` }, { name: 'models/gemini-1.0-pro' }] }),
      ),
    );
    const provider = new GeminiProvider(CONFIG);
    expect(await provider.healthCheck()).toEqual(
      expect.objectContaining({ healthy: true, model: CONFIG.defaultModel ?? '' }),
    );
    expect(
      await new GeminiProvider({ ...CONFIG, defaultModel: 'nonexistent' }).healthCheck(),
    ).toEqual(expect.objectContaining({ healthy: false }));
  });
});