// ============================================================================
// Gemini provider (@indago/ai-agent-runtime)
//
// First-class provider over the CURRENT official Gemini REST API — the
// Interactions API (POST {baseUrl}/interactions). `generateContent` is the
// legacy surface (Google marks it "Legacy"); Interactions is the recommended
// surface since its June-2026 GA and the new step-based response schema is the
// default (no `Api-Revision` opt-in header needed).
//
// Provider-native structured output (v2):
//   - structured call (request.jsonSchema set by the runtime) → the converted
//     JSON Schema is sent VERBATIM in
//       response_format: { type: "text", mime_type: "application/json", schema }
//     The provider enforces that schema; the runtime still parses + zod-validates.
//   - plain generate() with responseFormat 'json' (no schema) → JSON mode hint,
//     response_format without a schema.
//   - multi-turn is stateless via the documented `input` array of typed steps:
//       { type: "user_input",  content: [{ type: "text", text }] }
//       { type: "model_output", content: [{ type: "text", text }] }
//   - response text is extracted from the last `model_output` step's
//     TextContent blocks (the `steps` array is the current response schema;
//     the SDK-only `.output_text` convenience is not part of the REST JSON).
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

interface GeminiInteractionStep {
  readonly type?: string;
  readonly content?: unknown;
}

interface GeminiInteraction {
  readonly id?: string;
  readonly model?: string;
  readonly status?: string;
  readonly steps?: unknown;
  readonly usage?: {
    readonly total_input_tokens?: number;
    readonly total_output_tokens?: number;
    readonly total_tokens?: number;
  };
}

interface GeminiTagsResponse {
  readonly models?: unknown[];
}

export class GeminiProvider implements AIProvider {
  readonly capabilities: LlmProviderCapabilities = {
    generate: true,
    structured: { structuredOutput: true, nativeJsonSchema: true },
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

    const steps: Array<Record<string, unknown>> = [];
    for (const message of request.messages) {
      if (message.role === 'system') {
        systemParts.push(message.content);
        continue;
      }
      steps.push({
        type: message.role === 'assistant' ? 'model_output' : 'user_input',
        content: [{ type: 'text', text: message.content }],
      });
    }

    const body: Record<string, unknown> = {
      model: request.model,
      input: steps,
    };
    if (systemParts.length > 0) {
      body.system_instruction = systemParts.join('\n');
    }

    const generationConfig: Record<string, unknown> = {};
    if (request.maxOutputTokens > 0) {
      generationConfig.max_output_tokens = request.maxOutputTokens;
    }
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generation_config = generationConfig;
    }

    if (request.jsonSchema !== undefined) {
      body.response_format = {
        type: 'text',
        mime_type: 'application/json',
        schema: request.jsonSchema,
      };
    } else if (request.responseFormat === 'json') {
      body.response_format = {
        type: 'text',
        mime_type: 'application/json',
      };
    }

    return body;
  }

  /** Extracts the final model text from the Interactions `steps` timeline. */
  private extractInteractionText(body: GeminiInteraction): string {
    const parts: string[] = [];
    const steps = Array.isArray(body.steps) ? body.steps : [];
    for (const raw of steps) {
      if (typeof raw !== 'object' || raw === null) continue;
      const step = raw as GeminiInteractionStep;
      if (step.type !== 'model_output') continue;

      if (typeof step.content === 'string') {
        parts.push(step.content);
        continue;
      }
      if (!Array.isArray(step.content)) continue;

      for (const block of step.content) {
        if (typeof block !== 'object' || block === null) continue;
        const entry = block as { type?: string; text?: unknown };
        if (entry.type === 'text' && typeof entry.text === 'string') {
          parts.push(entry.text);
        }
      }
    }
    return parts.join('');
  }

  async generate(request: ResolvedLLMRequest): Promise<LLMProviderResult> {
    if (request.jsonSchema !== undefined && !this.capabilities.structured.nativeJsonSchema) {
      // Defense-in-depth: never silently degrade to a hint-only mode.
      throw new AiRuntimeError(
        'UNSUPPORTED_CAPABILITY',
        'Gemini cannot enforce the supplied schema natively; refusing a hint-only fallback',
      );
    }

    const url = `${this.config.baseUrl}/interactions`;
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

    let body: GeminiInteraction;
    try {
      body = (await response.json()) as GeminiInteraction;
    } catch (error) {
      throw new AiRuntimeError(
        'INVALID_PROVIDER_RESPONSE',
        'Gemini returned non-JSON to /interactions',
        { cause: error },
      );
    }

    const text = this.extractInteractionText(body);
    if (text === '') {
      throw new AiRuntimeError(
        'INVALID_PROVIDER_RESPONSE',
        'Gemini returned no text output for the interaction',
      );
    }

    const usage = body.usage !== undefined
      ? {
          inputTokens: body.usage.total_input_tokens,
          outputTokens: body.usage.total_output_tokens,
          totalTokens: body.usage.total_tokens,
        }
      : undefined;

    return {
      text,
      finishReason: body.status === 'completed' ? 'stop' : 'other',
      modelVersion:
        typeof body.model === 'string' && body.model !== '' ? body.model : undefined,
      requestId: typeof body.id === 'string' && body.id !== '' ? body.id : undefined,
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