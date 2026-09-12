// ============================================================================
// Ollama embedding provider (Phase 5A-PR1.5)
//
// Speaks the Ollama HTTP API over the single /api/embed endpoint:
//   POST /api/embed { model, input: string[] } → { embeddings: number[][] }
// Batch-submits documents (order preserved), embeds queries via a one-element
// batch, and probes /api/tags for health.
//
// Every failure is mapped to the typed taxonomy (types.ts). Transient codes
// (UNAVAILABLE/TIMEOUT/RATE_LIMITED) are retried by the pipeline, never here.
// ============================================================================

import type { EmbeddingProviderHealth } from '@indago/contracts';
import type { EmbeddingProvider } from '../types.js';
import type { OllamaProviderConfig } from '../config.js';
import { EmbeddingEngineError } from '../types.js';
import { validateEmbeddingVector } from '../vector.js';

interface OllamaEmbedResponse {
  readonly embeddings?: Array<unknown>;
}

function embedUrl(baseUrl: string): string {
  return `${baseUrl}/api/embed`;
}

function tagsUrl(baseUrl: string): string {
  return `${baseUrl}/api/tags`;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly identity: {
    readonly providerId: 'ollama';
    readonly modelId: string;
    readonly modelVersion: string;
    readonly dimensions: number;
    readonly embeddingPolicyVersion: 'v1';
  };

  constructor(readonly config: OllamaProviderConfig) {
    const [modelBase, modelTag] = config.model.split(':');
    this.identity = {
      providerId: 'ollama',
      modelId: modelBase ?? config.model,
      modelVersion: modelTag ?? 'latest',
      dimensions: config.dimensions,
      embeddingPolicyVersion: 'v1',
    };
  }

  private async requestEmbed(input: readonly string[]): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetch(embedUrl(this.config.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, input }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw this.mapNetworkError(error);
    }

    if (response.status === 429) {
      throw new EmbeddingEngineError(
        'PROVIDER_RATE_LIMITED',
        `Ollama is rate-limited (HTTP 429) for model ${this.config.model}`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new EmbeddingEngineError(
        'PROVIDER_INVALID_RESPONSE',
        `Ollama rejected the request with HTTP ${response.status}`,
      );
    }
    if (response.status === 404) {
      throw new EmbeddingEngineError(
        'MODEL_UNSUPPORTED',
        `Ollama does not have model ${this.config.model} (HTTP 404)`,
      );
    }
    if (!response.ok) {
      const detail = await safeText(response);
      throw new EmbeddingEngineError(
        'PROVIDER_INVALID_RESPONSE',
        `Ollama returned HTTP ${response.status}: ${detail}`,
      );
    }

    let body: OllamaEmbedResponse;
    try {
      body = (await response.json()) as OllamaEmbedResponse;
    } catch (error) {
      throw new EmbeddingEngineError(
        'PROVIDER_INVALID_RESPONSE',
        'Ollama returned non-JSON to /api/embed',
        { cause: error },
      );
    }

    const embeddings = body.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== input.length) {
      throw new EmbeddingEngineError(
        'PROVIDER_INVALID_RESPONSE',
        `Ollama replied without matching embeddings array (want ${input.length}, got ${
          embeddings === undefined ? 'none' : embeddings.length
        })`,
      );
    }

    return embeddings.map((vector, index) => {
      if (!Array.isArray(vector) || vector.some((n) => typeof n !== 'number')) {
        throw new EmbeddingEngineError(
          'PROVIDER_INVALID_RESPONSE',
          `Ollama embedding #${index} is not a number array`,
        );
      }
      return validateEmbeddingVector(vector as number[], this.identity.dimensions);
    });
  }

  private mapNetworkError(error: unknown): EmbeddingEngineError {
    if (error instanceof EmbeddingEngineError) return error;
    const cause = error instanceof Error ? error : new Error(String(error));
    if (cause.name === 'TimeoutError' || cause.name === 'AbortError') {
      return new EmbeddingEngineError(
        'PROVIDER_TIMEOUT',
        `Ollama request exceeded ${this.config.timeoutMs}ms`,
        { cause },
      );
    }
    return new EmbeddingEngineError(
      'PROVIDER_UNAVAILABLE',
      `Ollama at ${this.config.baseUrl} is unreachable`,
      { cause },
    );
  }

  async embedDocuments(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.requestEmbed(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.requestEmbed([text]);
    if (vector === undefined) {
      throw new EmbeddingEngineError(
        'PROVIDER_INVALID_RESPONSE',
        'Ollama returned no vector for a single-text request',
      );
    }
    return vector;
  }

  async healthCheck(): Promise<EmbeddingProviderHealth> {
    try {
      const response = await fetch(tagsUrl(this.config.baseUrl), {
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (!response.ok) {
        return {
          providerId: this.identity.providerId,
          modelId: this.identity.modelId,
          modelVersion: this.identity.modelVersion,
          dimensions: this.identity.dimensions,
          healthy: false,
          error: `Ollama tags endpoint returned HTTP ${response.status}`,
        };
      }
      const body = (await response.json()) as { models?: Array<{ name?: string }> };
      const tag = this.config.model;
      const present = Array.isArray(body.models) && body.models.some((m) => m.name === tag);
      return {
        providerId: this.identity.providerId,
        modelId: this.identity.modelId,
        modelVersion: this.identity.modelVersion,
        dimensions: this.identity.dimensions,
        healthy: present,
        ...(present ? {} : { error: `Ollama model "${tag}" is not installed` }),
      };
    } catch (error) {
      return {
        providerId: this.identity.providerId,
        modelId: this.identity.modelId,
        modelVersion: this.identity.modelVersion,
        dimensions: this.identity.dimensions,
        healthy: false,
        error: `Ollama at ${this.config.baseUrl} is unreachable`,
      };
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '';
  }
}