import { describe, expect, it, afterEach, vi } from 'vitest';
import { z } from 'zod';

import { createAiRuntime } from '../src/core/runtime.js';
import { createLLMProvider } from '../src/providers/factory.js';
import { testConfig, jsonResponse } from './support.js';

const AnalysisV1 = z.object({
  verdict: z.enum(['open', 'closed']),
  entities: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

const GENERIC_REQUEST = {
  model: 'shared-model',
  systemPrompt: 'You are an analytical assistant. Never invent facts.',
  messages: [{ role: 'user' as const, content: 'Analyze the following report: ...' }],
  promptVersion: 'analysis-v1',
  schemaVersion: 'analysis-schema-v1',
};

/** One fetch mock that serves BOTH provider wire formats based on the URL. */
function dualFetch(geminiJson: unknown, ollamaJson: unknown) {
  return vi.fn().mockImplementation(async (input: string) => {
    if (input.includes(':generateContent')) {
      return jsonResponse({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(geminiJson) }] }, finishReason: 'STOP' },
        ],
        modelVersion: 'gemini-model-001',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8, totalTokenCount: 18 },
      });
    }
    if (input.endsWith('/api/chat')) {
      return jsonResponse({
        model: 'shared-model',
        message: { role: 'assistant', content: JSON.stringify(ollamaJson) },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 10,
        eval_count: 8,
      });
    }
    throw new Error(`unexpected URL: ${input}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provider interchangeability', () => {
  it('the same generic structured request produces the same typed result from Gemini and Ollama', async () => {
    const expected = { verdict: 'open', entities: ['acme'], confidence: 0.6 };
    vi.stubGlobal('fetch', dualFetch(expected, expected));

    const geminiRuntime = createAiRuntime(
      testConfig({ provider: 'gemini' }),
    );
    const ollamaRuntime = createAiRuntime(
      testConfig({ provider: 'ollama' }),
    );

    const fromGemini = await geminiRuntime.generateStructured(GENERIC_REQUEST, AnalysisV1);
    const fromOllama = await ollamaRuntime.generateStructured(GENERIC_REQUEST, AnalysisV1);

    expect(fromGemini.data).toEqual(expected);
    expect(fromOllama.data).toEqual(expected);
    expect(fromGemini.data).toEqual(fromOllama.data);

    expect(fromGemini.metadata.provider).toBe('gemini');
    expect(fromOllama.metadata.provider).toBe('ollama');
    expect(fromGemini.metadata.runtimePolicyVersion).toBe('v1');
    expect(fromOllama.metadata.runtimePolicyVersion).toBe('v1');
    expect(fromGemini.metadata.schemaVersion).toBe('analysis-schema-v1');
    expect(fromGemini.metadata.promptVersion).toBe('analysis-v1');
  });

  it('consumers need zero provider-specific branches for execution behavior', async () => {
    const textBody = { verdict: 'closed', entities: ['beta'], confidence: 0.9 };
    vi.stubGlobal('fetch', dualFetch(textBody, textBody));

    const consumers = [testConfig({ provider: 'gemini' }), testConfig({ provider: 'ollama' })];
    let counter = 0;
    for (const config of consumers) {
      const runtime = createAiRuntime(config);
      const result = await runtime.generateStructured({ ...GENERIC_REQUEST, model: 'm' }, AnalysisV1);
      expect(result.data.verdict).toBe('closed');
      counter += 1;
    }
    expect(counter).toBe(2);
  });

  it('both providers normalize the SAME transient failure to the SAME error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('down', { status: 503 })),
    );

    for (const provider of ['gemini', 'ollama'] as const) {
      const runtime = createAiRuntime(
        testConfig({ provider, budgets: { ...testConfig().budgets, maxRetries: 0 } }),
      );
      await expect(runtime.generate({ ...GENERIC_REQUEST, model: 'm' })).rejects.toMatchObject({
        code: 'RETRY_EXHAUSTED',
      });
    }
  });

  it('the factory builds providers deterministically and identically from a config', () => {
    const gemini = createLLMProvider(testConfig({ provider: 'gemini' }));
    const ollama = createLLMProvider(testConfig({ provider: 'ollama' }));
    expect(gemini.capabilities).toEqual({ generate: true, generateStructured: true, healthCheck: true });
    expect(ollama.capabilities).toEqual({ generate: true, generateStructured: true, healthCheck: true });
  });
});