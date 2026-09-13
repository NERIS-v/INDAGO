// ============================================================================
// Gemini provider (@indago/ai-agent-runtime)
//
// First-class provider over the CURRENT official Gemini REST API:
//   POST {baseUrl}/models/{model}:generateContent
// Authentication via the x-goog-api-key header. Structured output is requested
// as a JSON mode hint (responseMimeType: 'application/json'); schema
// enforcement stays in the runtime (the caller's zod schema), never the
// provider.
//
// The REST API is used directly (native fetch, no SDK dependency) so that all
// providers share one transport (timeout/retry/error normalization), matching
// the repository's dependency-free Ollama provider. Using the official
// @google/genai SDK is possible but would duplicate this provider's fetch
// plumbing for no additional capability in this package.
//
// Security: the API key is sent ONLY in the x-goog-api-key header. It never
// appears in URLs, logs, messages, metadata or thrown errors. Error payloads
// are NOT read (a provider response could echo a secret back at us).
// ============================================================================

import { AiRuntimeError } from '../errors/ai-runtime-error.js';
import type { GeminiProviderConfig } from '../config/types.js';
import { createAbortSignalWithTimeout } from '../reliability/timeout.js';
import type { ResolvedLLMRequest } from '../core/types.js';
import { parseRetryAfterMs } from './http.js';
import type {
  AIProvider,
  AIProviderHealth,
  LLMProviderResult,
  LlmProviderCapabilities,
} from './types.js';
import { normalizeFinishReason } from './types.js';

interface GeminiContentItem {
  readonly role?: string;
  readonly parts?: unknown[];
}

interface GeminiCandidate {
  readonly content?: unknown;
  readonly finishReason?: string;
}

interface GeminiUsageMetadata {
  readonly promptTokenCount?: number;
  readonly candidatesTokenCount?: number;
  readonly totalTokenCount?: number;
}

interface GeminiResponseMetadata {
  readonly requestId?: string;
}

interface GeminiGenerateResponse {
  readonly candidates?: Array<GeminiCandidate | Record<string, unknown>>;
  readonly usageMetadata?: GeminiUsageMetadata;
  readonly modelVersion?: string;
  readonly responseMetadata?: GeminiResponseMetadata;
}

interface GeminiTagsResponse {
  readonly models?: unknown[];
}

export class GeminiProvider implements AIProvider {
  readonly capabilities: LlmProviderCapabilities = {
    generate: true,
    generateStructured: true,
    healthCheck: true,
  };

  constructor(readonly config: GeminiProviderConfig) {
    if (config.baseUrl.trim() === '') {
      throw new AiRuntimeError('CONFIGURATION_ERROR', 'Gemini base URL is empty');
    }
  }

  private buildBody(request: ResolvedLLMRequest): Record<string, unknown> {
    const systemParts: string[] = [];
    if (request.systemPrompt) systemParts.push(request.systemPrompt);
    const contents: Array<Record<string, unknown>> = [];
    for (const message of request.messages) {
      if (message.role === 'system') {
        systemParts.push(message.content);
        continue;
      }
      contents.push({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      });
    }

    const body: Record<string, unknown> = { contents };
    if (systemParts.length > 0) {
      body.systemInstruction = { parts: systemParts.map((text) => ({ text })) };
    }

    const generationConfig: Record<string, unknown> = {};
    if (request.maxOutputTokens > 0) generationConfig.maxOutputTokens = request.maxOutputTokens;
    if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.responseFormat === 'json') {
      generationConfig.responseMimeType = 'application/json';
    }
    body.generationConfig = generationConfig;
    return body;
  }

  async generate(request: ResolvedLLMRequest): Promise<LLMProviderResult> {
    const url = `${this.config.baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`;
    const signal = createAbortSignalWithTimeout(request.timeoutMs, request.signal);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify(this.buildBody(request)),
        signal,
      });
    } catch (error) {
      throw this.mapNetworkError(error, request.timeoutMs, request.signal);
    }

    if (!response.ok) {
      throw this.mapHttpError(response, request.model);
    }

    let body: GeminiGenerateResponse;
    try {
      body = (await response.json()) as GeminiGenerateResponse;
    } catch (error) {
      throw new AiRuntimeError(
        'INVALID_PROVIDER_RESPONSE',
        'Gemini returned non-JSON to generateContent',
        { cause: error },
      );
    }

    const candidate = body.candidates?.[0];
    if (!candidate) {
      throw new AiRuntimeError('INVALID_PROVIDER_RESPONSE', 'Gemini returned no candidates');
    }

    const content = candidate.content;
    const parts = typeof content === 'object' && content !== null ? (content as GeminiContentItem) : undefined;
    let text = '';
    if (parts?.parts) {
      for (const part of parts.parts) {
        if (typeof part === 'object' && part !== null && 'text' in part) {
          const raw = (part as { text?: unknown }).text;
          text += typeof raw === 'string' ? raw : '';
        }
      }
    }

    const usage =
      body.usageMetadata !== undefined
        ? {
            inputTokens: body.usageMetadata.promptTokenCount,
            outputTokens: body.usageMetadata.candidatesTokenCount,
            totalTokens: body.usageMetadata.totalTokenCount,
          }
        : undefined;

    return {
      text,
      finishReason: normalizeFinishReason(candidate.finishReason),
      modelVersion:
        typeof body.modelVersion === 'string' && body.modelVersion !== ''
          ? body.modelVersion
          : undefined,
      requestId: body.responseMetadata?.requestId,
      usage,
    };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const model = this.config.defaultModel ?? '';
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers: { 'x-goog-api-key': this.config.apiKey },
        signal: createAbortSignalWithTimeout(this.config.timeoutMs, undefined),
      });
      if (!response.ok) {
        return this.unhealthy(model, `Gemini models endpoint returned HTTP ${response.status}`);
      }
      const body = (await response.json()) as GeminiTagsResponse;
      const present =
        model === ''
          ? true
          : Array.isArray(body.models) &&
            body.models.some((entry) => {
              if (typeof entry !== 'object' || entry === null) return false;
              return (entry as { name?: string }).name === `models/${model}`;
            });
      return {
        provider: 'gemini',
        model,
        healthy: present,
        ...(present ? {} : { error: `Gemini model "${model}" is not available` }),
      };
    } catch (error) {
      return this.unhealthy(model, `Gemini at ${this.config.baseUrl} is unreachable`);
    }
  }

  private unhealthy(model: string, reason: string): AIProviderHealth {
    return { provider: 'gemini', model, healthy: false, error: reason };
  }

  private mapNetworkError(
    error: unknown,
    timeoutMs: number,
    callerSignal: AbortSignal | undefined,
  ): AiRuntimeError {
    const cause = error instanceof Error ? error : new Error(String(error));
    if (callerSignal?.aborted) {
      return new AiRuntimeError('ABORTED', 'Gemini request was cancelled by the caller', {
        cause,
      });
    }
    if (cause.name === 'TimeoutError') {
      return new AiRuntimeError(
        'REQUEST_TIMEOUT',
        `Gemini request exceeded ${timeoutMs}ms`,
        { cause },
      );
    }
    return new AiRuntimeError('PROVIDER_UNAVAILABLE', 'Gemini is unreachable', { cause });
  }

  private mapHttpError(response: Response, model: string): AiRuntimeError {
    const status = response.status;
    if (status === 429) {
      return new AiRuntimeError('RATE_LIMITED', 'Gemini rate-limited the request (HTTP 429)', {
        retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
      });
    }
    if (status === 401 || status === 403) {
      return new AiRuntimeError(
        'AUTHENTICATION_FAILED',
        'Gemini rejected the API key (HTTP 401/403)',
      );
    }
    if (status === 404) {
      return new AiRuntimeError(
        'INVALID_PROVIDER_RESPONSE',
        `Gemini does not provide model "${model}" (HTTP 404)`,
      );
    }
    if (status === 408) {
      return new AiRuntimeError('REQUEST_TIMEOUT', 'Gemini request timed out (HTTP 408)');
    }
    if (status >= 400 && status < 500) {
      return new AiRuntimeError(
        'INVALID_PROVIDER_RESPONSE',
        `Gemini rejected the request (HTTP ${status})`,
      );
    }
    return new AiRuntimeError(
      'PROVIDER_UNAVAILABLE',
      `Gemini server error (HTTP ${status})`,
    );
  }
}