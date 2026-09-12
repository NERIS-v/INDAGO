import { describe, expect, it } from 'vitest';

import { loadEmbeddingConfig, DEFAULT_EMBEDDING_PIPELINE } from '../src/config.js';

describe('loadEmbeddingConfig', () => {
  it('provides sane production defaults (ollama, 768-dim nomic-embed-text)', () => {
    const config = loadEmbeddingConfig({});
    expect(config.provider).toBe('ollama');
    expect(config.dimensions).toBe(768);
    expect(config.ollama).toEqual({
      baseUrl: 'http://localhost:11434',
      model: 'nomic-embed-text:latest',
      timeoutMs: 30_000,
      dimensions: 768,
    });
    expect(config.pipeline).toEqual(DEFAULT_EMBEDDING_PIPELINE);
  });

  it('honours env overrides and strips trailing slashes from the base URL', () => {
    const config = loadEmbeddingConfig({
      EMBEDDING_PROVIDER: 'deterministic-test',
      EMBEDDING_DIMENSIONS: '16',
      OLLAMA_BASE_URL: 'http://localhost:11434///',
      OLLAMA_EMBEDDING_MODEL: 'nomic-embed-text:latest',
      EMBEDDING_BATCH_SIZE: '4',
      EMBEDDING_CONCURRENCY: '2',
    } as NodeJS.ProcessEnv);
    expect(config.provider).toBe('deterministic-test');
    expect(config.dimensions).toBe(16);
    expect(config.ollama.baseUrl).toBe('http://localhost:11434');
    expect(config.pipeline.batchSize).toBe(4);
    expect(config.pipeline.concurrency).toBe(2);
  });

  it('rejects an unknown provider', () => {
    expect(() => loadEmbeddingConfig({ EMBEDDING_PROVIDER: 'cloud' } as NodeJS.ProcessEnv)).toThrow(
      TypeError,
    );
  });

  it('rejects degenerate numeric configuration', () => {
    expect(() =>
      loadEmbeddingConfig({ EMBEDDING_DIMENSIONS: '0' } as NodeJS.ProcessEnv),
    ).toThrow(TypeError);
    expect(() =>
      loadEmbeddingConfig({ EMBEDDING_BATCH_SIZE: 'abc' } as NodeJS.ProcessEnv),
    ).toThrow(TypeError);
    expect(() =>
      loadEmbeddingConfig({ EMBEDDING_PROVIDER: 'ollama', OLLAMA_TIMEOUT_MS: '-5' } as NodeJS.ProcessEnv),
    ).toThrow(TypeError);
  });
});