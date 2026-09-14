// ============================================================================
// Provider abstraction (@indago/ai-agent-runtime)
//
// A single, provider-neutral generative-inference contract. Gemini and Ollama
// generation MUST look identical here — consumers never branch on provider.
// Provider-specific HTTP semantics, response shapes, error formats and usage
// reporting live INSIDE each provider implementation.
//
// Structured output is FIRST-CLASS and provider-native:
//   feature zod schema → JSON Schema representation (runtime) → the provider
//   ENFORCES that schema (Gemini Interactions response_format.schema, Ollama
//   format: <schema>) → response parsed + validated by the caller's zod schema.
// Providers advertise two independent capabilities:
//   - structuredOutput   — provider-enforced structured (JSON) output exists
//   - nativeJsonSchema    — the converted JSON Schema is sent verbatim
//                          (not a language hint, no provider-side schema invention)
// A provider is NOT allowed to weaken the contract. If a call carries a schema
// but the provider cannot enforce it natively, it MUST throw
// UNSUPPORTED_CAPABILITY — there is never a silent fallback to a hint-only mode.
// ============================================================================

import type { AiProviderKind } from '../config/types.js';
import type {
  LLMFinishReason,
  ResolvedLLMRequest,
  LLMUsage,
} from '../core/types.js';

export interface ProviderStructuredCapabilities {
  /** Provider-enforced structured (JSON) output is supported. */
  readonly structuredOutput: boolean;
  /** The converted JSON Schema is sent to the provider verbatim (no hint, no invention). */
  readonly nativeJsonSchema: boolean;
}

export interface LlmProviderCapabilities {
  /** Plain text generation. */
  readonly generate: boolean;
  /** Provider-native structured output capabilities (JSON mode + JSON Schema enforcement). */
  readonly structured: ProviderStructuredCapabilities;
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