// ============================================================================
// AI runtime configuration loader (@indago/ai-agent-runtime)
//
// Follows the repository config-loader pattern (cf. loadEmbeddingConfig): all
// values parsed from environment, validated, bounded, and explicitly
// defaulted. Degenerate input (NaN, negatives, infinity, nonsense, non-http
// URLs) is a hard TypeError at load time — never a silent fallback.
//
// Environment contract (screaming-snake, AI_/GEMINI_/OLLAMA_ prefixes):
//   AI_PROVIDER             'gemini' | 'ollama'               (default 'ollama')
//   AI_DEFAULT_MODEL        optional global default model     (none)
//   GEMINI_API_KEY          required for provider 'gemini'    (default '')
//   GEMINI_BASE_URL         Gemini REST base                  (https://generativelanguage.googleapis.com/v1beta)
//   GEMINI_DEFAULT_MODEL    optional                          (falls back to AI_DEFAULT_MODEL)
//   OLLAMA_BASE_URL         default http://localhost:11434
//   OLLAMA_DEFAULT_MODEL    optional                          (falls back to AI_DEFAULT_MODEL)
//   AI_TIMEOUT_MS           request timeout ceiling           (default 60_000)
//   AI_MAX_RETRIES          bounded transient retries         (default 2)
//   AI_RETRY_BASE_DELAY_MS  backoff base                      (default 250)
//   AI_MAX_RETRY_DELAY_MS   backoff ceiling                   (default 8_000)
//   AI_MAX_INPUT_CHARS      context bound                     (default 120_000)
//   AI_MAX_OUTPUT_TOKENS    output bound                      (default 8_192)
//   AI_MAX_REQUEST_MESSAGES message bound                     (default 32)
//   AI_MAX_SCHEMA_BYTES     provider schema bound             (default 50_000)
// ============================================================================

import { AI_RUNTIME_POLICY_VERSION } from '@indago/contracts';

import { DEFAULT_AI_BUDGETS } from '../budgets/limits.js';
import type { AiConfig } from '../config/types.js';
import type { AiProviderKind } from '../config/types.js';

const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

function boundedInt(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(
      `AI_${name} must be an integer in [${min}, ${max}], got "${raw.trim()}"`,
    );
  }
  return value;
}

function optionalString(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function assertHttpUrl(name: string, value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${name} must be a valid URL, got "${value}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError(`${name} must be an http(s) URL, got "${parsed.protocol}//"`);
  }
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const providerRaw = (env.AI_PROVIDER ?? 'ollama').trim();
  if (providerRaw !== 'gemini' && providerRaw !== 'ollama') {
    throw new TypeError(`AI_PROVIDER must be 'gemini' or 'ollama', got "${providerRaw}"`);
  }
  const provider: AiProviderKind = providerRaw;

  const defaultModel = optionalString(env.AI_DEFAULT_MODEL);

  const geminiBaseUrl = (env.GEMINI_BASE_URL ?? GEMINI_DEFAULT_BASE_URL).trim().replace(/\/+$/u, '');
  assertHttpUrl('GEMINI_BASE_URL', geminiBaseUrl);
  const geminiDefaultModel = optionalString(env.GEMINI_DEFAULT_MODEL) ?? defaultModel;

  const ollamaBaseUrl = (env.OLLAMA_BASE_URL ?? OLLAMA_DEFAULT_BASE_URL).trim().replace(/\/+$/u, '');
  assertHttpUrl('OLLAMA_BASE_URL', ollamaBaseUrl);
  const ollamaDefaultModel = optionalString(env.OLLAMA_DEFAULT_MODEL) ?? defaultModel;

  const budgets = {
    maxInputChars: boundedInt('MAX_INPUT_CHARS', env.AI_MAX_INPUT_CHARS, DEFAULT_AI_BUDGETS.maxInputChars, 1, 5_000_000),
    maxOutputTokens: boundedInt('MAX_OUTPUT_TOKENS', env.AI_MAX_OUTPUT_TOKENS, DEFAULT_AI_BUDGETS.maxOutputTokens, 1, 1_000_000),
    maxRequestMessages: boundedInt('MAX_REQUEST_MESSAGES', env.AI_MAX_REQUEST_MESSAGES, DEFAULT_AI_BUDGETS.maxRequestMessages, 1, 10_000),
    timeoutMs: boundedInt('TIMEOUT_MS', env.AI_TIMEOUT_MS, DEFAULT_AI_BUDGETS.timeoutMs, 1, 3_600_000),
    maxRetries: boundedInt('MAX_RETRIES', env.AI_MAX_RETRIES, DEFAULT_AI_BUDGETS.maxRetries, 0, 10),
    retryBaseDelayMs: boundedInt('RETRY_BASE_DELAY_MS', env.AI_RETRY_BASE_DELAY_MS, DEFAULT_AI_BUDGETS.retryBaseDelayMs, 0, 60_000),
    maxRetryDelayMs: boundedInt('MAX_RETRY_DELAY_MS', env.AI_MAX_RETRY_DELAY_MS, DEFAULT_AI_BUDGETS.maxRetryDelayMs, 1, 300_000),
    maxSchemaBytes: boundedInt('MAX_SCHEMA_BYTES', env.AI_MAX_SCHEMA_BYTES, DEFAULT_AI_BUDGETS.maxSchemaBytes, 1, 10_000_000),
  };

  return {
    provider,
    defaultModel,
    gemini: {
      baseUrl: geminiBaseUrl,
      apiKey: (env.GEMINI_API_KEY ?? '').trim(),
      defaultModel: geminiDefaultModel,
      timeoutMs: budgets.timeoutMs,
    },
    ollama: {
      baseUrl: ollamaBaseUrl,
      defaultModel: ollamaDefaultModel,
      timeoutMs: budgets.timeoutMs,
    },
    budgets,
    policyVersion: AI_RUNTIME_POLICY_VERSION,
  };
}