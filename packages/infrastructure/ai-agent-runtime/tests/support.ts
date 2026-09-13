import { DEFAULT_AI_BUDGETS } from '../src/budgets/limits.js';
import { AiRuntimeError } from '../src/errors/ai-runtime-error.js';
import type { AiConfig } from '../src/config/types.js';
import type { ResolvedLLMRequest } from '../src/core/types.js';

/** Runs a throwing function and returns the AiRuntimeError code it produced. */
export function thrownCode(run: () => unknown): string {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  if (caught instanceof AiRuntimeError) return caught.code;
  throw new Error(`Expected an AiRuntimeError but got: ${String(caught)}`);
}

export const TEST_GEMINI_KEY = 'AIzaTestSecretKey_DO_NOT_LOG';

export function testConfig(overrides?: Partial<AiConfig>): AiConfig {
  return {
    provider: 'ollama',
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: TEST_GEMINI_KEY,
      timeoutMs: 30_000,
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      timeoutMs: 30_000,
    },
    budgets: DEFAULT_AI_BUDGETS,
    policyVersion: 'v1',
    ...overrides,
  };
}

export function resolvedRequest(overrides?: Partial<ResolvedLLMRequest>): ResolvedLLMRequest {
  return {
    provider: 'ollama',
    model: 'test-model',
    messages: [],
    responseFormat: 'text',
    maxOutputTokens: 512,
    timeoutMs: 5_000,
    budgets: DEFAULT_AI_BUDGETS,
    ...overrides,
  };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  return response;
}

/** Recursively serializes an error (message/stack/cause chain) to a string. */
export function flattenError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current !== undefined && current !== null && depth < 8) {
    if (current instanceof Error) {
      parts.push(current.message);
      if (current.stack) parts.push(current.stack);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      try {
        parts.push(JSON.stringify(current));
      } catch {
        parts.push(String(current));
      }
      break;
    }
    depth += 1;
  }
  return parts.join('\n');
}