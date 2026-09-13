import { describe, expect, it, afterEach, vi } from 'vitest';

import { OllamaGenerationProvider } from '../src/providers/ollama.js';
import type { ResolvedLLMRequest } from '../src/core/types.js';
import { testConfig, jsonResponse } from './support.js';

const CONFIG = { baseUrl: 'http://localhost:11434', timeoutMs: 10_000 };

function request(overrides?: Partial<ResolvedLLMRequest>): ResolvedLLMRequest {
  return {
    provider: 'ollama',
    model: 'llama3.2',
    messages: [{ role: 'user', content: 'Analyze this.' }],
    responseFormat: 'text',
    maxOutputTokens: 1024,
    timeoutMs: 5_000,
    ...overrides,
    budgets: testConfig().budgets,
  };
}

function ollamaResponse(overrides?: Record<string, unknown>) {
  return jsonResponse({
    model: 'llama3.2',
    message: { role: 'assistant', content: 'Ollama answer' },
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 40,
    eval_count: 12,
    total_duration: 123_000_000,
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OllamaGenerationProvider', () => {
  it('calls /api/chat and normalizes the response', async () => {
    const mock = vi.fn().mockResolvedValue(ollamaResponse());
    vi.stubGlobal('fetch', mock);
    const provider = new OllamaGenerationProvider(CONFIG);
    const result = await provider.generate(request());
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as readonly [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(result.text).toBe('Ollama answer');
    expect(result.finishReason).toBe('stop');
    expect(result.modelVersion).toBe('llama3.2');
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 12, totalTokens: 52 });
  });

  it('orders messages as system-then-conversation and sets num_predict', async () => {
    const mock = vi.fn().mockResolvedValue(ollamaResponse());
    vi.stubGlobal('fetch', mock);
    const provider = new OllamaGenerationProvider(CONFIG);
    await provider.generate(
      request({
        systemPrompt: 'system rules',
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
        maxOutputTokens: 256,
        temperature: 0.3,
      }),
    );
    const body = JSON.parse(String((mock.mock.calls[0] as readonly [string, RequestInit])[1]?.body));
    expect(body.messages).toEqual([
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    expect(body.options.num_predict).toBe(256);
    expect(body.options.temperature).toBe(0.3);
    expect(body.stream).toBe(false);
  });

  it('uses format json for JSON-mode requests', async () => {
    const mock = vi.fn().mockResolvedValue(ollamaResponse());
    vi.stubGlobal('fetch', mock);
    await new OllamaGenerationProvider(CONFIG).generate(request({ responseFormat: 'json' }));
    const body = JSON.parse(String((mock.mock.calls[0] as readonly [string, RequestInit])[1]?.body));
    expect(body.format).toBe('json');
  });

  it('maps length done_reason to the length finish reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ollamaResponse({ done_reason: 'length' })),
    );
    const result = await new OllamaGenerationProvider(CONFIG).generate(request());
    expect(result.finishReason).toBe('length');
  });

  it('normalizes errors: 429 rate-limit, 404 model-missing, 4xx invalid, 5xx unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('slow down', { status: 429, headers: { 'retry-after': '1' } })),
    );
    await expect(new OllamaGenerationProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterMs: 1_000,
    });

    for (const status of [404, 400]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status })));
      await expect(new OllamaGenerationProvider(CONFIG).generate(request())).rejects.toMatchObject({
        code: 'INVALID_PROVIDER_RESPONSE',
      });
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    await expect(new OllamaGenerationProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('maps network failures: timeout → REQUEST_TIMEOUT, refused → PROVIDER_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
    );
    await expect(new OllamaGenerationProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { name: 'TypeError' })),
    );
    await expect(new OllamaGenerationProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('returns empty text when the message payload is missing or malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ done: true })));
    const result = await new OllamaGenerationProvider(CONFIG).generate(request());
    expect(result.text).toBe('');
  });

  it('rejects a non-JSON provider payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('html garbage', { status: 200 })));
    await expect(new OllamaGenerationProvider(CONFIG).generate(request())).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE',
    });
  });

  it('healthCheck probes /api/tags for the configured model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: 'llama3.2' }, { name: 'nomic-embed-text:latest' }] })),
    );
    const provider = new OllamaGenerationProvider({ ...CONFIG, defaultModel: 'llama3.2' });
    const healthy = await provider.healthCheck();
    expect(healthy).toMatchObject({ provider: 'ollama', model: 'llama3.2', healthy: true });
    const missing = await new OllamaGenerationProvider({ ...CONFIG, defaultModel: 'gpt-x' }).healthCheck();
    expect(missing).toMatchObject({ healthy: false });
  });
});