import { describe, expect, it } from 'vitest';

import { loadAiConfig } from '../src/config/load.js';
import { DEFAULT_AI_BUDGETS } from '../src/budgets/limits.js';

describe('loadAiConfig', () => {
  it('provides safe production defaults (ollama, no hardcoded model, bounded budgets)', () => {
    const config = loadAiConfig({});
    expect(config.provider).toBe('ollama');
    expect(config.defaultModel).toBeUndefined();
    expect(config.gemini.apiKey).toBe('');
    expect(config.gemini.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(config.ollama.baseUrl).toBe('http://localhost:11434');
    expect(config.budgets).toEqual(DEFAULT_AI_BUDGETS);
    expect(config.budgets.maxSchemaBytes).toBe(50_000);
    expect(config.policyVersion).toBe('v2');
  });

  it('honours env overrides, strips trailing slashes and trims secrets', () => {
    const config = loadAiConfig({
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: '  sk-1234  ',
      GEMINI_BASE_URL: 'https://example.test/v1beta///',
      OLLAMA_BASE_URL: 'http://localhost:11434/',
      AI_MAX_OUTPUT_TOKENS: '1024',
      AI_TIMEOUT_MS: '15000',
      AI_MAX_RETRIES: '3',
      AI_MAX_SCHEMA_BYTES: '2048',
    } as NodeJS.ProcessEnv);
    expect(config.provider).toBe('gemini');
    expect(config.gemini.apiKey).toBe('sk-1234');
    expect(config.gemini.baseUrl).toBe('https://example.test/v1beta');
    expect(config.ollama.baseUrl).toBe('http://localhost:11434');
    expect(config.budgets.maxOutputTokens).toBe(1024);
    expect(config.budgets.timeoutMs).toBe(15_000);
    expect(config.budgets.maxRetries).toBe(3);
    expect(config.budgets.maxSchemaBytes).toBe(2048);
    expect(config.gemini.timeoutMs).toBe(15_000);
  });

  it('falls AI_DEFAULT_MODEL through to the selected provider default', () => {
    const config = loadAiConfig({ AI_DEFAULT_MODEL: 'gemini-2.5-flash' } as NodeJS.ProcessEnv);
    expect(config.defaultModel).toBe('gemini-2.5-flash');
    expect(config.ollama.defaultModel).toBe('gemini-2.5-flash');
  });

  it('prefers the per-provider default model over the global default', () => {
    const config = loadAiConfig({
      AI_DEFAULT_MODEL: 'global-model',
      GEMINI_DEFAULT_MODEL: 'gemini-specific',
    } as NodeJS.ProcessEnv);
    expect(config.gemini.defaultModel).toBe('gemini-specific');
    expect(config.ollama.defaultModel).toBe('global-model');
  });

  it('rejects an unknown provider', () => {
    expect(() => loadAiConfig({ AI_PROVIDER: 'claude' } as NodeJS.ProcessEnv)).toThrow(TypeError);
  });

  it('rejects degenerate and out-of-range numeric configuration', () => {
    for (const key of ['AI_MAX_INPUT_CHARS', 'AI_MAX_OUTPUT_TOKENS', 'AI_TIMEOUT_MS', 'AI_MAX_SCHEMA_BYTES']) {
      expect(() => loadAiConfig({ [key]: 'abc' } as NodeJS.ProcessEnv)).toThrow(TypeError);
      expect(() => loadAiConfig({ [key]: '0' } as NodeJS.ProcessEnv)).toThrow(TypeError);
      expect(() => loadAiConfig({ [key]: '-5' } as NodeJS.ProcessEnv)).toThrow(TypeError);
      expect(() => loadAiConfig({ [key]: 'Infinity' } as NodeJS.ProcessEnv)).toThrow(TypeError);
      expect(() => loadAiConfig({ [key]: 'NaN' } as NodeJS.ProcessEnv)).toThrow(TypeError);
    }
    expect(() =>
      loadAiConfig({ AI_MAX_OUTPUT_TOKENS: '99999999999' } as NodeJS.ProcessEnv),
    ).toThrow(TypeError);
    expect(() => loadAiConfig({ AI_MAX_RETRIES: '100' } as NodeJS.ProcessEnv)).toThrow(TypeError);
  });

  it('rejects invalid or non-http(s) URLs', () => {
    expect(() => loadAiConfig({ OLLAMA_BASE_URL: 'not a url' } as NodeJS.ProcessEnv)).toThrow(TypeError);
    expect(() => loadAiConfig({ GEMINI_BASE_URL: 'ftp://example.com' } as NodeJS.ProcessEnv)).toThrow(TypeError);
    expect(() => loadAiConfig({ GEMINI_BASE_URL: 'file:///tmp/x' } as NodeJS.ProcessEnv)).toThrow(TypeError);
  });
});