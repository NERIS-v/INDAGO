// ============================================================================
// Provider abstraction (@indago/ai-agent-runtime)
//
// A single, provider-neutral generative-inference contract. Gemini and Ollama
// generation MUST look identical here — consumers never branch on provider.
// Provider-specific HTTP semantics, response shapes, error formats and usage
// reporting live INSIDE each provider implementation.
//
// Structured output is a runtime-level capability: providers only produce
// text (honoring an optional JSON mode hint); the runtime parses + validates
// with the caller's zod schema. Providers NEVER see domain schemas.
// ============================================================================

import type { AiProviderKind } from '../config/types.js';
import type {
  LLMFinishReason,
  ResolvedLLMRequest,
  LLMUsage,
} from '../core/types.js';

export interface LlmProviderCapabilities {
  /** Plain text generation. */
  readonly generate: boolean;
  /** JSON-mode generation (responseFormat: 'json'). */
  readonly generateStructured: boolean;
  readonly healthCheck: boolean;
}

/** Provider health probe. Never throws; `healthy===false` carries a safe reason. */
export interface AIProviderHealth {
  readonly provider: AiProviderKind;
  readonly model: string;
  readonly healthy: boolean;
  readonly error?: string;
}

/** Normalized provider execution result. */
export interface LLMProviderResult {
  readonly text: string;
  readonly finishReason: LLMFinishReason;
  readonly modelVersion?: string;
  readonly requestId?: string;
  readonly usage?: LLMUsage;
}

export interface AIProvider {
  /** Resolved request with provider's own model set explicitly. */
  readonly capabilities: LlmProviderCapabilities;
  generate(request: ResolvedLLMRequest): Promise<LLMProviderResult>;
  healthCheck(): Promise<AIProviderHealth>;
}

/** Provider-agnostic finish-reason normalization. Never throws. */
export function normalizeFinishReason(reason: unknown): LLMFinishReason {
  const value = typeof reason === 'string' ? reason.toUpperCase() : '';
  switch (value) {
    case 'STOP':
      return 'stop';
    case 'LENGTH':
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'CONTENT_FILTER':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
      return 'content-filter';
    case 'FINISH_REASON_UNSPECIFIED':
    case '':
      return 'unknown';
    default:
      return 'other';
  }
}