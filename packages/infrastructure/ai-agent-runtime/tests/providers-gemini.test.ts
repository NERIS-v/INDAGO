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

function geminiResponse(overrides?: Record<string, unknown>) {
  return jsonResponse({
    candidates: [
      {
        content: { parts: [{ text: 'Analysis result' }], role: 'model' },
        finishReason: 'STOP',
      },
    ],
    modelVersion: 'gemini-2.5-flash-001',
    usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12, totalTokenCount: 52 },
    responseMetadata: { requestId: 'r-1234' },
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeminiProvider', () => {
  it('calls the generateContent endpoint with the API key in the header', async () => {
    const mock = vi.fn().mockResolvedValue(geminiResponse());
    vi.stubGlobal('fetch', mock);
    const provider = new GeminiProvider(CONFIG);
    const result = await provider.generate(request());
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as readonly [string, RequestInit];
    expect(url).toContain(`models/${MODEL}:generateContent`);
    expect(init.headers).toMatchObject({
      'x-goog-api-key': SECRET,
    });
    expect(result.text).toBe('Analysis result');
    expect(result.finishReason).toBe('stop');
    expect(result.modelVersion).toBe('gemini-2.5-flash-001');
    expect(result.requestId).toBe('r-1234');
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 12, totalTokens: 52 });
  });

  it('sets responseMimeType to application/json when the request forces JSON mode', async () => {
    const mock = vi.fn().mockResolvedValue(geminiResponse());
    vi.stubGlobal('fetch', mock);
    const provider = new GeminiProvider(CONFIG);
    await provider.generate(request({ responseFormat: 'json' }));
    const body = JSON.parse(String((mock.mock.calls[0] as readonly [string, RequestInit])[1]?.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('sends temperature and maxOutputTokens in generationConfig', async () => {
    const mock = vi.fn().mockResolvedValue(geminiResponse());
    vi.stubGlobal('fetch', mock);
    const provider = new GeminiProvider(CONFIG);
    await provider.generate(request({ temperature: 0.42, maxOutputTokens: 512 }));
    const body = JSON.parse(String((mock.mock.calls[0] as readonly [string, RequestInit])[1]?.body));
    expect(body.generationConfig.temperature).toBe(0.42);
    expect(body.generationConfig.maxOutputTokens).toBe(512);
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

  it('returns raw text for JSON-mode requests (schema validation is the runtime job)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(geminiResponse({ candidates: [{ content: { parts: [{ text: 'not json' }] }, finishReason: 'STOP' }] })),
    );
    const result = await new GeminiProvider(CONFIG).generate(request({ responseFormat: 'json' }));
    expect(result.text).toBe('not json');
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