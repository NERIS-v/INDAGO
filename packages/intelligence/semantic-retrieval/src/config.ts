// ============================================================================
// Embedding configuration (Phase 5A-PR1.5)
//
// Provider selection is EXPLICIT: the platform picks ONE provider at startup
// (EMBEDDING_PROVIDER). There is NO automatic cloud fallback — a provider
// outage surfaces as a typed EmbeddingEngineError, never as a silent switch.
//
// Environment contract (screaming-snake, EMBEDDING_/OLLAMA_ prefixes):
//   EMBEDDING_PROVIDER            'ollama' | 'deterministic-test' (default 'ollama')
//   EMBEDDING_DIMENSIONS          positive int (default 768 — nomic-embed-text / schema)
//   OLLAMA_BASE_URL               default http://localhost:11434
//   OLLAMA_EMBEDDING_MODEL        default nomic-embed-text:latest
//   OLLAMA_TIMEOUT_MS             request timeout (default 30_000)
//   EMBEDDING_BATCH_SIZE          docs per provider call (default 16)
//   EMBEDDING_CONCURRENCY         parallel provider calls (default 2)
//   EMBEDDING_MAX_RETRIES         bounded retries for transient failures (default 2)
//   EMBEDDING_RETRY_BASE_DELAY_MS backoff base (default 250)
//
// FUTURE (documented slot only — never required in V1, no fallback wiring):
//   CLOUD_EMBEDDING_PROVIDER / CLOUD_EMBEDDING_MODEL / CLOUD_EMBEDDING_API_KEY
// ============================================================================

import { EMBEDDING_POLICY_VERSION } from '@indago/contracts';

export type EmbeddingProviderKind = 'ollama' | 'deterministic-test';

export interface PipelineConfig {
  readonly batchSize: number;
  readonly concurrency: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
}

export interface OllamaProviderConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  /** Must equal EmbeddingConfig.dimensions — the storage vector dimension. */
  readonly dimensions: number;
}

export interface EmbeddingConfig {
  readonly provider: EmbeddingProviderKind;
  readonly dimensions: number;
  readonly ollama: OllamaProviderConfig;
  readonly pipeline: PipelineConfig;
}

export const DEFAULT_EMBEDDING_PIPELINE: PipelineConfig = {
  batchSize: 16,
  concurrency: 2,
  maxRetries: 2,
  retryBaseDelayMs: 250,
};

const OLLAMA_DEFAULTS = {
  baseUrl: 'http://localhost:11434',
  model: 'nomic-embed-text:latest',
  timeoutMs: 30_000,
};

function positiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`EMBEDDING_${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

export function loadEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const providerRaw = (env.EMBEDDING_PROVIDER ?? 'ollama').trim();
  if (providerRaw !== 'ollama' && providerRaw !== 'deterministic-test') {
    throw new TypeError(
      `EMBEDDING_PROVIDER must be 'ollama' or 'deterministic-test', got "${providerRaw}"`,
    );
  }

  const dimensions = positiveInt('DIMENSIONS', env.EMBEDDING_DIMENSIONS, 768);

  const timeoutRaw = env.OLLAMA_TIMEOUT_MS?.trim();
  const timeoutMs =
    timeoutRaw === undefined || timeoutRaw === ''
      ? OLLAMA_DEFAULTS.timeoutMs
      : (() => {
          const value = Number.parseInt(timeoutRaw, 10);
          if (!Number.isInteger(value) || value < 1) {
            throw new TypeError(`OLLAMA_TIMEOUT_MS must be a positive integer, got "${timeoutRaw}"`);
          }
          return value;
        })();

  const retryBaseRaw = env.EMBEDDING_RETRY_BASE_DELAY_MS?.trim();
  const retryBaseDelayMs =
    retryBaseRaw === undefined || retryBaseRaw === ''
      ? DEFAULT_EMBEDDING_PIPELINE.retryBaseDelayMs
      : (() => {
          const value = Number.parseInt(retryBaseRaw, 10);
          if (!Number.isInteger(value) || value < 0) {
            throw new TypeError(
              `EMBEDDING_RETRY_BASE_DELAY_MS must be a non-negative integer, got "${retryBaseRaw}"`,
            );
          }
          return value;
        })();

  return {
    provider: providerRaw,
    dimensions,
    ollama: {
      baseUrl: (env.OLLAMA_BASE_URL ?? OLLAMA_DEFAULTS.baseUrl).trim().replace(/\/+$/u, ''),
      model: (env.OLLAMA_EMBEDDING_MODEL ?? OLLAMA_DEFAULTS.model).trim(),
      timeoutMs,
      dimensions,
    },
    pipeline: {
      batchSize: positiveInt('BATCH_SIZE', env.EMBEDDING_BATCH_SIZE, DEFAULT_EMBEDDING_PIPELINE.batchSize),
      concurrency: positiveInt('CONCURRENCY', env.EMBEDDING_CONCURRENCY, DEFAULT_EMBEDDING_PIPELINE.concurrency),
      maxRetries: positiveInt('MAX_RETRIES', env.EMBEDDING_MAX_RETRIES, DEFAULT_EMBEDDING_PIPELINE.maxRetries),
      retryBaseDelayMs,
    },
  };
}

export const EMBEDDING_CONFIG_POLICY_VERSION = EMBEDDING_POLICY_VERSION;