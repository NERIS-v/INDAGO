// ============================================================================
// Ollama GENERATION provider (@indago/ai-agent-runtime)
//
// NOT the Ollama embedding provider — embedding is owned by
// @indago/semantic-retrieval and stays completely separate. This class speaks
// the Ollama chat/generation API:
//   POST {baseUrl}/api/chat   →  text generation (stream: false)
//   GET  {baseUrl}/api/tags   →  health/model-availability probe
// Structured output uses Ollama's `format: "json"` mode as a hint; schema
// enforcement lives in the runtime (the caller's zod schema), never here.
// ============================================================================

import { AiRuntimeError } from '../errors/ai-runtime-error.js';
import type { OllamaProviderConfig } from '../config/types.js';
import { createAbortSignalWithTimeout } from '../reliability/timeout.js';
import type { ResolvedLLMRequest } from '../core/types.js';
import { parseRetryAfterMs } from './http.js';
import type {
  AIProvider,
  AIProviderHealth,
  LLMProviderResult,
  LlmProviderCapabilities,
} from './types.js';

interface OllamaMessage {
  readonly role: string;
  readonly content: string;
}

interface OllamaChatResponse {
  readonly model?: string;
  readonly message?: { role?: string; content?: string };
  readonly done?: boolean;
  readonly done_reason?: string;
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
}

interface OllamaTagsResponse {
  readonly models?: Array<{ name?: string }>;
}

export class OllamaGenerationProvider implements AIProvider {
  readonly capabilities: LlmProviderCapabilities = {
    generate: true,
    generateStructured: true,
    healthCheck: true,
  };

  constructor(readonly config: OllamaProviderConfig) {
    if (config.baseUrl.trim() === '') {
      throw new AiRuntimeError('CONFIGURATION_ERROR', 'Ollama base URL is empty');
    }
  }

  private buildMessages(request: ResolvedLLMRequest): OllamaMessage[] {
    const messages: OllamaMessage[] = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    for (const message of request.messages) {
      messages.push({ role: message.role, content: message.content });
    }
    return messages;
  }

  private buildBody(request: ResolvedLLMRequest): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    if (request.temperature !== undefined) options.temperature = request.temperature;
    if (request.maxOutputTokens > 0) options.num_predict = request.maxOutputTokens;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: this.buildMessages(request),
      stream: false,
      options,
    };
    if (request.responseFormat === 'json') body.format = 'json';
    return body;
  }

  async generate(request: ResolvedLLMRequest): Promise<LLMProviderResult> {
    const url = `${this.config.baseUrl}/api/chat`;
    const signal = createAbortSignalWithTimeout(request.timeoutMs, request.signal);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildBody(request)),
        signal,
      });
    } catch (error) {
      throw this.mapNetworkError(error, request.timeoutMs, request.signal);
    }

    if (!response.ok) {
      throw this.mapHttpError(response, request.model);
    }

    let body: OllamaChatResponse;
    try {
      body = (await response.json()) as OllamaChatResponse;
    } catch (error) {
      throw new AiRuntimeError('INVALID_PROVIDER_RESPONSE', 'Ollama returned non-JSON to /api/chat', {
        cause: error,
      });
    }

    const text = typeof body.message?.content === 'string' ? body.message.content : '';
    const promptTokens =
      typeof body.prompt_eval_count === 'number' ? body.prompt_eval_count : undefined;
    const outputTokens = typeof body.eval_count === 'number' ? body.eval_count : undefined;

    let finishReason: LLMProviderResult['finishReason'] = 'other';
    switch (body.done_reason) {
      case 'stop':
        finishReason = 'stop';
        break;
      case 'length':
        finishReason = 'length';
        break;
      default:
        break;
    }

    return {
      text,
      finishReason,
      modelVersion: typeof body.model === 'string' && body.model !== '' ? body.model : undefined,
      usage:
        promptTokens !== undefined || outputTokens !== undefined
          ? {
              inputTokens: promptTokens,
              outputTokens,
              totalTokens:
                promptTokens !== undefined && outputTokens !== undefined
                  ? promptTokens + outputTokens
                  : undefined,
            }
          : undefined,
    };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const model = this.config.defaultModel ?? '';
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: createAbortSignalWithTimeout(this.config.timeoutMs, undefined),
      });
      if (!response.ok) {
        return { provider: 'ollama', model, healthy: false, error: `Ollama tags endpoint returned HTTP ${response.status}` };
      }
      const body = (await response.json()) as OllamaTagsResponse;
      const tag = model;
      const present =
        tag === ''
          ? true
          : Array.isArray(body.models) && body.models.some((m) => m.name === tag);
      return {
        provider: 'ollama',
        model,
        healthy: present,
        ...(present ? {} : { error: `Ollama model "${tag}" is not installed` }),
      };
    } catch {
      return { provider: 'ollama', model, healthy: false, error: `Ollama at ${this.config.baseUrl} is unreachable` };
    }
  }

  private mapNetworkError(
    error: unknown,
    timeoutMs: number,
    callerSignal: AbortSignal | undefined,
  ): AiRuntimeError {
    const cause = error instanceof Error ? error : new Error(String(error));
    if (callerSignal?.aborted) {
      return new AiRuntimeError('ABORTED', 'Ollama request was cancelled by the caller', {
        cause,
      });
    }
    if (cause.name === 'TimeoutError' || cause.name === 'AbortError') {
      return new AiRuntimeError('REQUEST_TIMEOUT', `Ollama request exceeded ${timeoutMs}ms`, {
        cause,
      });
    }
    return new AiRuntimeError('PROVIDER_UNAVAILABLE', `Ollama at ${this.config.baseUrl} is unreachable`, {
      cause,
    });
  }

  private mapHttpError(response: Response, model: string): AiRuntimeError {
    const status = response.status;
    if (status === 429) {
      return new AiRuntimeError('RATE_LIMITED', 'Ollama rate-limited the request (HTTP 429)', {
        retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
      });
    }
    if (status === 404) {
      return new AiRuntimeError(
        'INVALID_PROVIDER_RESPONSE',
        `Ollama does not have model "${model}" (HTTP 404)`,
      );
    }
    if (status === 408) {
      return new AiRuntimeError('REQUEST_TIMEOUT', 'Ollama request timed out (HTTP 408)');
    }
    if (status >= 400 && status < 500) {
      return new AiRuntimeError('INVALID_PROVIDER_RESPONSE', `Ollama rejected the request (HTTP ${status})`);
    }
    return new AiRuntimeError('PROVIDER_UNAVAILABLE', `Ollama server error (HTTP ${status})`);
  }
}